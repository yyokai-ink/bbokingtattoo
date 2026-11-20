'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { getEnv } from '../env';
import { assertCan, can, ForbiddenError } from '../auth/permissions';
import { getCurrentUser } from '../auth/session';
import { newToken, normalizeEmail, sha256 } from '../auth/utils';
import { BillingError, setStudioCancel, startStudioCheckout } from '../billing/service';
import { sendEmail } from '../email/mailer';
import { getStorage } from '../storage';
import { createRateLimiter } from '../security/rate-limit';
import type { FormState } from '../auth/form-state';
import { geocode } from '../geo/geocode';
import { slugify } from '@/lib/slug';
import { createT } from '@/i18n/translate';
import { defaultLocale, isLocale } from '@/i18n/config';
import { localizePath } from '@/i18n/routing';

const limiter = createRateLimiter({ limit: 30, windowMs: 3_600_000 });
const str = (fd: FormData, k: string) => fd.get(k)?.toString().trim() ?? '';
const loc = (fd: FormData) => { const v = str(fd, 'locale'); return isLocale(v) ? v : defaultLocale; };
const id = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);
const text = (max: number) => z.string().trim().max(max);
const fileUrl = (key: string, prefix: string) => (key && key.startsWith(prefix) && /^[a-zA-Z0-9\/._-]+$/.test(key) && !key.includes('..') ? getStorage().publicUrl(key) : null);
const run = async (fn: () => Promise<FormState>): Promise<FormState> => {
  try { return await fn(); } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'forbidden' };
    if (e instanceof BillingError) return { error: `billing_${e.code}` };
    if (e && typeof e === 'object' && 'digest' in e) throw e; // Next.js redirect()
    console.error('[studio action]', e); return { error: 'unexpected' };
  }
};

export async function createStudioAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'loginRequired' };
  if (!me.emailVerified) return { error: 'verifyFirst' };
  const l = loc(fd);
  const p = z.object({ name: text(100).min(2), address: text(160).min(3), description: text(2000), phone: text(30).regex(/^[+\d\s()-]*$/), email: text(254) })
    .safeParse({ name: str(fd, 'name'), address: str(fd, 'address'), description: str(fd, 'description'), phone: str(fd, 'phone'), email: str(fd, 'email') });
  const cats = fd.getAll('categories').map(String).filter((c) => /^[a-z0-9-]{1,60}$/.test(c));
  if (!p.success || cats.length === 0) return { error: 'invalidInput' };
  const [city, categories] = await Promise.all([db.city.findFirst({ where: { slug: str(fd, 'city'), isActive: true } }), db.category.findMany({ where: { slug: { in: cats }, isActive: true }, select: { id: true } })]);
  if (!city || categories.length === 0) return { error: 'invalidInput' };
  const base = slugify(p.data.name) || 'studio'; let slug = base;
  for (let i = 2; await db.studioProfile.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  const where = await geocode(p.data.address, city.name);
  let studioId = '';
  try {
    studioId = await db.$transaction(async (tx) => {
      const address = await tx.address.create({ data: { countryId: city.countryId, cityId: city.id, line1: p.data.address, latitude: where?.lat ?? null, longitude: where?.lng ?? null } });
      const studio = await tx.studioProfile.create({ data: { ownerId: me.id, slug, name: p.data.name, description: p.data.description || null, cityId: city.id, addressId: address.id, phone: p.data.phone || null, email: p.data.email || null,
        logoUrl: fileUrl(str(fd, 'logoKey'), `studios/${me.id}/`), coverUrl: fileUrl(str(fd, 'coverKey'), `studios/${me.id}/`), status: 'DRAFT', categories: { create: categories.map((c) => ({ categoryId: c.id })) } } });
      const branch = await tx.studioBranch.create({ data: { studioId: studio.id, name: p.data.name, addressId: address.id, isMain: true } });
      await tx.studioMember.create({ data: { studioId: studio.id, userId: me.id, role: 'OWNER', branchId: branch.id, countsAsSeat: false } });
      await tx.userRole.upsert({ where: { userId_role: { userId: me.id, role: 'STUDIO_OWNER' } }, update: {}, create: { userId: me.id, role: 'STUDIO_OWNER' } });
      return studio.id;
    });
  } catch { return { error: 'unexpected' }; }
  redirect(localizePath(l, `/studio-admin/${studioId}`));
}

