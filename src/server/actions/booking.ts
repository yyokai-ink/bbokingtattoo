'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { headers } from 'next/headers';
import { getCurrentUser } from '../auth/session';
import { clientIp } from '../auth/utils';
import { BookingError, cancelBookingAsClient, createBooking, createReview, getSlotsForService, providerTransition, rescheduleBooking } from '../booking/service';
import type { FormState } from '../auth/form-state';
import { createRateLimiter } from '../security/rate-limit';

const slotLimit = createRateLimiter({ limit: 60, windowMs: 60_000 });
const writeLimit = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });
const id = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);
const str = (fd: FormData, k: string) => fd.get(k)?.toString() ?? '';
const fail = (e: unknown): FormState => { if (e instanceof BookingError) return { error: e.code }; console.error('[booking action]', e); return { error: 'unexpected' }; };

/** Read-only, public: slots for the booking widget. */
export async function getSlotsAction(masterId: string, serviceId: string) {
  if (!id.safeParse(masterId).success || !id.safeParse(serviceId).success) return null;
  const h = headers();
  if (!slotLimit.check(`slots:${clientIp(h.get('x-forwarded-for'), h.get('x-real-ip'))}`).ok) return null;
  try { return await getSlotsForService(masterId, serviceId); } catch { return null; }
}

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100), phone: z.string().trim().min(7).max(30).regex(/^[+\d\s()-]+$/),
  email: z.string().trim().email().max(254), note: z.string().trim().max(500).optional(),
});

export async function createBookingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'loginRequired' };
  if (!writeLimit.check(`book:${me.id}`).ok) return { error: 'rateLimited' };
  const contact = contactSchema.safeParse({ name: str(fd, 'name'), phone: str(fd, 'phone'), email: str(fd, 'email'), note: str(fd, 'note') || undefined });
  const ids = z.object({ masterId: id, serviceId: id, startsAt: z.string().datetime() }).safeParse({ masterId: str(fd, 'masterId'), serviceId: str(fd, 'serviceId'), startsAt: str(fd, 'startsAt') });
  if (!contact.success || !ids.success) return { error: 'invalid_input' };
  try {
    await createBooking(me.actor, { ...ids.data, contact: contact.data });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'booked' };
  } catch (e) { return fail(e); }
}

export async function cancelBookingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const parsed = id.safeParse(str(fd, 'bookingId'));
  if (!me || !parsed.success) return { error: 'forbidden' };
  try { await cancelBookingAsClient(me.actor, parsed.data); revalidatePath('/', 'layout'); return { ok: true }; } catch (e) { return fail(e); }
}

export async function rescheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const parsed = id.safeParse(str(fd, 'bookingId')); const when = z.string().datetime().safeParse(str(fd, 'startsAt'));
  if (!me || !parsed.success || !when.success) return { error: 'invalid_input' };
  if (!writeLimit.check(`resched:${me.id}`).ok) return { error: 'rateLimited' };
  try { await rescheduleBooking(me.actor, parsed.data, when.data); revalidatePath('/', 'layout'); return { ok: true, message: 'rescheduled' }; } catch (e) { return fail(e); }
}

export async function providerAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const parsed = id.safeParse(str(fd, 'bookingId')); const action = z.enum(['confirm', 'cancel', 'complete']).safeParse(str(fd, 'action'));
  if (!me || !parsed.success || !action.success) return { error: 'forbidden' };
  try { await providerTransition(me.actor, parsed.data, action.data); revalidatePath('/', 'layout'); return { ok: true }; } catch (e) { return fail(e); }
}

export async function reviewAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const parsed = id.safeParse(str(fd, 'bookingId'));
  const rating = Number(str(fd, 'rating')); const text = z.string().trim().max(1000).safeParse(str(fd, 'text'));
  if (!me || !parsed.success || !text.success) return { error: 'invalid_input' };
  if (!writeLimit.check(`review:${me.id}`).ok) return { error: 'rateLimited' };
  try { await createReview(me.actor, parsed.data, rating, text.data); revalidatePath('/', 'layout'); return { ok: true, message: 'reviewSent' }; } catch (e) { return e instanceof Error && e.name === 'ForbiddenError' ? { error: 'forbidden' } : fail(e); }
}
