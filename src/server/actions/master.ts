'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { can } from '../auth/permissions';
import { getCurrentUser } from '../auth/session';
import { getStorage } from '../storage';
import { localToUtc } from '../booking/slots';
import { buildWeekly, missingForPublish, uahToMinor } from '../master/rules';
import type { FormState } from '../auth/form-state';
import { geocode } from '../geo/geocode';
import { slugify } from '@/lib/slug';
import { defaultLocale, isLocale } from '@/i18n/config';
import { localizePath } from '@/i18n/routing';

const str = (fd: FormData, k: string) => fd.get(k)?.toString().trim() ?? '';
const loc = (fd: FormData) => { const v = str(fd, 'locale'); return isLocale(v) ? v : defaultLocale; };
const id = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);
const text = (max: number) => z.string().trim().max(max);

/** The master profile is ALWAYS resolved from the session user — never from an id sent by the browser. */
async function own() {
  const me = await getCurrentUser();
  if (!me || !me.emailVerified) return null;
  if (!can(me.actor, 'master:profile:edit', { masterUserId: me.id })) return null;
  const profile = await db.masterProfile.findUnique({ where: { userId: me.id }, include: { city: { select: { timezone: true, name: true, countryId: true } }, address: { select: { id: true, line1: true } } } });
  return profile ? { me, profile } : null;
}
const fileUrl = (key: string, prefix: string) => (key && key.startsWith(prefix) && /^[a-zA-Z0-9\/._-]+$/.test(key) && !key.includes('..') ? getStorage().publicUrl(key) : null);

/** Step 1 of onboarding: creates a DRAFT profile and the MASTER role. Visible nowhere until published + paid. */
export async function becomeMasterAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'loginRequired' };
  if (!me.emailVerified) return { error: 'verifyFirst' };
  const l = loc(fd);
  if (await db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true } })) redirect(localizePath(l, '/dashboard/profile'));
  const p = z.object({ displayName: text(80).min(2), city: text(80).min(1), headline: text(120), bio: text(2000), exp: z.coerce.number().int().min(1960).max(new Date().getFullYear()).optional() })
    .safeParse({ displayName: str(fd, 'displayName') || `${me.firstName} ${me.lastName}`, city: str(fd, 'city'), headline: str(fd, 'headline'), bio: str(fd, 'bio'), exp: str(fd, 'experienceSince') || undefined });
  const cats = fd.getAll('categories').map(String).filter((c) => /^[a-z0-9-]{1,60}$/.test(c));
  if (!p.success || cats.length === 0) return { error: 'invalidInput' };
  const [city, categories] = await Promise.all([db.city.findFirst({ where: { slug: p.data.city, isActive: true } }), db.category.findMany({ where: { slug: { in: cats }, isActive: true }, select: { id: true } })]);
  if (!city || categories.length === 0) return { error: 'invalidInput' };
  const base = slugify(p.data.displayName) || 'master';
  let slug = base;
  for (let i = 2; await db.masterProfile.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  try {
    await db.$transaction([
      db.masterProfile.create({ data: { userId: me.id, slug, displayName: p.data.displayName, headline: p.data.headline || null, bio: p.data.bio || null, experienceSince: p.data.exp ?? null, cityId: city.id, status: 'DRAFT', categories: { create: categories.map((c) => ({ categoryId: c.id })) } } }),
      db.userRole.upsert({ where: { userId_role: { userId: me.id, role: 'MASTER' } }, update: {}, create: { userId: me.id, role: 'MASTER' } }),
    ]);
  } catch { return { error: 'unexpected' }; }
  redirect(localizePath(l, '/dashboard/profile'));
}

