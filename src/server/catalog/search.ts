import { db } from '../db';
import type { Locale } from '@/i18n/config';
import { computeSlots, localMinuteOfDay, type Interval } from '../booking/slots';
import { distanceKm } from '@/lib/geo';
import { buildMasterWhere, buildStudioWhere, serviceWhere } from './filters';
import { PAGE_SIZE, type SearchFilters } from './params';
import { translationsFor } from './reference';

const CANDIDATE_CAP = 500; // upper bound of rows pulled into memory for in-memory sorts/filters
const HORIZON_DAYS = 14;

export interface MasterCard {
  id: string; slug: string; name: string; headline: string | null; bio: string | null;
  photoUrl: string | null; avatarUrl: string | null;
  city: string; district: string | null; categories: string[];
  ratingAvg: number; ratingCount: number; experienceYears: number | null;
  priceFromMinor: number | null; priceIsFrom: boolean;
  nearestSlot: Date | null; timezone: string;
  studios: { name: string; slug: string }[];
  distanceKm: number | null;
}
export interface StudioCard {
  id: string; slug: string; name: string; description: string | null; photoUrl: string | null; logoUrl: string | null;
  city: string; district: string | null; categories: string[];
  ratingAvg: number; ratingCount: number; priceFromMinor: number | null; teamSize: number; distanceKm: number | null;
}
export interface SearchResult<T> { items: T[]; total: number; page: number; pageCount: number }

export async function loadMinPrices(masterIds: string[], f: SearchFilters) {
  const rows = await db.service.findMany({
    where: { masterId: { in: masterIds }, ...serviceWhere(f, false) },
    select: { masterId: true, prices: { where: { currency: 'UAH',
      ...(f.priceMin !== undefined || f.priceMax !== undefined ? { amountMinor: { ...(f.priceMin !== undefined ? { gte: f.priceMin * 100 } : {}), ...(f.priceMax !== undefined ? { lte: f.priceMax * 100 } : {}) } } : {}) },
      select: { amountMinor: true, isFrom: true } } },
  });
  const out = new Map<string, { minor: number; isFrom: boolean }>();
  for (const r of rows) for (const p of r.prices) {
    const cur = out.get(r.masterId!);
    if (!cur || p.amountMinor < cur.minor) out.set(r.masterId!, { minor: p.amountMinor, isFrom: p.isFrom });
  }
  return out;
}

/** Free slots per master (shortest matching service decides the slot length). One batched set of queries. */
export async function loadSlots(masterIds: string[], opts: { days: number; startDate?: string; category?: string; sub?: string; service?: { durationMin: number; bufferMin: number } }) {
  const result = new Map<string, Date[]>();
  if (masterIds.length === 0) return result;
  const now = new Date();
  const rangeStart = opts.startDate ? new Date(`${opts.startDate}T00:00:00Z`) : now;
  const rangeStartPadded = new Date(rangeStart.getTime() - 864e5);
  const rangeEnd = new Date(rangeStart.getTime() + (opts.days + 2) * 864e5);

  const [masters, hours, exceptions, bookings, services] = await Promise.all([
    db.masterProfile.findMany({ where: { id: { in: masterIds } }, select: { id: true, city: { select: { timezone: true } } } }),
    db.workingHours.findMany({ where: { masterId: { in: masterIds } }, select: { masterId: true, weekday: true, startMinute: true, endMinute: true } }),
    db.availability.findMany({ where: { masterId: { in: masterIds }, endsAt: { gte: rangeStartPadded }, startsAt: { lte: rangeEnd } }, select: { masterId: true, type: true, startsAt: true, endsAt: true } }),
    db.booking.findMany({ where: { masterId: { in: masterIds }, status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gte: rangeStartPadded }, startsAt: { lte: rangeEnd } }, select: { masterId: true, startsAt: true, endsAt: true } }),
    db.service.findMany({ where: { masterId: { in: masterIds }, isActive: true, ...(opts.category ? { category: { slug: opts.category } } : {}), ...(opts.sub ? { subcategory: { slug: opts.sub } } : {}) }, select: { masterId: true, durationMin: true, bufferMin: true } }),
  ]);

  const shortest = new Map<string, { durationMin: number; bufferMin: number }>();
  for (const s of services) { const c = shortest.get(s.masterId!); if (!c || s.durationMin < c.durationMin) shortest.set(s.masterId!, s); }

  for (const m of masters) {
    const svc = opts.service ?? shortest.get(m.id);
    if (!svc) { result.set(m.id, []); continue; }
    const mine = <T extends { masterId: string }>(xs: T[]) => xs.filter((x) => x.masterId === m.id);
    const toInterval = (x: { startsAt: Date; endsAt: Date }): Interval => ({ start: x.startsAt, end: x.endsAt });
    result.set(m.id, computeSlots({
      timezone: m.city.timezone, weekly: mine(hours), durationMin: svc.durationMin, bufferMin: svc.bufferMin, days: opts.days, startDate: opts.startDate, now,
      extra: mine(exceptions).filter((e) => e.type === 'EXTRA').map(toInterval),
      blocked: mine(exceptions).filter((e) => e.type === 'BLOCKED').map(toInterval),
      busy: mine(bookings).map(toInterval),
    }));
  }
  return result;
}

