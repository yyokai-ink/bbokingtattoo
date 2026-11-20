import { describe, it, expect } from 'vitest';
import { computeSlots, localToUtc, type Interval } from '@/server/booking/slots';
import { parseSearchParams, toQueryString } from '@/server/catalog/params';
import { buildMasterWhere, buildStudioWhere } from '@/server/catalog/filters';
import { distanceKm } from '@/lib/geo';
import { jsonLd } from '@/lib/json-ld';

const TZ = 'Europe/Kyiv';
const weeklyMon = [{ weekday: 0, startMinute: 600, endMinute: 840 }, { weekday: 0, startMinute: 900, endMinute: 1140 }]; // Mon 10–14, 15–19
const iv = (a: string, b: string): Interval => ({ start: new Date(a), end: new Date(b) });
const base = { timezone: TZ, weekly: weeklyMon, durationMin: 60, bufferMin: 15, stepMinutes: 30, days: 1, startDate: '2026-11-09', now: new Date('2026-11-08T10:00:00Z') };
const iso = (xs: Date[]) => xs.map((d) => d.toISOString());

describe('time zones', () => {
  it('converts provider-local time to UTC across DST (Kyiv)', () => {
    expect(localToUtc(2026, 3, 28, 720, TZ).toISOString()).toBe('2026-03-28T10:00:00.000Z'); // UTC+2
    expect(localToUtc(2026, 3, 29, 720, TZ).toISOString()).toBe('2026-03-29T09:00:00.000Z'); // DST started: UTC+3
    expect(localToUtc(2026, 11, 9, 600, TZ).toISOString()).toBe('2026-11-09T08:00:00.000Z');
  });
});

describe('computeSlots', () => {
  it('respects the weekly template and the lunch break', () => {
    const s = iso(computeSlots(base));
    expect(s[0]).toBe('2026-11-09T08:00:00.000Z'); // 10:00 local
    expect(s).toContain('2026-11-09T11:00:00.000Z'); // 13:00 fits before the 14:00 break
    expect(s).not.toContain('2026-11-09T11:30:00.000Z'); // would run into the break
    expect(s).not.toContain('2026-11-09T12:00:00.000Z'); // inside the break
    expect(s).toContain('2026-11-09T13:00:00.000Z'); // 15:00 after the break
    expect(s).not.toContain('2026-11-09T16:30:00.000Z'); // would end after 19:00
  });
  it('uses summer time correctly', () => {
    const s = iso(computeSlots({ ...base, startDate: '2026-07-06', now: new Date('2026-07-01T00:00:00Z') }));
    expect(s[0]).toBe('2026-07-06T07:00:00.000Z'); // 10:00 local = UTC+3
  });
  it('never offers an interval that overlaps a booking, buffer included', () => {
    const busy = [iv('2026-11-09T09:00:00Z', '2026-11-09T10:15:00Z')]; // 11:00–12:15 local
    const s = iso(computeSlots({ ...base, busy }));
    expect(s).not.toContain('2026-11-09T08:00:00.000Z'); // 10:00 + 60 + 15 buffer would touch the 11:00 booking
    expect(s).not.toContain('2026-11-09T09:00:00.000Z');
    expect(s).not.toContain('2026-11-09T09:30:00.000Z');
    expect(s).toContain('2026-11-09T10:15:00.000Z'); // first slot right after the booking
    for (const slot of computeSlots({ ...base, busy })) {
      const start = slot.getTime(), end = start + 75 * 60_000;
      expect(start < busy[0]!.end.getTime() && busy[0]!.start.getTime() < end).toBe(false);
    }
  });
  it('blocked days give no slots; EXTRA windows add them', () => {
    expect(computeSlots({ ...base, blocked: [iv('2026-11-08T22:00:00Z', '2026-11-09T22:00:00Z')] })).toHaveLength(0);
    const extra = [iv('2026-11-15T12:00:00Z', '2026-11-15T15:00:00Z')]; // a Sunday
    expect(iso(computeSlots({ ...base, startDate: '2026-11-15', extra }))).toContain('2026-11-15T12:00:00.000Z');
    expect(computeSlots({ ...base, startDate: '2026-11-15' })).toHaveLength(0);
  });
  it('honours the lead time from "now"', () => {
    const s = iso(computeSlots({ ...base, now: new Date('2026-11-09T07:30:00Z'), leadMinutes: 60 }));
    expect(s).not.toContain('2026-11-09T08:00:00.000Z');
    expect(s[0]).toBe('2026-11-09T08:30:00.000Z');
  });
  it('a service longer than any window yields nothing', () => {
    expect(computeSlots({ ...base, durationMin: 300 })).toHaveLength(0);
  });
});

