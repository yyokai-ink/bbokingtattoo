import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { db } from '../db';
import { newToken, sha256 } from './utils';
import type { Actor, PlatformRole, StudioRole } from './permissions';

export const SESSION_COOKIE = 'lumera_session';
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const raw = newToken();
  const h = headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.session.create({ data: { userId, tokenHash: sha256(raw), expiresAt, userAgent: h.get('user-agent')?.slice(0, 255) ?? null, ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null } });
  cookies().set(SESSION_COOKIE, raw, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) await db.session.deleteMany({ where: { tokenHash: sha256(raw) } });
  cookies().delete(SESSION_COOKIE);
}

export interface CurrentUser { id: string; email: string; firstName: string; lastName: string; phone: string | null; locale: string; timezone: string; emailVerified: boolean; actor: Actor }

/** Resolved once per request. Blocked/deleted users and expired sessions resolve to null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: { include: { roles: true, studioMemberships: { select: { studioId: true, role: true, status: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') return null;
  if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  const u = session.user;
  return {
    id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, locale: u.locale, timezone: u.timezone, emailVerified: !!u.emailVerifiedAt,
    actor: {
      userId: u.id, status: u.status, emailVerified: !!u.emailVerifiedAt,
      platformRoles: u.roles.map((r) => r.role as PlatformRole),
      studioMemberships: u.studioMemberships.map((m) => ({ studioId: m.studioId, role: m.role as StudioRole, status: m.status })),
    },
  };
});