export async function searchMasters(f: SearchFilters, locale: Locale): Promise<SearchResult<MasterCard>> {
  const candidates = await db.masterProfile.findMany({
    where: buildMasterWhere(f), take: CANDIDATE_CAP, orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
    select: { id: true, ratingAvg: true, ratingCount: true, bookingCount: true,
      city: { select: { latitude: true, longitude: true, timezone: true } }, address: { select: { latitude: true, longitude: true } },
      memberships: { where: { status: 'ACTIVE' }, take: 1, select: { studio: { select: { address: { select: { latitude: true, longitude: true } } } } } } },
  });

  let rows = candidates.map((c) => {
    const pt = c.address?.latitude != null ? c.address : c.memberships[0]?.studio.address?.latitude != null ? c.memberships[0].studio.address : c.city;
    const dist = f.lat !== undefined && f.lng !== undefined && pt?.latitude != null && pt.longitude != null
      ? distanceKm({ lat: f.lat, lng: f.lng! }, { lat: pt.latitude, lng: pt.longitude }) : null;
    return { id: c.id, rating: Number(c.ratingAvg), ratingCount: c.ratingCount, popularity: c.bookingCount, dist };
  });

  const needsSlots = f.sort === 'nearest' || f.available || !!f.date;
  let slots = new Map<string, Date[]>();
  if (needsSlots) {
    rows = rows.slice(0, 200); // slot maths is the expensive part: capped
    slots = await loadSlots(rows.map((r) => r.id), f.date
      ? { days: 1, startDate: f.date, category: f.category, sub: f.sub }
      : { days: HORIZON_DAYS, category: f.category, sub: f.sub });
    if (f.date) {
      const minMinute = f.time ? Number(f.time.slice(0, 2)) * 60 + Number(f.time.slice(3)) : 0;
      const tz = new Map(candidates.map((c) => [c.id, c.city.timezone]));
      for (const [id, list] of slots) slots.set(id, list.filter((s) => localMinuteOfDay(s, tz.get(id)!) >= minMinute));
    }
    rows = rows.filter((r) => (slots.get(r.id)?.length ?? 0) > 0);
  }

  let prices = new Map<string, { minor: number; isFrom: boolean }>();
  if (f.sort === 'price') prices = await loadMinPrices(rows.map((r) => r.id), f);

  const big = Number.MAX_SAFE_INTEGER;
  switch (f.sort) {
    case 'popularity': rows.sort((a, b) => b.popularity - a.popularity || b.ratingCount - a.ratingCount); break;
    case 'price': rows.sort((a, b) => (prices.get(a.id)?.minor ?? big) - (prices.get(b.id)?.minor ?? big)); break;
    case 'distance': rows.sort((a, b) => (a.dist ?? big) - (b.dist ?? big)); break;
    case 'nearest': rows.sort((a, b) => (slots.get(a.id)?.[0]?.getTime() ?? big) - (slots.get(b.id)?.[0]?.getTime() ?? big)); break;
    default: break; // 'rating' = DB order
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const pageIds = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => r.id);
  const items = await hydrateMasters(pageIds, f, locale, { prices, slots, dist: new Map(rows.map((r) => [r.id, r.dist])) });
  return { items, total, page, pageCount };
}

