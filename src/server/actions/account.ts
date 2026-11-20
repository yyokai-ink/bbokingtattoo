'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { assertCan } from '../auth/permissions';
import { getCurrentUser } from '../auth/session';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../auth/password';
import { destroySession } from '../auth/session';
import { anonymizedEmail } from '../auth/utils';
import { redirect } from 'next/navigation';
import { defaultLocale } from '@/i18n/config';
import { localizePath } from '@/i18n/routing';
import type { FormState } from '../auth/form-state';
import { isLocale } from '@/i18n/config';
import { publicMasterWhere, publicStudioWhere } from '../catalog/visibility';

const str = (fd: FormData, k: string) => fd.get(k)?.toString() ?? '';
const id = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);

export async function toggleFavoriteAction(kind: 'master' | 'studio', targetId: string): Promise<{ ok: boolean; favorited?: boolean }> {
  const me = await getCurrentUser();
  if (!me || !id.safeParse(targetId).success || (kind !== 'master' && kind !== 'studio')) return { ok: false };
  assertCan(me.actor, 'favorite:manage');
  const where = kind === 'master' ? { userId: me.id, masterId: targetId } : { userId: me.id, studioId: targetId };
  const existing = await db.favorite.findFirst({ where });
  if (existing) { await db.favorite.delete({ where: { id: existing.id } }); revalidatePath('/', 'layout'); return { ok: true, favorited: false }; }
  const visible = kind === 'master' ? await db.masterProfile.findFirst({ where: { id: targetId, ...publicMasterWhere }, select: { id: true } }) : await db.studioProfile.findFirst({ where: { id: targetId, ...publicStudioWhere }, select: { id: true } });
  if (!visible) return { ok: false };
  try { await db.favorite.create({ data: where }); } catch { /* unique race: already favorited */ }
  revalidatePath('/', 'layout');
  return { ok: true, favorited: true };
}

const profileSchema = z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/) });

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'forbidden' };
  const parsed = profileSchema.safeParse({ firstName: str(fd, 'firstName'), lastName: str(fd, 'lastName'), phone: str(fd, 'phone') });
  const locale = str(fd, 'userLocale');
  if (!parsed.success || !isLocale(locale)) return { error: 'invalidInput' };
  await db.user.update({ where: { id: me.id }, data: { ...parsed.data, phone: parsed.data.phone || null, locale } });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'saved' };
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'forbidden' };
  const next = str(fd, 'newPassword');
  if (checkPasswordStrength(next).length > 0 || next.length > 128) return { error: 'weakPassword' };
  const row = await db.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await verifyPassword(str(fd, 'currentPassword'), row.passwordHash))) return { error: 'invalidCredentials' };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true, message: 'saved' };
}

export async function markNotificationsReadAction(): Promise<void> {
  const me = await getCurrentUser();
  if (!me) return;
  await db.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath('/', 'layout');
}

/**
 * Deletes (anonymises) the account — required by app stores and privacy law. Personal data is removed; bookings, payments and
 * reviews stay for the other parties' history but no longer identify the person. Refused while there are open obligations.
 */
export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'forbidden' };
  const user = await db.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(str(fd, 'password'), user.passwordHash))) return { error: 'invalidCredentials' };
  if (me.actor.platformRoles.includes('SUPER_ADMIN')) return { error: 'forbidden' };
  const now = new Date();
  const [ownsStudio, openAsClient, master] = await Promise.all([
    db.studioProfile.count({ where: { ownerId: me.id, status: { not: 'SUSPENDED' } } }),
    db.booking.count({ where: { clientId: me.id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: now } } }),
    db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true } }),
  ]);
  const openAsMaster = master ? await db.booking.count({ where: { masterId: master.id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: now } } }) : 0;
  if (ownsStudio > 0) return { error: 'deleteOwnsStudio' };
  if (openAsClient + openAsMaster > 0) return { error: 'deleteHasBookings' };
  await db.$transaction([
    db.booking.updateMany({ where: { clientId: me.id }, data: { clientName: 'Deleted user', clientPhone: '-', clientEmail: anonymizedEmail(me.id), clientNote: null } }),
    db.session.deleteMany({ where: { userId: me.id } }), db.authToken.deleteMany({ where: { userId: me.id } }),
    db.favorite.deleteMany({ where: { userId: me.id } }), db.notification.deleteMany({ where: { userId: me.id } }), db.paymentMethod.deleteMany({ where: { userId: me.id } }),
    db.studioMember.updateMany({ where: { userId: me.id, status: 'ACTIVE' }, data: { status: 'ENDED', leftAt: now } }),
    db.subscription.updateMany({ where: { userId: me.id, status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'GRACE'] } }, data: { status: 'CANCELLED', nextBillingAt: null } }),
    ...(master ? [
      db.masterProfile.update({ where: { id: master.id }, data: { status: 'DRAFT', publishedAt: null, displayName: 'Deleted', headline: null, bio: null, avatarUrl: null, coverUrl: null, contactEmail: null, contactPhone: null, socials: Prisma.JsonNull, acceptsBookings: false } }),
      db.portfolioItem.deleteMany({ where: { masterId: master.id } }), db.service.updateMany({ where: { masterId: master.id }, data: { isActive: false } }),
    ] : []),
    db.user.update({ where: { id: me.id }, data: { status: 'DELETED', email: anonymizedEmail(me.id), firstName: 'Deleted', lastName: 'user', phone: null, avatarUrl: null, passwordHash: null } }),
    db.auditLog.create({ data: { actorId: null, action: 'account.delete', entityType: 'user', entityId: me.id } }),
  ]);
  await destroySession();
  redirect(localizePath(defaultLocale, '/'));
}
