/**
 * URL query -> validated SearchFilters. Hand-written (no throwing): anything invalid is dropped, numbers are
 * clamped. The URL is the single source of truth for search state => shareable, crawlable, back-button safe.
 */
export const SORTS = ['rating', 'popularity', 'price', 'distance', 'nearest'] as const;
export type SortKey = (typeof SORTS)[number];
export type ResultType = 'master' | 'studio';
export const PAGE_SIZE = 12;

export interface SearchFilters {
  type: ResultType;
  country?: string; city?: string; district?: string;
  category?: string; sub?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  priceMin?: number; priceMax?: number; // UAH, whole units
  rating?: number; // 1..5
  experience?: number; // min years
  gender?: 'female' | 'male';
  available?: boolean; // has a free slot within the next 14 days
  sort: SortKey;
  lat?: number; lng?: number;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const slug = (v?: string) => (v && /^[a-z0-9-]{1,80}$/.test(v) ? v : undefined);
const int = (v: string | undefined, min: number, max: number) => {
  if (v === undefined || !/^\d{1,9}$/.test(v)) return undefined;
  return Math.min(max, Math.max(min, Number(v)));
};
const num = (v: string | undefined, min: number, max: number) => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export function parseSearchParams(raw: Raw, defaults: Partial<SearchFilters> = {}): SearchFilters {
  const date = first(raw.date);
  const time = first(raw.time);
  const sortRaw = first(raw.sort);
  const gender = first(raw.gender);
  const lat = num(first(raw.lat), -90, 90), lng = num(first(raw.lng), -180, 180);
  const f: SearchFilters = {
    type: first(raw.type) === 'studio' ? 'studio' : 'master',
    country: slug(first(raw.country)) ?? defaults.country,
    city: slug(first(raw.city)) ?? defaults.city,
    district: slug(first(raw.district)),
    category: slug(first(raw.category)) ?? defaults.category,
    sub: slug(first(raw.sub)),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : undefined,
    time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : undefined,
    priceMin: int(first(raw.priceMin), 0, 1_000_000),
    priceMax: int(first(raw.priceMax), 0, 1_000_000),
    rating: int(first(raw.rating), 1, 5),
    experience: int(first(raw.experience), 1, 50),
    gender: gender === 'female' || gender === 'male' ? gender : undefined,
    available: first(raw.available) === '1' ? true : undefined,
    sort: (SORTS as readonly string[]).includes(sortRaw ?? '') ? (sortRaw as SortKey) : 'rating',
    lat: lat !== undefined && lng !== undefined ? lat : undefined,
    lng: lat !== undefined && lng !== undefined ? lng : undefined,
    page: int(first(raw.page), 1, 500) ?? 1,
  };
  if (f.priceMin !== undefined && f.priceMax !== undefined && f.priceMin > f.priceMax) [f.priceMin, f.priceMax] = [f.priceMax, f.priceMin];
  if (f.time && !f.date) f.time = undefined; // time only makes sense with a date
  if (f.sub && !f.category) f.sub = undefined; // sub-category slugs are unique only inside a category
  if (f.sort === 'distance' && f.lat === undefined) f.sort = 'rating'; // distance needs coordinates
  return f;
}

/** Filters -> query string (omits defaults) for links / pagination / form round-trips. */
export function toQueryString(f: Partial<SearchFilters>, overrides: Partial<SearchFilters> = {}, omit: (keyof SearchFilters)[] = []): string {
  const merged = { ...f, ...overrides } as Record<string, unknown>;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === '' || omit.includes(k as keyof SearchFilters)) continue;
    if (k === 'page' && v === 1) continue;
    if (k === 'sort' && v === 'rating') continue;
    if (k === 'type' && v === 'master') continue;
    qs.set(k, v === true ? '1' : String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}
