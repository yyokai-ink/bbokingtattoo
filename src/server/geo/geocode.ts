export interface Coords { lat: number; lng: number }

/** Pure: picks the first valid coordinate pair out of a Nominatim-style JSON array. */
export function parseGeocode(json: unknown): Coords | null {
  if (!Array.isArray(json)) return null;
  for (const r of json) {
    const lat = Number((r as { lat?: unknown })?.lat), lng = Number((r as { lon?: unknown })?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

/**
 * Address → coordinates for the map. Default: public Nominatim (OpenStreetMap) — free, ~1 request/second, set GEOCODER_EMAIL
 * (their usage policy asks for a contact). For heavy traffic point GEOCODER_URL to a paid geocoder with the same response shape.
 * Fail-soft: on any problem returns null and the master simply appears at the city centre.
 */
export async function geocode(address: string, city: string, country = 'Ukraine'): Promise<Coords | null> {
  const base = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
  const url = new URL(base);
  url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '1'); url.searchParams.set('q', `${address}, ${city}, ${country}`);
  if (process.env.GEOCODER_EMAIL) url.searchParams.set('email', process.env.GEOCODER_EMAIL);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': `Lumera/1.0 (${process.env.GEOCODER_EMAIL ?? 'no-contact'})`, 'Accept-Language': 'uk,en' }, signal: AbortSignal.timeout(4000), cache: 'no-store' });
    return res.ok ? parseGeocode(await res.json()) : null;
  } catch { return null; }
}