async function hydrateMasters(ids: string[], f: SearchFilters, locale: Locale, pre: { prices: Map<string, { minor: number; isFrom: boolean }>; slots: Map<string, Date[]>; dist: Map<string, number | null> }): Promise<MasterCard[]> {
  if (ids.length === 0) return [];
  const [rows, prices, slots] = await Promise.all([
    db.masterProfile.findMany({ where: { id: { in: ids } }, select: {
      id: true, slug: true, displayName: true, headline: true, bio: true, avatarUrl: true, coverUrl: true, experienceSince: true, ratingAvg: true, ratingCount: true,
      city: { select: { id: true, name: true, timezone: true } }, address: { select: { district: { select: { id: true, name: true } } } },
      categories: { select: { category: { select: { id: true, name: true } } } },
      portfolio: { where: { moderation: 'APPROVED', type: 'IMAGE' }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      memberships: { where: { status: 'ACTIVE', studio: { status: 'PUBLISHED' } }, select: { studio: { select: { name: true, slug: true, address: { select: { district: { select: { id: true, name: true } } } } } } } },
    } }),
    pre.prices.size ? Promise.resolve(pre.prices) : loadMinPrices(ids, f),
    pre.slots.size ? Promise.resolve(pre.slots) : loadSlots(ids, { days: HORIZON_DAYS, category: f.category, sub: f.sub }),
  ]);
  const cityNames = await translationsFor('city', [...new Set(rows.map((r) => r.city.id))], locale);
  const distIds = rows.flatMap((r) => [r.address?.district?.id, ...r.memberships.map((m) => m.studio.address?.district?.id)]).filter((x): x is string => !!x);
  const catIds = rows.flatMap((r) => r.categories.map((c) => c.category.id));
  const [distNames, catNames] = await Promise.all([translationsFor('district', [...new Set(distIds)], locale), translationsFor('category', [...new Set(catIds)], locale)]);
  const year = new Date().getUTCFullYear();
  const byId = new Map(rows.map((r) => {
    const d = r.address?.district ?? r.memberships[0]?.studio.address?.district ?? null;
    const price = prices.get(r.id);
    const card: MasterCard = {
      id: r.id, slug: r.slug, name: r.displayName, headline: r.headline, bio: r.bio,
      photoUrl: r.portfolio[0]?.url ?? r.coverUrl, avatarUrl: r.avatarUrl,
      city: cityNames.get(r.city.id) ?? r.city.name, district: d ? distNames.get(d.id) ?? d.name : null,
      categories: r.categories.map((c) => catNames.get(c.category.id) ?? c.category.name),
      ratingAvg: Number(r.ratingAvg), ratingCount: r.ratingCount, experienceYears: r.experienceSince ? year - r.experienceSince : null,
      priceFromMinor: price?.minor ?? null, priceIsFrom: price?.isFrom ?? false,
      nearestSlot: slots.get(r.id)?.[0] ?? null, timezone: r.city.timezone,
      studios: r.memberships.map((m) => ({ name: m.studio.name, slug: m.studio.slug })), distanceKm: pre.dist.get(r.id) ?? null,
    };
    return [r.id, card] as const;
  }));
  return ids.map((id) => byId.get(id)).filter((x): x is MasterCard => !!x);
}

export async function searchStudios(f: SearchFilters, locale: Locale): Promise<SearchResult<StudioCard>> {
  const rows = await db.studioProfile.findMany({
    where: buildStudioWhere(f), take: CANDIDATE_CAP, orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
    select: { id: true, slug: true, name: true, description: true, logoUrl: true, coverUrl: true, ratingAvg: true, ratingCount: true,
      city: { select: { id: true, name: true, latitude: true, longitude: true } },
      address: { select: { latitude: true, longitude: true, district: { select: { id: true, name: true } } } },
      photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      categories: { select: { category: { select: { id: true, name: true } } } },
      members: { where: { status: 'ACTIVE', countsAsSeat: true }, select: { master: { select: { services: { where: { isActive: true }, select: { prices: { where: { currency: 'UAH' }, select: { amountMinor: true } } } } } } } } },
  });
  const [cityNames, distNames, catNames] = await Promise.all([
    translationsFor('city', [...new Set(rows.map((r) => r.city.id))], locale),
    translationsFor('district', rows.map((r) => r.address?.district?.id).filter((x): x is string => !!x), locale),
    translationsFor('category', rows.flatMap((r) => r.categories.map((c) => c.category.id)), locale),
  ]);
  let cards: StudioCard[] = rows.map((r) => {
    const all = r.members.flatMap((m) => m.master?.services.flatMap((s) => s.prices.map((p) => p.amountMinor)) ?? []);
    const pt = r.address?.latitude != null ? r.address : r.city;
    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description, photoUrl: r.photos[0]?.url ?? r.coverUrl, logoUrl: r.logoUrl,
      city: cityNames.get(r.city.id) ?? r.city.name, district: r.address?.district ? distNames.get(r.address.district.id) ?? r.address.district.name : null,
      categories: r.categories.map((c) => catNames.get(c.category.id) ?? c.category.name),
      ratingAvg: Number(r.ratingAvg), ratingCount: r.ratingCount, priceFromMinor: all.length ? Math.min(...all) : null, teamSize: r.members.length,
      distanceKm: f.lat !== undefined && f.lng !== undefined && pt?.latitude != null && pt.longitude != null ? distanceKm({ lat: f.lat, lng: f.lng }, { lat: pt.latitude, lng: pt.longitude }) : null,
    };
  });
  const big = Number.MAX_SAFE_INTEGER;
  if (f.sort === 'popularity') cards.sort((a, b) => b.ratingCount - a.ratingCount);
  if (f.sort === 'price') cards.sort((a, b) => (a.priceFromMinor ?? big) - (b.priceFromMinor ?? big));
  if (f.sort === 'distance') cards.sort((a, b) => (a.distanceKm ?? big) - (b.distanceKm ?? big));
  const total = cards.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  cards = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { items: cards, total, page, pageCount };
}