export async function saveStudioProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const sid = id.safeParse(str(fd, 'studioId'));
    if (!sid.success) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:profile:edit', { studioId: sid.data });
    const p = z.object({ name: text(100).min(2), description: text(2000), phone: text(30).regex(/^[+\d\s()-]*$/), email: text(254), instagram: text(60).regex(/^[A-Za-z0-9._@]*$/) })
      .safeParse({ name: str(fd, 'name'), description: str(fd, 'description'), phone: str(fd, 'phone'), email: str(fd, 'email'), instagram: str(fd, 'instagram') });
    if (!p.success) return { error: 'invalidInput' };
    const logo = fileUrl(str(fd, 'logoKey'), `studios/${me!.id}/`), cover = fileUrl(str(fd, 'coverKey'), `studios/${me!.id}/`);
    await db.studioProfile.update({ where: { id: sid.data }, data: { name: p.data.name, description: p.data.description || null, phone: p.data.phone || null, email: p.data.email || null, socials: { instagram: p.data.instagram.replace(/^@/, '') }, ...(logo ? { logoUrl: logo } : {}), ...(cover ? { coverUrl: cover } : {}) } });
    revalidatePath('/', 'layout'); return { ok: true, message: 'saved' };
  });
}

export async function setStudioPublishedAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const sid = id.safeParse(str(fd, 'studioId'));
    if (!sid.success) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:profile:edit', { studioId: sid.data });
    const publish = str(fd, 'publish') === '1';
    const s = await db.studioProfile.findUnique({ where: { id: sid.data } });
    if (!s || s.status === 'SUSPENDED') return { error: 'forbidden' };
    if (publish && !s.logoUrl) return { error: 'profileIncomplete' };
    await db.studioProfile.update({ where: { id: s.id }, data: { status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? s.publishedAt ?? new Date() : null } });
    revalidatePath('/', 'layout'); return { ok: true, message: publish ? 'published' : 'saved' };
  });
}

export async function addBranchAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const sid = id.safeParse(str(fd, 'studioId'));
    if (!sid.success) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:branches:manage', { studioId: sid.data });
    const p = z.object({ name: text(100).min(2), address: text(160).min(3) }).safeParse({ name: str(fd, 'name'), address: str(fd, 'address') });
    const studio = await db.studioProfile.findUnique({ where: { id: sid.data }, include: { city: true } });
    if (!p.success || !studio) return { error: 'invalidInput' };
    const plan = await db.subscriptionPlan.findFirst({ where: { kind: 'STUDIO', isActive: true } });
    const limit = (plan?.features as { branches?: number } | null)?.branches ?? 3; // plan-controlled limit
    if ((await db.studioBranch.count({ where: { studioId: studio.id, isActive: true } })) >= limit) return { error: 'branchLimit' };
    const where = await geocode(p.data.address, studio.city.name);
    const address = await db.address.create({ data: { countryId: studio.city.countryId, cityId: studio.cityId, line1: p.data.address, latitude: where?.lat ?? null, longitude: where?.lng ?? null } });
    await db.studioBranch.create({ data: { studioId: studio.id, name: p.data.name, addressId: address.id } });
    revalidatePath('/', 'layout'); return { ok: true, message: 'saved' };
  });
}

export async function inviteMasterAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const sid = id.safeParse(str(fd, 'studioId')); const email = z.string().email().max(254).safeParse(str(fd, 'email').toLowerCase());
    if (!sid.success || !email.success) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:team:invite', { studioId: sid.data });
    if (!limiter.check(`invite:${me!.id}`).ok) return { error: 'rateLimited' };
    const addr = normalizeEmail(email.data);
    const studio = await db.studioProfile.findUnique({ where: { id: sid.data }, select: { name: true } });
    const existingUser = await db.user.findUnique({ where: { email: addr }, select: { id: true, locale: true } });
    if (existingUser && await db.studioMember.findFirst({ where: { studioId: sid.data, userId: existingUser.id, status: 'ACTIVE' } })) return { error: 'alreadyMember' };
    if (await db.studioInvitation.findFirst({ where: { studioId: sid.data, email: addr, status: 'PENDING', expiresAt: { gt: new Date() } } })) return { error: 'inviteExists' };
    const token = newToken();
    await db.studioInvitation.create({ data: { studioId: sid.data, invitedById: me!.id, email: addr, userId: existingUser?.id ?? null, role: 'MASTER', tokenHash: sha256(token), expiresAt: new Date(Date.now() + 14 * 864e5) } });
    const l = isLocale(existingUser?.locale) ? existingUser!.locale as 'uk' | 'en' : loc(fd); const t = createT(l);
    await sendEmail({ to: addr, subject: t('email.invite.subject', { studio: studio?.name ?? '' }), text: t('email.invite.body', { studio: studio?.name ?? '', link: `${getEnv().APP_URL}${localizePath(l, '/studio-invite')}?token=${token}` }) });
    revalidatePath('/', 'layout'); return { ok: true, message: 'inviteSent' };
  });
}

export async function revokeInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const iid = id.safeParse(str(fd, 'invitationId'));
    if (!iid.success) return { error: 'invalidInput' };
    const inv = await db.studioInvitation.findUnique({ where: { id: iid.data } });
    if (!inv) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:team:invite', { studioId: inv.studioId });
    await db.studioInvitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'REVOKED', respondedAt: new Date() } });
    revalidatePath('/', 'layout'); return { ok: true };
  });
}