export async function saveProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); if (!o) return { error: 'forbidden' };
  const p = z.object({ displayName: text(80).min(2), headline: text(120), bio: text(2000), workAreaNote: text(160), phone: text(30).regex(/^[+\d\s()-]*$/), email: text(254), instagram: text(60).regex(/^[A-Za-z0-9._@]*$/), telegram: text(60).regex(/^[A-Za-z0-9_@]*$/), exp: z.coerce.number().int().min(1960).max(new Date().getFullYear()).optional() })
    .safeParse({ displayName: str(fd, 'displayName'), headline: str(fd, 'headline'), bio: str(fd, 'bio'), workAreaNote: str(fd, 'workAreaNote'), phone: str(fd, 'phone'), email: str(fd, 'email'), instagram: str(fd, 'instagram'), telegram: str(fd, 'telegram'), exp: str(fd, 'experienceSince') || undefined });
  if (!p.success) return { error: 'invalidInput' };
  const gender = str(fd, 'gender'); const cats = fd.getAll('categories').map(String).filter((c) => /^[a-z0-9-]{1,60}$/.test(c));
  const categories = await db.category.findMany({ where: { slug: { in: cats }, isActive: true }, select: { id: true } });
  if (categories.length === 0) return { error: 'invalidInput' };
  const avatar = fileUrl(str(fd, 'avatarKey'), `avatars/${o.me.id}/`), cover = fileUrl(str(fd, 'coverKey'), `covers/${o.me.id}/`);
  await db.$transaction([
    db.masterProfile.update({ where: { id: o.profile.id }, data: {
      displayName: p.data.displayName, headline: p.data.headline || null, bio: p.data.bio || null, workAreaNote: p.data.workAreaNote || null,
      contactPhone: p.data.phone || null, contactEmail: p.data.email || null, experienceSince: p.data.exp ?? null,
      gender: gender === 'female' || gender === 'male' ? gender : null, showGender: str(fd, 'showGender') === '1' && (gender === 'female' || gender === 'male'),
      socials: { instagram: p.data.instagram.replace(/^@/, ''), telegram: p.data.telegram.replace(/^@/, '') },
      ...(avatar ? { avatarUrl: avatar } : {}), ...(cover ? { coverUrl: cover } : {}),
    } }),
    db.masterCategory.deleteMany({ where: { masterId: o.profile.id } }),
    db.masterCategory.createMany({ data: categories.map((c) => ({ masterId: o.profile.id, categoryId: c.id })) }),
  ]);
  const line = str(fd, 'address').slice(0, 160);
  if (line && line !== o.profile.address?.line1) {
    const where = await geocode(line, o.profile.city.name); // fail-soft: no coordinates → pin at the city centre
    const data = { line1: line, latitude: where?.lat ?? null, longitude: where?.lng ?? null };
    if (o.profile.address) await db.address.update({ where: { id: o.profile.address.id }, data });
    else { const a = await db.address.create({ data: { ...data, countryId: o.profile.city.countryId, cityId: o.profile.cityId } }); await db.masterProfile.update({ where: { id: o.profile.id }, data: { addressId: a.id } }); }
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'saved' };
}

/** Publish = leave draft. Refused until the profile can really take bookings. Going public ALSO needs a live subscription (visibility rule). */
export async function setPublishedAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); if (!o) return { error: 'forbidden' };
  if (str(fd, 'publish') !== '1') { await db.masterProfile.update({ where: { id: o.profile.id }, data: { status: 'DRAFT', publishedAt: null } }); revalidatePath('/', 'layout'); return { ok: true, message: 'saved' }; }
  if (o.profile.status === 'SUSPENDED') return { error: 'forbidden' };
  const [categoryCount, pricedServiceCount, workingRangeCount] = await Promise.all([
    db.masterCategory.count({ where: { masterId: o.profile.id } }),
    db.service.count({ where: { masterId: o.profile.id, isActive: true, prices: { some: { currency: 'UAH' } } } }),
    db.workingHours.count({ where: { masterId: o.profile.id } }),
  ]);
  if (missingForPublish({ avatarUrl: o.profile.avatarUrl, categoryCount, pricedServiceCount, workingRangeCount }).length) return { error: 'profileIncomplete' };
  await db.masterProfile.update({ where: { id: o.profile.id }, data: { status: 'PUBLISHED', publishedAt: o.profile.publishedAt ?? new Date() } });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'published' };
}

