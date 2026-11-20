import { db } from '../db';
import type { Locale } from '@/i18n/config';

export type EntityType = 'city' | 'district' | 'category' | 'subcategory' | 'country';

/** id -> localized "name" from the Translation table. Missing translations simply fall back to the canonical name. */
export async function translationsFor(entityType: EntityType, ids: string[], locale: Locale): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.translation.findMany({ where: { entityType, locale, field: 'name', entityId: { in: ids } }, select: { entityId: true, value: true } });
  return new Map(rows.map((r) => [r.entityId, r.value]));
}

export interface CityRef { id: string; slug: string; name: string; timezone: string; lat: number | null; lng: number | null; countrySlug: string; masterCount: number }
export interface CategoryRef { id: string; slug: string; name: string; icon: string | null; subs: { id: string; slug: string; name: string }[] }
export interface DistrictRef { id: string; slug: string; name: string }

export async function getCities(locale: Locale): Promise<CityRef[]> {
  const cities = await db.city.findMany({
    where: { isActive: true, country: { isActive: true } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, timezone: true, latitude: true, longitude: true, country: { select: { slug: true } },
      _count: { select: { masters: { where: { status: 'PUBLISHED' } } } } },
  });
  const names = await translationsFor('city', cities.map((c) => c.id), locale);
  return cities.map((c) => ({ id: c.id, slug: c.slug, name: names.get(c.id) ?? c.name, timezone: c.timezone, lat: c.latitude, lng: c.longitude, countrySlug: c.country.slug, masterCount: c._count.masters }));
}

export async function getCategories(locale: Locale): Promise<CategoryRef[]> {
  const cats = await db.category.findMany({
    where: { isActive: true }, orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, name: true, icon: true, subcategories: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, name: true } } },
  });
  const ids = cats.flatMap((c) => [c.id, ...c.subcategories.map((s) => s.id)]);
  const [catNames, subNames] = await Promise.all([translationsFor('category', cats.map((c) => c.id), locale), translationsFor('subcategory', ids, locale)]);
  return cats.map((c) => ({ id: c.id, slug: c.slug, name: catNames.get(c.id) ?? c.name, icon: c.icon,
    subs: c.subcategories.map((s) => ({ id: s.id, slug: s.slug, name: subNames.get(s.id) ?? s.name })) }));
}

export async function getDistricts(citySlug: string, locale: Locale): Promise<DistrictRef[]> {
  const rows = await db.district.findMany({ where: { city: { slug: citySlug } }, orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true } });
  const names = await translationsFor('district', rows.map((r) => r.id), locale);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: names.get(r.id) ?? r.name }));
}
