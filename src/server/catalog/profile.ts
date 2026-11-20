import { db } from '../db';
import type { Locale } from '@/i18n/config';
import { localDateParts } from '../booking/slots';
import { loadSlots } from './search';
import { publicMasterWhere, publicStudioWhere } from './visibility';
import { translationsFor } from './reference';

export interface ServiceView { id: string; name: string; description: string | null; durationMin: number; category: string; subcategory: string | null; priceMinor: number | null; priceIsFrom: boolean }
export interface ReviewView { id: string; author: string; rating: number; text: string | null; date: Date }
export interface SlotDay { date: string; times: string[] } // times are ISO instants
export interface HoursView { weekday: number; ranges: [number, number][] }

const authorName = (f: string, l: string) => `${f} ${l.charAt(0)}.`;

function groupHours(rows: { weekday: number; startMinute: number; endMinute: number }[]): HoursView[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday, ranges: rows.filter((r) => r.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute).map((r) => [r.startMinute, r.endMinute] as [number, number]),
  }));
}

export function groupSlotsByDay(slots: Date[], timezone: string, maxDays = 7): SlotDay[] {
  const map = new Map<string, string[]>();
  for (const s of slots) {
    const { y, m, d } = localDateParts(s, timezone);
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(s.toISOString());
  }
  return [...map.entries()].slice(0, maxDays).map(([date, times]) => ({ date, times }));
}

export async function getMasterProfile(slug: string, locale: Locale) {
  const m = await db.masterProfile.findFirst({
    where: { slug, ...publicMasterWhere },
    include: {
      city: true, address: { include: { district: true } },
      categories: { include: { category: true } },
      portfolio: { where: { moderation: 'APPROVED' }, orderBy: { sortOrder: 'asc' } },
      services: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { category: true, subcategory: true, prices: { where: { currency: 'UAH' } } } },
      hours: true,
      reviews: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 10, include: { author: { select: { firstName: true, lastName: true } } } },
      memberships: { where: { status: 'ACTIVE', studio: publicStudioWhere }, include: { studio: { include: { address: { include: { district: true, city: true } } } } } },
    },
  });
  if (!m) return null;

  const [cityNames, catNames, distNames, slotMap] = await Promise.all([
    translationsFor('city', [m.city.id], locale),
    translationsFor('category', [...new Set([...m.categories.map((c) => c.categoryId), ...m.services.map((s) => s.categoryId)])], locale),
    translationsFor('district', [m.address?.district?.id, ...m.memberships.map((x) => x.studio.address?.district?.id)].filter((x): x is string => !!x), locale),
    loadSlots([m.id], { days: 7 }),
  ]);
  const subNames = await translationsFor('subcategory', m.services.map((s) => s.subcategoryId).filter((x): x is string => !!x), locale);

  const services: ServiceView[] = m.services.map((s) => ({
    id: s.id, name: s.name, description: s.description, durationMin: s.durationMin,
    category: catNames.get(s.categoryId) ?? s.category.name, subcategory: s.subcategory ? subNames.get(s.subcategory.id) ?? s.subcategory.name : null,
    priceMinor: s.prices[0]?.amountMinor ?? null, priceIsFrom: s.prices[0]?.isFrom ?? false,
  }));
  const dist = m.address?.district ?? m.memberships[0]?.studio.address?.district ?? null;
  const address = m.address ?? m.memberships[0]?.studio.address ?? null;
  const prices = services.map((s) => s.priceMinor).filter((x): x is number => x !== null);
  return {
    id: m.id, slug: m.slug, name: m.displayName, headline: m.headline, bio: m.bio,
    avatarUrl: m.avatarUrl, coverUrl: m.coverUrl, timezone: m.city.timezone,
    city: cityNames.get(m.city.id) ?? m.city.name, citySlug: m.city.slug,
    district: dist ? distNames.get(dist.id) ?? dist.name : null,
    addressLine: address?.line1 ?? null, workAreaNote: m.workAreaNote,
    categories: m.categories.map((c) => ({ slug: c.category.slug, name: catNames.get(c.categoryId) ?? c.category.name })),
    experienceYears: m.experienceSince ? new Date().getUTCFullYear() - m.experienceSince : null,
    gender: m.showGender ? m.gender : null,
    ratingAvg: Number(m.ratingAvg), ratingCount: m.ratingCount,
    contactEmail: m.contactEmail, contactPhone: m.contactPhone, socials: (m.socials ?? {}) as Record<string, string>,
    portfolio: m.portfolio.map((p) => ({ id: p.id, url: p.url, caption: p.caption, type: p.type })),
    services, priceFromMinor: prices.length ? Math.min(...prices) : null,
    hours: groupHours(m.hours),
    slotDays: groupSlotsByDay(slotMap.get(m.id) ?? [], m.city.timezone),
    reviews: m.reviews.map((r): ReviewView => ({ id: r.id, author: authorName(r.author.firstName, r.author.lastName), rating: r.rating, text: r.text, date: r.publishedAt ?? r.createdAt })),
    studios: m.memberships.map((x) => ({ name: x.studio.name, slug: x.studio.slug, logoUrl: x.studio.logoUrl })),
  };
}

