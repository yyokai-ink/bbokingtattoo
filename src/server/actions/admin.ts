'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../db';
import { assertCan, ForbiddenError, can } from '../auth/permissions';
import { getCurrentUser } from '../auth/session';
import { recomputeRatings } from '../reviews/ratings';
import type { FormState } from '../auth/form-state';

const id = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);
const str = (fd: FormData, k: string) => fd.get(k)?.toString() ?? '';

/** Every admin action re-authorises on the server and writes an audit-log row. Failure → generic 'forbidden'. */
async function admin(permission: Parameters<typeof can>[1]) {
  const me = await getCurrentUser();
  assertCan(me?.actor, permission);
  return me!;
}
const wrap = async (fn: () => Promise<FormState>): Promise<FormState> => {
  try { return await fn(); } catch (e) { if (e instanceof ForbiddenError) return { error: 'forbidden' }; console.error('[admin action]', e); return { error: 'unexpected' }; }
};

export async function setUserBlockedAction(_: FormState, fd: FormData): Promise<FormState> {
  return wrap(async () => {
    const me = await admin('admin:users:manage');
    const userId = id.safeParse(str(fd, 'userId')); const block = str(fd, 'block') === '1';
    if (!userId.success || userId.data === me.id) return { error: 'invalidInput' }; // an admin cannot block themselves
    const target = await db.user.findUnique({ where: { id: userId.data }, include: { roles: true } });
    if (!target || target.roles.some((r) => r.role === 'SUPER_ADMIN')) return { error: 'forbidden' };
    await db.$transaction([
      db.user.update({ where: { id: target.id }, data: { status: block ? 'BLOCKED' : 'ACTIVE' } }),
      ...(block ? [db.session.deleteMany({ where: { userId: target.id } })] : []), // blocking signs the user out immediately
      db.auditLog.create({ data: { actorId: me.id, action: block ? 'user.block' : 'user.unblock', entityType: 'user', entityId: target.id } }),
    ]);
    revalidatePath('/', 'layout');
    return { ok: true };
  });
}

export async function moderateReviewAction(_: FormState, fd: FormData): Promise<FormState> {
  return wrap(async () => {
    const me = await admin('admin:moderation');
    const reviewId = id.safeParse(str(fd, 'reviewId')); const decision = str(fd, 'decision');
    const note = z.string().trim().max(300).safeParse(str(fd, 'note'));
    if (!reviewId.success || !note.success || (decision !== 'approve' && decision !== 'reject')) return { error: 'invalidInput' };
    const review = await db.review.findUnique({ where: { id: reviewId.data } });
    if (!review) return { error: 'invalidInput' };
    const status = decision === 'approve' ? 'PUBLISHED' : 'REJECTED';
    await db.$transaction([
      db.review.update({ where: { id: review.id }, data: { status, moderationNote: note.data || null, publishedAt: status === 'PUBLISHED' ? new Date() : null } }),
      db.auditLog.create({ data: { actorId: me.id, action: `review.${decision}`, entityType: 'review', entityId: review.id } }),
    ]);
    await recomputeRatings(review.masterId, review.studioId); // ratings are derived from PUBLISHED reviews only
    revalidatePath('/', 'layout');
    return { ok: true };
  });
}

const money = z.coerce.number().min(0).max(1_000_000);

export async function updatePlanAction(_: FormState, fd: FormData): Promise<FormState> {
  return wrap(async () => {
    const me = await admin('admin:plans:manage');
    const planId = id.safeParse(str(fd, 'planId'));
    const price = money.safeParse(str(fd, 'price'));
    const seat = str(fd, 'seat') === '' ? null : money.safeParse(str(fd, 'seat'));
    const fee = str(fd, 'fee') === '' ? null : money.safeParse(str(fd, 'fee'));
    if (!planId.success || !price.success || (seat && !seat.success) || (fee && !fee.success)) return { error: 'invalidInput' };
    const before = await db.subscriptionPlan.findUnique({ where: { id: planId.data } });
    if (!before) return { error: 'invalidInput' };
    const toMinor = (n: number) => Math.round(n * 100);
    const data = {
      priceMinor: toMinor(price.data), isActive: str(fd, 'active') === '1',
      ...(before.kind === 'STUDIO' ? { seatPriceMinor: seat?.success ? toMinor(seat.data) : null, connectionFeeMinor: fee?.success ? toMinor(fee.data) : null } : {}),
    };
    await db.$transaction([
      db.subscriptionPlan.update({ where: { id: before.id }, data }), // applies to FUTURE charges; existing pending payments keep their amount
      db.auditLog.create({ data: { actorId: me.id, action: 'plan.update', entityType: 'plan', entityId: before.id, meta: { before: { priceMinor: before.priceMinor, seatPriceMinor: before.seatPriceMinor, connectionFeeMinor: before.connectionFeeMinor, isActive: before.isActive }, after: data } } }),
    ]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'saved' };
  });
}

import { getStorage } from '../storage';
import { APPEARANCE_KEY, normalizeAppearance } from '../site-settings';
import { locales } from '@/i18n/config';

/** Keys come from /api/upload (site/media/…); the public URL is rebuilt on the server, so no arbitrary URL can be injected. */
const siteKey = (v: string) => (/^site\/media\/[a-f0-9-]{36}\.(jpg|png|webp|avif|mp4|webm)$/.test(v) ? v : null);

export async function saveAppearanceAction(_: FormState, fd: FormData): Promise<FormState> {
  return wrap(async () => {
    const me = await admin('admin:content:manage');
    const storage = getStorage();
    const current = normalizeAppearance((await db.siteSetting.findUnique({ where: { key: APPEARANCE_KEY } }))?.value);
    const pick = (field: string, existing: string | null) => {
      if (str(fd, `${field}Remove`) === '1') return null;
      const key = siteKey(str(fd, `${field}Key`));
      return key ? storage.publicUrl(key) : existing;
    };
    const heroUrl = pick('hero', current.heroUrl);
    const isVideo = !!heroUrl && /\.(mp4|webm)$/.test(heroUrl);
    const text = (prefix: string) => Object.fromEntries(locales.map((l) => [l, str(fd, `${prefix}_${l}`).trim().slice(0, 200)]).filter(([, v]) => v));
    const overlay = Number(str(fd, 'overlay'));
    const next = normalizeAppearance({
      heroKind: heroUrl ? (isVideo ? 'video' : 'image') : 'none', heroUrl, heroPosterUrl: pick('poster', current.heroPosterUrl),
      heroOverlay: Number.isFinite(overlay) ? overlay : current.heroOverlay, logoUrl: pick('logo', current.logoUrl), companyName: str(fd, 'companyName'), contactEmail: str(fd, 'contactEmail'), ctaBgUrl: pick('cta', current.ctaBgUrl),
      heroTitle: text('title'), heroSubtitle: text('subtitle'),
    });
    await db.$transaction([
      db.siteSetting.upsert({ where: { key: APPEARANCE_KEY }, update: { value: next as object }, create: { key: APPEARANCE_KEY, value: next as object } }),
      db.auditLog.create({ data: { actorId: me.id, action: 'site.appearance', entityType: 'site', meta: { heroKind: next.heroKind } } }),
    ]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'saved' };
  });
}
