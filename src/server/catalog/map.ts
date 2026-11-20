import { db } from '../db';
import type { Locale } from '@/i18n/config';
import { buildMasterWhere } from './filters';
import { groupByLocation } from './map-group';
import type { SearchFilters } from './params';
import { translationsFor } from './reference';
import { loadMinPrices } from './search';

export interface MapMaster { id: string; slug: string; name: string; avatarUrl: string | null; ratingAvg: number; ratingCount: number; priceFromMinor: number | null; categories: string[] }
export interface MapPoint { key: string; lat: number; lng: number; place: string; masters: MapMaster[] }

/** Public masters matching the filters, placed at their own address, their studio's address, or (fallback) the city centre. */
export async function getMapPoints(f: SearchFilters, locale: Locale): Promise<MapPoint[]> {
  const rows = await db.masterProfile.findMany({
    where: buildMasterWhere(f), take: 400, orderBy: [{ ratingAvg: 'desc' }, { id: 'asc' }],
    select: { id: true, slug: true, displayName: true, avatarUrl: true, ratingAvg: true, ratingCount: true,
      city: { select: { id: true, name: true, latitude: true, longitude: true } }, address: { select: { line1: true, latitude: true, longitude: true } },
      categories: { select: { category: { select: { id: true, name: true } } } },
      memberships: { where: { status: 'ACTIVE', studio: { status: 'PUBLISHED' } }, take: 1, select: { studio: { select: { name: true, address: { select: { line1: true, latitude: true, longitude: true } } } } } } },
  });
  if (rows.length === 0) return [];
  const [prices, catNames, cityNames] = await Promise.all([
    loadMinPrices(rows.map((r) => r.id), f),
    translationsFor('category', [...new Set(rows.flatMap((r) => r.categories.map((c) => c.category.id)))], locale),
    translationsFor('city', [...new Set(rows.map((r) => r.city.id))], locale),
  ]);
  const placed = rows.flatMap((r) => {
    const own = r.address?.latitude != null && r.address.longitude != null ? r.address : null;
    const studio = r.memberships[0]?.studio;
    const studioAddr = studio?.address?.latitude != null && studio.address.longitude != null ? studio.address : null;
    const spot = own ?? studioAddr ?? (r.city.latitude != null && r.city.longitude != null ? { line1: cityNames.get(r.city.id) ?? r.city.name, latitude: r.city.latitude, longitude: r.city.longitude } : null);
    if (!spot) return [];
    const place = studio && !own ? studio.name : spot.line1;
    const item: MapMaster = { id: r.id, slug: r.slug, name: r.displayName, avatarUrl: r.avatarUrl, ratingAvg: Number(r.ratingAvg), ratingCount: r.ratingCount, priceFromMinor: prices.get(r.id)?.minor ?? null, categories: r.categories.map((c) => catNames.get(c.category.id) ?? c.category.name) };
    return [{ lat: spot.latitude!, lng: spot.longitude!, item: { place, master: item } }];
  });
  return groupByLocation(placed).map((g) => ({ key: g.key, lat: g.lat, lng: g.lng, place: g.items[0]!.place, masters: g.items.map((i) => i.master) }));
}
