import { describe, it, expect } from 'vitest';
import { buildWeekly, missingForPublish, parseHHMM, uahToMinor } from '@/server/master/rules';

describe('publish checklist', () => {
  it('lists exactly what is missing', () => {
    expect(missingForPublish({ avatarUrl: null, categoryCount: 0, pricedServiceCount: 0, workingRangeCount: 0 })).toEqual(['avatar', 'category', 'service', 'schedule']);
    expect(missingForPublish({ avatarUrl: '/media/a.jpg', categoryCount: 1, pricedServiceCount: 2, workingRangeCount: 5 })).toEqual([]);
  });
});
describe('schedule parsing', () => {
  it('parses times strictly', () => { expect(parseHHMM('09:30')).toBe(570); expect(parseHHMM('24:00')).toBe(null); expect(parseHHMM('9:30')).toBe(null); expect(parseHHMM(undefined)).toBe(null); });
  it('builds rows with a lunch break and days off', () => {
    const r = buildWeekly({ d0s1: '10:00', d0e1: '14:00', d0s2: '15:00', d0e2: '19:00', d5s1: '11:00', d5e1: '16:00' });
    expect(r).toEqual({ ok: true, rows: [{ weekday: 0, startMinute: 600, endMinute: 840 }, { weekday: 0, startMinute: 900, endMinute: 1140 }, { weekday: 5, startMinute: 660, endMinute: 960 }] });
  });
  it('rejects reversed, half-filled and overlapping ranges', () => {
    expect(buildWeekly({ d0s1: '14:00', d0e1: '10:00' })).toEqual({ ok: false });
    expect(buildWeekly({ d1s1: '10:00' })).toEqual({ ok: false });
    expect(buildWeekly({ d2s1: '10:00', d2e1: '14:00', d2s2: '13:00', d2e2: '18:00' })).toEqual({ ok: false });
  });
});
describe('price parsing', () => {
  it('converts UAH to minor units and rejects junk', () => {
    expect(uahToMinor('900')).toBe(90000); expect(uahToMinor('99,50')).toBe(9950); expect(uahToMinor('12.5')).toBe(1250);
    for (const bad of ['-5', 'abc', '', '1e6', '99999999', '1.234']) expect(uahToMinor(bad)).toBe(null);
  });
});