export async function addPortfolioAction(key: string, caption: string, categorySlug: string | null): Promise<{ ok: boolean }> {
  const o = await own(); if (!o) return { ok: false };
  const url = fileUrl(key, `portfolio/${o.me.id}/`);
  if (!url) return { ok: false };
  const count = await db.portfolioItem.count({ where: { masterId: o.profile.id } });
  if (count >= 200) return { ok: false };
  const cat = categorySlug ? await db.category.findFirst({ where: { slug: categorySlug }, select: { id: true } }) : null;
  const last = await db.portfolioItem.findFirst({ where: { masterId: o.profile.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  await db.portfolioItem.create({ data: { masterId: o.profile.id, url, type: /\.(mp4|webm)$/.test(key) ? 'VIDEO' : 'IMAGE', caption: caption.slice(0, 140) || null, categoryId: cat?.id ?? null, sortOrder: (last?.sortOrder ?? -1) + 1, uploadedByUserId: o.me.id } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deletePortfolioAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); const itemId = id.safeParse(str(fd, 'itemId'));
  if (!o || !itemId.success) return { error: 'forbidden' };
  const item = await db.portfolioItem.findFirst({ where: { id: itemId.data, masterId: o.profile.id } }); // scoped to the owner
  if (!item) return { error: 'invalidInput' };
  await db.portfolioItem.delete({ where: { id: item.id } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveServiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); if (!o) return { error: 'forbidden' };
  const p = z.object({ name: text(120).min(2), description: text(500), duration: z.coerce.number().int().min(10).max(720), buffer: z.coerce.number().int().min(0).max(120) })
    .safeParse({ name: str(fd, 'name'), description: str(fd, 'description'), duration: str(fd, 'durationMin'), buffer: str(fd, 'bufferMin') || '0' });
  const price = uahToMinor(str(fd, 'price'));
  const cat = await db.category.findFirst({ where: { slug: str(fd, 'category'), masters: { some: { masterId: o.profile.id } } } }); // only the master's own categories
  if (!p.success || price === null || !cat) return { error: 'invalidInput' };
  const sub = str(fd, 'sub') ? await db.subcategory.findFirst({ where: { slug: str(fd, 'sub'), categoryId: cat.id }, select: { id: true } }) : null;
  const serviceId = str(fd, 'serviceId');
  const data = { name: p.data.name, description: p.data.description || null, durationMin: p.data.duration, bufferMin: p.data.buffer, categoryId: cat.id, subcategoryId: sub?.id ?? null };
  const isFrom = str(fd, 'isFrom') === '1';
  if (serviceId) {
    const svc = await db.service.findFirst({ where: { id: serviceId, masterId: o.profile.id }, select: { id: true } });
    if (!svc) return { error: 'forbidden' };
    await db.$transaction([db.service.update({ where: { id: svc.id }, data }), db.servicePrice.upsert({ where: { serviceId_currency: { serviceId: svc.id, currency: 'UAH' } }, update: { amountMinor: price, isFrom }, create: { serviceId: svc.id, currency: 'UAH', amountMinor: price, isFrom } })]);
  } else {
    await db.service.create({ data: { ...data, masterId: o.profile.id, prices: { create: { currency: 'UAH', amountMinor: price, isFrom } } } });
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'saved' };
}

export async function deleteServiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); const sid = id.safeParse(str(fd, 'serviceId'));
  if (!o || !sid.success) return { error: 'forbidden' };
  const svc = await db.service.findFirst({ where: { id: sid.data, masterId: o.profile.id }, select: { id: true, _count: { select: { bookings: true } } } });
  if (!svc) return { error: 'invalidInput' };
  if (svc._count.bookings > 0) await db.service.update({ where: { id: svc.id }, data: { isActive: false } }); // keep history of past bookings
  else await db.service.delete({ where: { id: svc.id } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); if (!o) return { error: 'forbidden' };
  const raw: Record<string, string> = {}; for (const [k, v] of fd.entries()) if (/^d[0-6][se][12]$/.test(k)) raw[k] = String(v);
  const w = buildWeekly(raw);
  if (!w.ok) return { error: 'scheduleInvalid' };
  await db.$transaction([db.workingHours.deleteMany({ where: { masterId: o.profile.id } }), db.workingHours.createMany({ data: w.rows.map((r) => ({ masterId: o.profile.id, ...r })) })]);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'saved' };
}

/** Days off are stored as BLOCKED intervals in the master's own time zone (whole local days). */
export async function addDayOffAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); if (!o) return { error: 'forbidden' };
  const from = str(fd, 'from'), to = str(fd, 'to') || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { error: 'invalidInput' };
  const tz = o.profile.city.timezone; const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number]; const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const startsAt = localToUtc(y1, m1, d1, 0, tz), endsAt = localToUtc(y2, m2, d2 + 1, 0, tz);
  if (endsAt.getTime() - startsAt.getTime() > 366 * 864e5) return { error: 'invalidInput' };
  await db.availability.create({ data: { masterId: o.profile.id, type: 'BLOCKED', startsAt, endsAt, note: str(fd, 'note').slice(0, 120) || null } });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'saved' };
}

export async function deleteDayOffAction(_: FormState, fd: FormData): Promise<FormState> {
  const o = await own(); const aid = id.safeParse(str(fd, 'availabilityId'));
  if (!o || !aid.success) return { error: 'forbidden' };
  await db.availability.deleteMany({ where: { id: aid.data, masterId: o.profile.id } });
  revalidatePath('/', 'layout');
  return { ok: true };
}