/** The invitee decides. The invitation e-mail must match the logged-in account; token is single-use; same StudioMember row is re-activated (no second fee). */
export async function respondInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser();
    if (!me) return { error: 'loginRequired' };
    const inv = await db.studioInvitation.findUnique({ where: { tokenHash: sha256(str(fd, 'token')) }, include: { studio: { select: { id: true, status: true } } } });
    if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) return { error: 'tokenInvalid' };
    if (normalizeEmail(me.email) !== inv.email || !me.emailVerified) return { error: 'inviteWrongAccount' };
    if (str(fd, 'decision') === 'decline') { await db.studioInvitation.update({ where: { id: inv.id }, data: { status: 'DECLINED', respondedAt: new Date(), userId: me.id } }); return { ok: true, message: 'inviteDeclined' }; }
    const master = await db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true, allowMultiStudio: true } });
    if (!master) return { error: 'needMasterProfile' };
    if (!master.allowMultiStudio && await db.studioMember.count({ where: { userId: me.id, status: 'ACTIVE', studioId: { not: inv.studioId } } }) > 0) return { error: 'multiStudioNotAllowed' };
    const branch = inv.branchId ?? (await db.studioBranch.findFirst({ where: { studioId: inv.studioId, isMain: true }, select: { id: true } }))?.id ?? null;
    await db.$transaction([
      db.studioMember.upsert({ where: { studioId_userId: { studioId: inv.studioId, userId: me.id } },
        update: { status: 'ACTIVE', leftAt: null, joinedAt: new Date(), masterId: master.id, role: inv.role, branchId: branch, countsAsSeat: inv.role === 'MASTER' }, // connectionFeePaidAt untouched on purpose
        create: { studioId: inv.studioId, userId: me.id, masterId: master.id, role: inv.role, branchId: branch, countsAsSeat: inv.role === 'MASTER' } }),
      db.studioInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', respondedAt: new Date(), userId: me.id } }),
    ]);
    revalidatePath('/', 'layout'); return { ok: true, message: 'inviteAccepted' };
  });
}

export async function removeMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const mid = id.safeParse(str(fd, 'memberId'));
    if (!mid.success) return { error: 'invalidInput' };
    const m = await db.studioMember.findUnique({ where: { id: mid.data } });
    if (!m) return { error: 'invalidInput' };
    assertCan(me?.actor, 'studio:team:remove', { studioId: m.studioId, targetRole: m.role }); // owners can never be removed; admins remove only masters
    await db.studioMember.update({ where: { id: m.id }, data: { status: 'ENDED', leftAt: new Date() } }); // profile, portfolio and reviews stay with the master
    revalidatePath('/', 'layout'); return { ok: true };
  });
}

export async function setMemberRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const mid = id.safeParse(str(fd, 'memberId')); const role = str(fd, 'role');
    if (!mid.success || (role !== 'ADMIN' && role !== 'MASTER')) return { error: 'invalidInput' };
    const m = await db.studioMember.findUnique({ where: { id: mid.data } });
    if (!m || m.role === 'OWNER') return { error: 'forbidden' };
    assertCan(me?.actor, 'studio:team:manage_roles', { studioId: m.studioId });
    await db.studioMember.update({ where: { id: m.id }, data: { role, countsAsSeat: role === 'MASTER' } });
    revalidatePath('/', 'layout'); return { ok: true };
  });
}

/** Master-side: allow/deny the studio to upload to their portfolio, or leave the studio. Always scoped to the caller's own membership. */
export async function masterMembershipAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getCurrentUser(); const mid = id.safeParse(str(fd, 'memberId'));
    if (!me || !mid.success) return { error: 'forbidden' };
    const m = await db.studioMember.findFirst({ where: { id: mid.data, userId: me.id, status: 'ACTIVE', role: { not: 'OWNER' } } });
    if (!m) return { error: 'forbidden' };
    if (str(fd, 'action') === 'leave') await db.studioMember.update({ where: { id: m.id }, data: { status: 'ENDED', leftAt: new Date() } });
    else await db.studioMember.update({ where: { id: m.id }, data: { portfolioConsent: str(fd, 'consent') === '1' } });
    revalidatePath('/', 'layout'); return { ok: true };
  });
}

export async function studioBillingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const sid = id.safeParse(str(fd, 'studioId')); const action = str(fd, 'action');
  if (!me || !sid.success) return { error: 'forbidden' };
  if (!limiter.check(`sbill:${me.id}`).ok) return { error: 'rateLimited' };
  let url: string | null = null;
  const res = await run(async () => {
    if (action === 'subscribe' || action === 'fees') url = await startStudioCheckout(me.actor, sid.data, action === 'fees' ? 'fees' : 'subscription', loc(fd));
    else if (action === 'cancel' || action === 'resume') { await setStudioCancel(me.actor, sid.data, action === 'cancel'); revalidatePath('/', 'layout'); return { ok: true, message: 'saved' }; }
    return { error: 'invalidInput' };
  });
  if (url) redirect(url);
  return res;
}