export async function getStudioProfile(slug: string, locale: Locale) {
  const s = await db.studioProfile.findFirst({
    where: { slug, ...publicStudioWhere },
    include: {
      city: true, address: { include: { district: true } },
      categories: { include: { category: true } }, photos: { orderBy: { sortOrder: 'asc' } },
      branches: { where: { isActive: true }, include: { address: { include: { district: true } } } },
      reviews: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 10, include: { author: { select: { firstName: true, lastName: true } } } },
      members: { where: { status: 'ACTIVE', role: 'MASTER', master: { is: publicMasterWhere } }, include: { master: { include: {
        categories: { include: { category: true } }, hours: true,
        services: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { category: true, prices: { where: { currency: 'UAH' } } } },
      } } } },
    },
  });
  if (!s) return null;

  const masters = s.members.flatMap((x) => (x.master ? [x.master] : []));
  const catIds = [...new Set([...s.categories.map((c) => c.categoryId), ...masters.flatMap((m) => m.categories.map((c) => c.categoryId)), ...masters.flatMap((m) => m.services.map((sv) => sv.categoryId))])];
  const [cityNames, catNames, distNames] = await Promise.all([
    translationsFor('city', [s.city.id], locale), translationsFor('category', catIds, locale),
    translationsFor('district', [s.address?.district?.id, ...s.branches.map((b) => b.address.district?.id)].filter((x): x is string => !!x), locale),
  ]);

  const allHours = masters.flatMap((m) => m.hours);
  // Studio opening hours = envelope of the team's schedules (min start / max end per weekday).
  const hours: HoursView[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const rows = allHours.filter((h) => h.weekday === weekday);
    return { weekday, ranges: rows.length ? [[Math.min(...rows.map((r) => r.startMinute)), Math.max(...rows.map((r) => r.endMinute))]] : [] };
  });
  const services: (ServiceView & { master: string; masterSlug: string })[] = masters.flatMap((m) => m.services.map((sv) => ({
    id: sv.id, name: sv.name, description: sv.description, durationMin: sv.durationMin, category: catNames.get(sv.categoryId) ?? sv.category.name, subcategory: null,
    priceMinor: sv.prices[0]?.amountMinor ?? null, priceIsFrom: sv.prices[0]?.isFrom ?? false, master: m.displayName, masterSlug: m.slug,
  })));
  const prices = services.map((x) => x.priceMinor).filter((x): x is number => x !== null);
  const fullAddress = (a: { line1: string } | null) => (a ? `${a.line1}, ${cityNames.get(s.city.id) ?? s.city.name}` : null);
  return {
    id: s.id, slug: s.slug, name: s.name, description: s.description, logoUrl: s.logoUrl, coverUrl: s.coverUrl,
    city: cityNames.get(s.city.id) ?? s.city.name, citySlug: s.city.slug, timezone: s.city.timezone,
    district: s.address?.district ? distNames.get(s.address.district.id) ?? s.address.district.name : null,
    addressLine: fullAddress(s.address), email: s.email, phone: s.phone, socials: (s.socials ?? {}) as Record<string, string>,
    categories: s.categories.map((c) => ({ slug: c.category.slug, name: catNames.get(c.categoryId) ?? c.category.name })),
    ratingAvg: Number(s.ratingAvg), ratingCount: s.ratingCount, photos: s.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
    branches: s.branches.map((b) => ({ id: b.id, name: b.name, address: fullAddress(b.address) ?? '', phone: b.phone })),
    hours, services, priceFromMinor: prices.length ? Math.min(...prices) : null,
    team: masters.map((m) => ({ slug: m.slug, name: m.displayName, headline: m.headline, avatarUrl: m.avatarUrl, ratingAvg: Number(m.ratingAvg), ratingCount: m.ratingCount,
      categories: m.categories.map((c) => catNames.get(c.categoryId) ?? c.category.name) })),
    reviews: s.reviews.map((r): ReviewView => ({ id: r.id, author: authorName(r.author.firstName, r.author.lastName), rating: r.rating, text: r.text, date: r.publishedAt ?? r.createdAt })),
  };
}

export type MasterProfileData = NonNullable<Awaited<ReturnType<typeof getMasterProfile>>>;
export type StudioProfileData = NonNullable<Awaited<ReturnType<typeof getStudioProfile>>>;
