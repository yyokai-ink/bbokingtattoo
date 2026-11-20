/**
 * Free-slot engine (pure, no DB). Used by search ("nearest slot", date filter), profile calendars and,
 * in Stage 3, by the booking flow. The DB exclusion constraint remains the final guard against races.
 *
 * Model: weekly template (several rows per weekday = breaks) in the PROVIDER's local time zone,
 * + EXTRA windows, − BLOCKED intervals, − busy bookings (booking.endsAt already includes the buffer).
 */
export interface Interval { start: Date; end: Date }
export interface WeeklyRow { weekday: number; startMinute: number; endMinute: number } // weekday 0 = Monday

export interface SlotInput {
  timezone: string;
  weekly: WeeklyRow[];
  extra?: Interval[];
  blocked?: Interval[];
  busy?: Interval[];
  durationMin: number;
  bufferMin?: number;
  /** first instant to consider (default: now) */
  from?: Date;
  /** local date 'YYYY-MM-DD' (in `timezone`) to start from; when set, `from` is ignored and only the lead time limits the past */
  startDate?: string;
  days: number;
  now?: Date;
  leadMinutes?: number; // can't book sooner than this from now
  stepMinutes?: number;
}

const MIN = 60_000;

function offsetMinutes(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return (asUtc - Math.floor(utcMs / 1000) * 1000) / MIN;
}

/** Local wall-clock (y-m-d + minutes after midnight) in `tz` -> UTC instant. */
export function localToUtc(y: number, m: number, d: number, minute: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  const off1 = offsetMinutes(tz, guess);
  let utc = guess - off1 * MIN;
  const off2 = offsetMinutes(tz, utc);
  if (off2 !== off1) utc = guess - off2 * MIN;
  return new Date(utc);
}

export function localDateParts(date: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const g = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  return { y: g('year'), m: g('month'), d: g('day') };
}

export function localMinuteOfDay(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const g = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  return g('hour') * 60 + g('minute');
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

function subtract(windows: Interval[], cuts: Interval[]): Interval[] {
  let out = windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  for (const c of cuts) {
    const cs = c.start.getTime(), ce = c.end.getTime();
    out = out.flatMap((w) => {
      if (!overlaps(w.s, w.e, cs, ce)) return [w];
      const res: { s: number; e: number }[] = [];
      if (w.s < cs) res.push({ s: w.s, e: cs });
      if (ce < w.e) res.push({ s: ce, e: w.e });
      return res;
    });
  }
  return out.map((w) => ({ start: new Date(w.s), end: new Date(w.e) }));
}

export function computeSlots(input: SlotInput): Date[] {
  const { timezone: tz, weekly, durationMin, days } = input;
  const bufferMin = input.bufferMin ?? 0;
  const step = input.stepMinutes ?? 30;
  const now = input.now ?? new Date();
  const from = input.from ?? now;
  const lead = now.getTime() + (input.leadMinutes ?? 60) * MIN;
  const earliest = input.startDate ? lead : Math.max(from.getTime(), lead);
  const busy = input.busy ?? [];
  const cuts = [...(input.blocked ?? []), ...busy];
  const first = input.startDate
    ? { y: Number(input.startDate.slice(0, 4)), m: Number(input.startDate.slice(5, 7)), d: Number(input.startDate.slice(8, 10)) }
    : localDateParts(from, tz);
  const result = new Map<number, Date>();

  for (let i = 0; i < days; i++) {
    const day = new Date(Date.UTC(first.y, first.m - 1, first.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const weekday = (day.getUTCDay() + 6) % 7;
    const dayStart = localToUtc(y, m, d, 0, tz);
    const dayEnd = localToUtc(y, m, d + 1, 0, tz);

    const windows: Interval[] = weekly
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ start: localToUtc(y, m, d, r.startMinute, tz), end: localToUtc(y, m, d, r.endMinute, tz) }));
    for (const e of input.extra ?? []) if (overlaps(e.start.getTime(), e.end.getTime(), dayStart.getTime(), dayEnd.getTime())) windows.push(e);

    for (const w of subtract(windows, cuts)) {
      for (let s = w.start.getTime(); s + durationMin * MIN <= w.end.getTime(); s += step * MIN) {
        if (s < earliest) continue;
        const occupiedEnd = s + (durationMin + bufferMin) * MIN;
        if (busy.some((b) => overlaps(s, occupiedEnd, b.start.getTime(), b.end.getTime()))) continue; // buffer must not hit the next booking
        result.set(s, new Date(s));
      }
    }
  }
  return [...result.values()].sort((a, b) => a.getTime() - b.getTime());
}
