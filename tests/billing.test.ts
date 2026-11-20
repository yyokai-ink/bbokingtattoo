import { describe, it, expect } from 'vitest';
import { addInterval, canAcceptBookings, decideCycleAction, periodAfterPayment, GRACE_DAYS, PAST_DUE_DAYS } from '@/server/billing/lifecycle';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const snap = (over: Partial<Parameters<typeof decideCycleAction>[0]>) => ({ status: 'ACTIVE' as const, currentPeriodEnd: d('2026-12-01'), graceEndsAt: null, cancelAtPeriodEnd: false, ...over });

describe('addInterval', () => {
  it('adds calendar months and clamps the day', () => {
    expect(addInterval(d('2026-01-31'), 'MONTH').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addInterval(d('2028-01-31'), 'MONTH').toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addInterval(d('2026-12-15'), 'MONTH').toISOString().slice(0, 10)).toBe('2027-01-15');
    expect(addInterval(d('2026-03-10'), 'YEAR').toISOString().slice(0, 10)).toBe('2027-03-10');
  });
});

describe('decideCycleAction', () => {
  it('does nothing in the middle of a paid period', () => expect(decideCycleAction(snap({}), d('2026-11-10'))).toBe('none'));
  it('reminds 3 days before the charge, but not when cancelling', () => {
    expect(decideCycleAction(snap({}), d('2026-11-29'))).toBe('notify_upcoming');
    expect(decideCycleAction(snap({ cancelAtPeriodEnd: true }), d('2026-11-29'))).toBe('none');
  });
  it('ends a cancelled subscription at period end; otherwise starts dunning', () => {
    expect(decideCycleAction(snap({ cancelAtPeriodEnd: true }), d('2026-12-01'))).toBe('cancel');
    expect(decideCycleAction(snap({}), d('2026-12-01'))).toBe('start_dunning');
  });
  it('walks PAST_DUE → GRACE → EXPIRED on schedule', () => {
    const pd = snap({ status: 'PAST_DUE' });
    expect(decideCycleAction(pd, d('2026-12-03'))).toBe('none');
    expect(decideCycleAction(pd, d(`2026-12-0${1 + PAST_DUE_DAYS}`))).toBe('enter_grace');
    const gr = snap({ status: 'GRACE', graceEndsAt: d('2026-12-11') });
    expect(decideCycleAction(gr, d('2026-12-10'))).toBe('none');
    expect(decideCycleAction(gr, d('2026-12-11'))).toBe('expire');
    expect(GRACE_DAYS).toBe(7);
  });
  it('ignores terminal / incomplete states', () => {
    for (const status of ['CANCELLED', 'EXPIRED', 'INCOMPLETE'] as const) expect(decideCycleAction(snap({ status }), d('2027-01-01'))).toBe('none');
  });
});

describe('periodAfterPayment', () => {
  it('first payment starts now', () => {
    const p = periodAfterPayment(null, 'MONTH', d('2026-11-09'));
    expect(p.start.toISOString().slice(0, 10)).toBe('2026-11-09');
    expect(p.end.toISOString().slice(0, 10)).toBe('2026-12-09');
  });
  it('on-time or slightly late renewal continues from the old period end (no free days)', () => {
    const p = periodAfterPayment(d('2026-12-01'), 'MONTH', d('2026-12-03'));
    expect(p.start.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(p.end.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
  it('a renewal paid early extends from the current end', () => {
    expect(periodAfterPayment(d('2026-12-01'), 'MONTH', d('2026-11-28')).end.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
  it('a very late payment restarts from now and the end is always in the future', () => {
    const now = d('2027-03-15');
    const p = periodAfterPayment(d('2026-12-01'), 'MONTH', now);
    expect(p.end > now).toBe(true);
    expect(p.start.toISOString().slice(0, 10)).toBe('2027-03-15');
  });
});

describe('feature limits', () => {
  it('GRACE and INCOMPLETE cannot accept new bookings', () => {
    expect(canAcceptBookings('ACTIVE')).toBe(true);
    expect(canAcceptBookings('PAST_DUE')).toBe(true);
    for (const s of ['GRACE', 'INCOMPLETE', 'EXPIRED', 'CANCELLED'] as const) expect(canAcceptBookings(s)).toBe(false);
  });
});

describe('billing safety nets (source level, since DB code cannot run offline)', () => {
  const read = (rel: string) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', rel), 'utf8') as string;
  it('webhook handler verifies the raw body before processing and is idempotent', () => {
    const route = read('src/app/api/webhooks/[provider]/route.ts');
    expect(route.indexOf('provider.verifyAndParseWebhook') < route.indexOf('await processPaymentEvent(')).toBe(true);
    const svc = read('src/server/billing/service.ts');
    expect(svc.includes("status: 'PENDING' }, data: { status: 'SUCCEEDED'")).toBe(true); // conditional update = applied once
    expect(svc.includes('payment.amountMinor !== ev.amountMinor')).toBe(true); // amount must match
  });
  it('every admin Server Action re-authorises on the server', () => {
    const src = read('src/server/actions/admin.ts');
    expect((src.match(/await admin\('admin:/g) ?? []).length).toBe(4);
  });
  it('cron endpoint is disabled without a strong secret', () => {
    expect(read('src/app/api/cron/billing/route.ts').includes('secret.length < 24')).toBe(true);
  });
});

import { buildStudioInvoice } from '@/server/billing/studio-pricing';
describe('studio invoice', () => {
  const prices = { baseMinor: 49900, seatMinor: 14900, connectionFeeMinor: 9900, currency: 'UAH' };
  const m = (userId: string, paid: boolean, over = {}) => ({ userId, status: 'ACTIVE' as const, countsAsSeat: true, connectionFeePaidAt: paid ? new Date() : null, ...over });
  it('first payment = base + seats + one-time fees for every new master', () => {
    const inv = buildStudioInvoice(prices, [m('a', false), m('b', false)], 'subscription');
    expect(inv.totalMinor).toBe(49900 + 2 * 14900 + 2 * 9900);
    expect(inv.connectionUserIds).toEqual(['a', 'b']);
  });
  it('renewal charges base + seats only (fees already paid; re-invited master costs nothing extra)', () => {
    expect(buildStudioInvoice(prices, [m('a', true), m('b', true)], 'subscription').totalMinor).toBe(49900 + 2 * 14900);
  });
  it('mid-period growth: "fees" mode charges only new masters', () => {
    const inv = buildStudioInvoice(prices, [m('a', true), m('c', false)], 'fees');
    expect(inv.totalMinor).toBe(9900);
    expect(inv.connectionUserIds).toEqual(['c']);
    expect(buildStudioInvoice(prices, [m('a', true)], 'fees').totalMinor).toBe(0);
  });
});
