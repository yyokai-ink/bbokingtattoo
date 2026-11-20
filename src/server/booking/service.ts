import { Prisma } from '@prisma/client';
import { db } from '../db';
import { assertCan, can, type Actor } from '../auth/permissions';
import { loadSlots } from '../catalog/search';
import { bookableMasterWhere, publicMasterWhere } from '../catalog/visibility';
import { localDateParts } from './slots';
import { ACTIVE_STATUSES, MAX_ACTIVE_FUTURE_BOOKINGS, canClientCancel, canProviderCancel, canProviderComplete, canProviderConfirm, canReschedule, canReview, type BookingStatus } from './rules';
import { notify, type NotificationParams } from '../notifications';
import { recomputeRatings } from '../reviews/ratings';

export type BookingErrorCode = 'forbidden' | 'not_found' | 'slot_unavailable' | 'too_many' | 'own_service' | 'no_price' | 'invalid_state' | 'too_late' | 'invalid_input' | 'provider_limited';
export class BookingError extends Error { constructor(public readonly code: BookingErrorCode) { super(code); this.name = 'BookingError'; } }

const day = (iso: string, tz: string) => { const { y, m, d } = localDateParts(new Date(iso), tz); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

async function loadBookableService(masterId: string, serviceId: string) {
  const visible = await db.service.findFirst({ where: { id: serviceId, masterId, isActive: true, master: { is: publicMasterWhere } }, select: { id: true } });
  if (!visible) throw new BookingError('not_found');
  const bookable = await db.masterProfile.findFirst({ where: { id: masterId, ...bookableMasterWhere }, select: { id: true } });
  if (!bookable) throw new BookingError('provider_limited'); // visible but subscription in grace period: new bookings are disabled
  const svc = await db.service.findFirst({
    where: { id: serviceId, masterId, isActive: true },
    include: { prices: { where: { currency: 'UAH' } }, master: { select: { id: true, userId: true, displayName: true, city: { select: { timezone: true } },
      memberships: { where: { status: 'ACTIVE' }, take: 1, select: { studioId: true, branchId: true } } } } },
  });
  if (!svc || !svc.master) throw new BookingError('not_found');
  return svc as typeof svc & { master: NonNullable<typeof svc.master> };
}

/** Public: free slots for a SPECIFIC service (its own duration + buffer), next `days` days. */
export async function getSlotsForService(masterId: string, serviceId: string, days = 14) {
  const svc = await loadBookableService(masterId, serviceId);
  const map = await loadSlots([masterId], { days, service: { durationMin: svc.durationMin, bufferMin: svc.bufferMin } });
  const tz = svc.master.city.timezone;
  const byDay = new Map<string, string[]>();
  for (const s of map.get(masterId) ?? []) (byDay.get(day(s.toISOString(), tz)) ?? byDay.set(day(s.toISOString(), tz), []).get(day(s.toISOString(), tz))!).push(s.toISOString());
  return { timezone: tz, days: [...byDay.entries()].map(([date, times]) => ({ date, times })) };
}

const paramsOf = (name: string, service: string, startsAt: Date, timezone: string, other: string): NotificationParams => ({ service, startsAt: startsAt.toISOString(), timezone, name: other });

/** Serialises writers per master with a transaction-level advisory lock, re-checks overlap, then inserts/updates.
 *  The EXCLUDE constraint (npm run db:constraints) remains the last line of defence. */
async function withMasterLock<T>(masterId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await db.$transaction(async (tx) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${masterId}))`; return fn(tx); }, { timeout: 10_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('booking_no_overlap') || msg.includes('23P01')) throw new BookingError('slot_unavailable');
    throw err;
  }
}

async function assertSlotFree(tx: Prisma.TransactionClient, masterId: string, startsAt: Date, endsAt: Date, ignoreBookingId?: string) {
  const clash = await tx.booking.findFirst({ where: { masterId, status: { in: [...ACTIVE_STATUSES] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}) }, select: { id: true } });
  if (clash) throw new BookingError('slot_unavailable');
}

async function assertOnOfferedGrid(masterId: string, svc: { durationMin: number; bufferMin: number }, tz: string, startsAt: Date) {
  const map = await loadSlots([masterId], { days: 1, startDate: day(startsAt.toISOString(), tz), service: { durationMin: svc.durationMin, bufferMin: svc.bufferMin } });
  if (!(map.get(masterId) ?? []).some((s) => s.getTime() === startsAt.getTime())) throw new BookingError('slot_unavailable'); // not working / break / too soon / off-grid
}

export interface ContactInput { name: string; phone: string; email: string; note?: string }

export async function createBooking(actor: Actor | null, input: { masterId: string; serviceId: string; startsAt: string; contact: ContactInput }) {
  if (!can(actor, 'booking:create')) throw new BookingError('forbidden');
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new BookingError('invalid_input');
  const svc = await loadBookableService(input.masterId, input.serviceId);
  if (svc.master.userId === actor!.userId) throw new BookingError('own_service');
  const price = svc.prices[0];
  if (!price) throw new BookingError('no_price');
  const active = await db.booking.count({ where: { clientId: actor!.userId, status: { in: [...ACTIVE_STATUSES] }, startsAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE_FUTURE_BOOKINGS) throw new BookingError('too_many');
  await assertOnOfferedGrid(svc.master.id, svc, svc.master.city.timezone, startsAt);

  const endsAt = new Date(startsAt.getTime() + (svc.durationMin + svc.bufferMin) * 60_000);
  const studio = svc.master.memberships[0];
  const booking = await withMasterLock(svc.master.id, async (tx) => {
    await assertSlotFree(tx, svc.master.id, startsAt, endsAt);
    return tx.booking.create({ data: {
      clientId: actor!.userId, masterId: svc.master.id, studioId: studio?.studioId ?? null, branchId: studio?.branchId ?? null, serviceId: svc.id,
      startsAt, endsAt, timezone: svc.master.city.timezone, status: 'PENDING', priceMinor: price.amountMinor, currency: price.currency,
      clientName: input.contact.name, clientPhone: input.contact.phone, clientEmail: input.contact.email, clientNote: input.contact.note ?? null,
    } });
  });
  const tz = svc.master.city.timezone;
  await Promise.all([
    notify(svc.master.userId, 'booking.new', paramsOf(svc.master.displayName, svc.name, startsAt, tz, input.contact.name)),
    notify(actor!.userId, 'booking.created', paramsOf(svc.master.displayName, svc.name, startsAt, tz, svc.master.displayName)),
  ]);
  return booking;
}

async function loadBookingFor(id: string) {
  const b = await db.booking.findUnique({ where: { id }, include: { service: true, master: { select: { id: true, userId: true, displayName: true, city: { select: { timezone: true } } } }, review: { select: { id: true } } } });
  if (!b) throw new BookingError('not_found');
  return b;
}

export async function cancelBookingAsClient(actor: Actor | null, bookingId: string) {
  const b = await loadBookingFor(bookingId);
  if (!can(actor, 'booking:manage_own', { clientUserId: b.clientId })) throw new BookingError('not_found'); // do not reveal other people's ids
  if (!canClientCancel(b.status as BookingStatus, b.startsAt)) throw new BookingError('invalid_state');
  await db.booking.updateMany({ where: { id: b.id, status: { in: [...ACTIVE_STATUSES] } }, data: { status: 'CANCELLED_BY_CLIENT', cancelledAt: new Date() } });
  await notify(b.master.userId, 'booking.cancelled', paramsOf(b.master.displayName, b.service.name, b.startsAt, b.timezone, b.clientName));
}

export async function rescheduleBooking(actor: Actor | null, bookingId: string, newStartsAtIso: string) {
  const b = await loadBookingFor(bookingId);
  if (!can(actor, 'booking:manage_own', { clientUserId: b.clientId })) throw new BookingError('not_found');
  if (!canReschedule(b.status as BookingStatus, b.startsAt)) throw new BookingError('too_late');
  const startsAt = new Date(newStartsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw new BookingError('invalid_input');
  await assertOnOfferedGrid(b.masterId, b.service, b.timezone, startsAt);
  const endsAt = new Date(startsAt.getTime() + (b.service.durationMin + b.service.bufferMin) * 60_000);
  await withMasterLock(b.masterId, async (tx) => {
    await assertSlotFree(tx, b.masterId, startsAt, endsAt, b.id);
    await tx.booking.update({ where: { id: b.id }, data: { startsAt, endsAt, status: 'PENDING' } }); // provider must re-confirm
  });
  await notify(b.master.userId, 'booking.rescheduled', paramsOf(b.master.displayName, b.service.name, startsAt, b.timezone, b.clientName));
}

/** Provider-side transitions. Authorisation = "I am the owner of this master profile" (studio staff arrive in Stage 4). */
export async function providerTransition(actor: Actor | null, bookingId: string, action: 'confirm' | 'cancel' | 'complete') {
  const b = await loadBookingFor(bookingId);
  const isMaster = can(actor, 'master:bookings:manage', { masterUserId: b.master.userId });
  const isStudioStaff = !!b.studioId && can(actor, 'studio:bookings:manage', { studioId: b.studioId }); // OWNER/ADMIN of the studio the booking belongs to
  if (!isMaster && !isStudioStaff) throw new BookingError('not_found');
  const status = b.status as BookingStatus;
  const p = paramsOf(b.master.displayName, b.service.name, b.startsAt, b.timezone, b.master.displayName);
  if (action === 'confirm') {
    if (!canProviderConfirm(status)) throw new BookingError('invalid_state');
    const { count } = await db.booking.updateMany({ where: { id: b.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    if (count) await notify(b.clientId, 'booking.confirmed', p);
  } else if (action === 'cancel') {
    if (!canProviderCancel(status)) throw new BookingError('invalid_state');
    const { count } = await db.booking.updateMany({ where: { id: b.id, status: { in: [...ACTIVE_STATUSES] } }, data: { status: 'CANCELLED_BY_PROVIDER', cancelledAt: new Date() } });
    if (count) await notify(b.clientId, 'booking.cancelled', p);
  } else {
    if (!canProviderComplete(status, b.startsAt)) throw new BookingError('invalid_state');
    const { count } = await db.booking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'COMPLETED' } });
    if (count) { await db.masterProfile.update({ where: { id: b.masterId }, data: { bookingCount: { increment: 1 } } }); await notify(b.clientId, 'booking.completed', p); }
  }
}

export async function createReview(actor: Actor | null, bookingId: string, rating: number, text: string | undefined) {
  const b = await loadBookingFor(bookingId);
  assertCan(actor, 'review:create', { clientUserId: b.clientId, bookingCompleted: b.status === 'COMPLETED' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BookingError('invalid_input');
  if (!canReview(b.status as BookingStatus, b.startsAt, !!b.review)) throw new BookingError('invalid_state');
  try {
    // bookingId is UNIQUE: one review per real, completed booking. New reviews wait for moderation (Stage 4 admin).
    await db.review.create({ data: { bookingId: b.id, authorId: b.clientId, masterId: b.masterId, studioId: b.studioId, rating, text: text?.trim() || null, status: 'PENDING' } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BookingError('invalid_state');
    throw e;
  }
}

export { recomputeRatings };
