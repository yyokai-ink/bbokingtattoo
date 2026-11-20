/** Pure rules for master onboarding (no DB) — unit-tested. */
export type ChecklistItem = 'avatar' | 'category' | 'service' | 'schedule';

/** A profile can be published only when it can actually receive bookings. */
export function missingForPublish(p: { avatarUrl: string | null; categoryCount: number; pricedServiceCount: number; workingRangeCount: number }): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  if (!p.avatarUrl) out.push('avatar');
  if (p.categoryCount < 1) out.push('category');
  if (p.pricedServiceCount < 1) out.push('service');
  if (p.workingRangeCount < 1) out.push('schedule');
  return out;
}

export const parseHHMM = (v: string | undefined): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface WeeklyRow { weekday: number; startMinute: number; endMinute: number }

/** Form fields d{0-6}s1/e1/s2/e2 ("HH:MM") → validated rows. Empty pair = day off. A second range models a break. */
export function buildWeekly(f: Record<string, string | undefined>): { ok: true; rows: WeeklyRow[] } | { ok: false } {
  const rows: WeeklyRow[] = [];
  for (let d = 0; d < 7; d++) {
    const ranges: [number, number][] = [];
    for (const n of [1, 2]) {
      const s = f[`d${d}s${n}`] || undefined, e = f[`d${d}e${n}`] || undefined;
      if (!s && !e) continue;
      const a = parseHHMM(s), b = parseHHMM(e);
      if (a === null || b === null || b <= a) return { ok: false };
      ranges.push([a, b]);
    }
    if (ranges.length === 2 && ranges[1]![0] < ranges[0]![1]) return { ok: false }; // overlapping ranges
    for (const [a, b] of ranges) rows.push({ weekday: d, startMinute: a, endMinute: b });
  }
  return { ok: true, rows };
}

/** Whole UAH (decimals allowed) → minor units, rejecting junk/negatives/huge values. */
export function uahToMinor(v: string): number | null {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(v.trim())) return null;
  return Math.round(Number(v.replace(',', '.')) * 100);
}
