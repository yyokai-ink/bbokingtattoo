import { describe, it, expect } from 'vitest';
import { clientIp, newToken, normalizeEmail, safeRedirectPath, sha256 } from '@/server/auth/utils';
import { canClientCancel, canProviderCancel, canProviderComplete, canProviderConfirm, canReschedule, canReview, MAX_ACTIVE_FUTURE_BOOKINGS } from '@/server/booking/rules';

describe('auth utils', () => {
  it('only allows same-site relative redirects (no open redirect)', () => {
    expect(safeRedirectPath('/uk/account', '/x')).toBe('/uk/account');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/a\r\nSet-Cookie: x=1', '', undefined, null]) {
      expect(safeRedirectPath(bad as string | null | undefined, '/fallback')).toBe('/fallback');
    }
  });
  it('generates unguessable single-use tokens and stores only their hash', () => {
    const a = newToken(), b = newToken();
    expect(a === b).toBe(false);
    expect(a.length).toBeGreaterThan(40);
    expect(sha256(a)).toHaveLength(64);
    expect(sha256(a) === a).toBe(false);
  });
  it('normalises e-mails and picks the first forwarded IP', () => {
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
    expect(clientIp('203.0.113.7, 10.0.0.1', null)).toBe('203.0.113.7');
    expect(clientIp(null, '198.51.100.2')).toBe('198.51.100.2');
    expect(clientIp(null, null)).toBe('unknown');
  });
});

describe('booking state rules', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const in1h = new Date('2026-11-09T11:00:00Z'), in3h = new Date('2026-11-09T13:00:00Z'), past = new Date('2026-11-09T08:00:00Z');
  it('client can cancel only active future bookings', () => {
    expect(canClientCancel('PENDING', in1h, now)).toBe(true);
    expect(canClientCancel('CONFIRMED', in1h, now)).toBe(true);
    expect(canClientCancel('CONFIRMED', past, now)).toBe(false);
    for (const s of ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_PROVIDER', 'COMPLETED', 'NO_SHOW'] as const) expect(canClientCancel(s, in3h, now)).toBe(false);
  });
  it('rescheduling needs ≥ 2 hours of notice', () => {
    expect(canReschedule('CONFIRMED', in1h, now)).toBe(false);
    expect(canReschedule('CONFIRMED', in3h, now)).toBe(true);
    expect(canReschedule('COMPLETED', in3h, now)).toBe(false);
  });
  it('provider transitions follow the state machine', () => {
    expect(canProviderConfirm('PENDING')).toBe(true);
    expect(canProviderConfirm('CONFIRMED')).toBe(false);
    expect(canProviderCancel('PENDING')).toBe(true);
    expect(canProviderCancel('COMPLETED')).toBe(false);
    expect(canProviderComplete('CONFIRMED', past, now)).toBe(true);
    expect(canProviderComplete('CONFIRMED', in1h, now)).toBe(false); // visit has not started yet
    expect(canProviderComplete('PENDING', past, now)).toBe(false); // must be confirmed first
  });
  it('a review needs a COMPLETED booking, no existing review, inside the 60-day window', () => {
    expect(canReview('COMPLETED', past, false, now)).toBe(true);
    expect(canReview('COMPLETED', past, true, now)).toBe(false);
    expect(canReview('CONFIRMED', past, false, now)).toBe(false);
    expect(canReview('COMPLETED', new Date('2026-08-01T00:00:00Z'), false, now)).toBe(false);
  });
  it('caps concurrent upcoming bookings per client', () => {
    expect(MAX_ACTIVE_FUTURE_BOOKINGS).toBe(5);
  });
});
