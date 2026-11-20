/**
 * Subscription lifecycle (pure). Timeline of an unpaid renewal:
 *   period end ─► PAST_DUE (profile visible, payment due, we retry/remind)
 *   +3 days    ─► GRACE    (profile visible, NEW BOOKINGS DISABLED, 7 days to pay)
 *   +7 days    ─► EXPIRED  (profile hidden)
 * A successful payment at any point returns the subscription to ACTIVE.
 */
export type SubStatus = 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
export const PAST_DUE_DAYS = 3;
export const GRACE_DAYS = 7;
export const UPCOMING_NOTICE_DAYS = 3;
const DAY = 864e5;

export interface SubSnapshot { status: SubStatus; currentPeriodEnd: Date | null; graceEndsAt: Date | null; cancelAtPeriodEnd: boolean }
export type CycleAction = 'none' | 'notify_upcoming' | 'cancel' | 'start_dunning' | 'enter_grace' | 'expire';

/** Calendar-month addition that clamps the day (Jan 31 + 1 month = Feb 28/29), in UTC. */
export function addInterval(from: Date, interval: 'MONTH' | 'YEAR'): Date {
  const months = interval === 'YEAR' ? 12 : 1;
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function decideCycleAction(s: SubSnapshot, now: Date): CycleAction {
  const end = s.currentPeriodEnd;
  if (!end) return 'none';
  switch (s.status) {
    case 'ACTIVE':
      if (now >= end) return s.cancelAtPeriodEnd ? 'cancel' : 'start_dunning';
      return end.getTime() - now.getTime() <= UPCOMING_NOTICE_DAYS * DAY && !s.cancelAtPeriodEnd ? 'notify_upcoming' : 'none';
    case 'PAST_DUE':
      return now.getTime() >= end.getTime() + PAST_DUE_DAYS * DAY ? 'enter_grace' : 'none';
    case 'GRACE':
      return s.graceEndsAt && now >= s.graceEndsAt ? 'expire' : 'none';
    default:
      return 'none';
  }
}

/** New paid period. Late payers do not get free time: the new period starts at the OLD end when it is not too far in the past. */
export function periodAfterPayment(prevEnd: Date | null, interval: 'MONTH' | 'YEAR', now: Date): { start: Date; end: Date } {
  const lateLimitMs = (PAST_DUE_DAYS + GRACE_DAYS) * DAY; // beyond this the old period is considered lapsed
  let start: Date;
  if (!prevEnd) start = now;
  else if (prevEnd > now) start = prevEnd; // renewed early: extend from the current end
  else start = now.getTime() - prevEnd.getTime() <= lateLimitMs ? prevEnd : now;
  return { start, end: addInterval(start, interval) }; // always > now: a month is longer than the late limit
}

export const isLiveStatus = (s: SubStatus) => s === 'ACTIVE' || s === 'PAST_DUE' || s === 'GRACE' || s === 'INCOMPLETE';
/** Features limited while not fully paid: GRACE (and INCOMPLETE) cannot accept new bookings. */
export const canAcceptBookings = (s: SubStatus) => s === 'ACTIVE' || s === 'PAST_DUE';