describe('parseSearchParams', () => {
  it('drops invalid values instead of trusting them', () => {
    const f = parseSearchParams({ city: 'lviv;DROP TABLE', category: 'Tattoo', date: '2026-13-99', time: '25:00', priceMax: '-5', page: 'abc', sort: 'hack' });
    expect(f.city).toBeUndefined(); expect(f.category).toBeUndefined(); expect(f.date).toBeUndefined();
    expect(f.time).toBeUndefined(); expect(f.priceMax).toBeUndefined(); expect(f.page).toBe(1); expect(f.sort).toBe('rating');
  });
  it('clamps numbers and swaps an inverted price range', () => {
    const f = parseSearchParams({ priceMin: '900', priceMax: '300', page: '99999', rating: '9' });
    expect([f.priceMin, f.priceMax]).toEqual([300, 900]);
    expect(f.page).toBe(500); expect(f.rating).toBe(5);
  });
  it('applies cross-field rules', () => {
    expect(parseSearchParams({ time: '10:00' }).time).toBeUndefined(); // time needs a date
    expect(parseSearchParams({ sub: 'haircut' }).sub).toBeUndefined(); // sub needs a category
    expect(parseSearchParams({ sort: 'distance' }).sort).toBe('rating'); // distance needs coordinates
    expect(parseSearchParams({ sort: 'distance', lat: '49.84', lng: '24.03' }).sort).toBe('distance');
    expect(parseSearchParams({ lat: '49.84' }).lat).toBeUndefined(); // lat without lng is ignored
  });
  it('uses page defaults for SEO landing pages, but explicit query wins', () => {
    expect(parseSearchParams({}, { city: 'lviv', category: 'tattoo' })).toEqual(expect.anything());
    expect(parseSearchParams({}, { city: 'lviv' }).city).toBe('lviv');
    expect(parseSearchParams({ city: 'kyiv' }, { city: 'lviv' }).city).toBe('kyiv');
  });
  it('round-trips to a clean query string without defaults', () => {
    expect(toQueryString(parseSearchParams({ city: 'lviv', category: 'tattoo', sort: 'price', page: '2' }))).toBe('?city=lviv&category=tattoo&sort=price&page=2');
    expect(toQueryString(parseSearchParams({}))).toBe('');
  });
});

describe('search filters → Prisma where', () => {
  const f = (raw: Record<string, string>) => parseSearchParams(raw);
  it('ALWAYS starts with the public-visibility rule (cannot be bypassed by any filter)', () => {
    for (const raw of [{}, { city: 'lviv' }, { gender: 'male', rating: '5' }]) {
      const where = buildMasterWhere(f(raw)) as { AND: unknown[] };
      expect(JSON.stringify(where.AND[0]).includes('"status":"PUBLISHED"')).toBe(true);
      expect(JSON.stringify(where.AND[0]).includes('subscriptions')).toBe(true);
    }
    expect(JSON.stringify((buildStudioWhere(f({})) as { AND: unknown[] }).AND[0]).includes('"status":"PUBLISHED"')).toBe(true);
  });
  it('gender filter only matches masters who opted in to show it', () => {
    expect(JSON.stringify(buildMasterWhere(f({ gender: 'male' })))).toContain('"showGender":true');
  });
  it('experience is converted to a start-year bound', () => {
    expect(JSON.stringify(buildMasterWhere(f({ experience: '5' }), new Date('2026-06-01T00:00:00Z')))).toContain('"experienceSince":{"lte":2021}');
  });
  it('price range is applied in minor units on the selected category’s services', () => {
    const s = JSON.stringify(buildMasterWhere(f({ category: 'tattoo', priceMin: '1000', priceMax: '5000' })));
    expect(s).toContain('"gte":100000'); expect(s).toContain('"lte":500000'); expect(s).toContain('"slug":"tattoo"');
  });
});

describe('helpers', () => {
  it('computes great-circle distance (Kyiv → Lviv ≈ 470 km)', () => {
    const d = distanceKm({ lat: 50.4501, lng: 30.5234 }, { lat: 49.8397, lng: 24.0297 });
    expect(d).toBeGreaterThan(450); expect(d < 490).toBe(true);
  });
  it('escapes "<" in JSON-LD so user content cannot break out of <script>', () => {
    expect(jsonLd({ name: '</script><script>alert(1)</script>' }).includes('<')).toBe(false);
  });
});

import { groupByLocation } from '@/server/catalog/map-group';
describe('map grouping', () => {
  it('puts masters of the same address under ONE marker and keeps other places separate', () => {
    const g = groupByLocation([
      { lat: 49.83971, lng: 24.02972, item: 'a' }, { lat: 49.83972, lng: 24.02971, item: 'b' }, { lat: 50.45, lng: 30.52, item: 'c' },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]!.items).toEqual(['a', 'b']);
    expect(g[1]!.items).toEqual(['c']);
  });
});
