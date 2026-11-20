/** Booking state machine rules (pure). The server actions call these AND re-read the row from the DB. */
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED_BY_CLIENT' | 'CANCELLED_BY_PROVIDER' | 'COMPLETED' | 'NO_SHOW';
export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;
export const MAX_ACTIVE_FUTURE_BOOKINGS = 5;
export const RESCHEDULE_MIN_HOURS = 2;
export const REVIEW_WINDOW_DAYS = 60;

const isActive = (s: BookingStatus) => (ACTIVE_STATUSES as readonly string[]).includes(s);

export const canClientCancel = (s: BookingStatus, startsAt: Date, now = new Date()) => isActive(s) && startsAt > now;
export const canReschedule = (s: BookingStatus, startsAt: Date, now = new Date()) =>
  isActive(s) && startsAt.getTime() - now.getTime() >= RESCHEDULE_MIN_HOURS * 3_600_000;
export const canProviderConfirm = (s: BookingStatus) => s === 'PENDING';
export const canProviderCancel = (s: BookingStatus) => isActive(s);
/** A visit can be marked completed only once it has started. */
export const canProviderComplete = (s: BookingStatus, startsAt: Date, now = new Date()) => s === 'CONFIRMED' && startsAt <= now;
export const canReview = (s: BookingStatus, startsAt: Date, hasReview: boolean, now = new Date()) =>
  s === 'COMPLETED' && !hasReview && now.getTime() - startsAt.getTime() <= REVIEW_WINDOW_DAYS * 864e5;
