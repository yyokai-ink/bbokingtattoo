import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { getEnv } from '../env';
import { can, type Actor } from '../auth/permissions';
import { buildStudioInvoice, type MemberBilling } from './studio-pricing';
import { getPaymentProvider } from '../payments/registry';
import { ProviderNotConfiguredError, type ParsedWebhookEvent, type PaymentProviderCode } from '../payments/types';
import { GRACE_DAYS, decideCycleAction, periodAfterPayment, type SubStatus } from './lifecycle';
import { notify, type NotificationType } from '../notifications';
import { formatMoney } from '@/lib/money';
import { localeMeta, isLocale, defaultLocale } from '@/i18n/config';

export type BillingErrorCode = 'forbidden' | 'plan_unavailable' | 'already_subscribed' | 'not_found' | 'invalid_state' | 'provider_unavailable';
export class BillingError extends Error { constructor(public readonly code: BillingErrorCode) { super(code); this.name = 'BillingError'; } }

const LIVE: SubStatus[] = ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'GRACE'];

function defaultProvider(): PaymentProviderCode {
  return (getEnv().PAYMENT_PROVIDERS.split(',')[0]?.trim().toUpperCase() || 'TEST') as PaymentProviderCode;
}

async function checkout(payment: { id: string; amountMinor: number; currency: string }, description: string, locale: string, code: PaymentProviderCode) {
  try {
    const session = await getPaymentProvider(code).createCheckout({ paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency, description, locale });
    await db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: session.providerPaymentId } });
    return session.redirectUrl;
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) throw new BillingError('provider_unavailable');
    throw e;
  }
}

/** A master chooses an individual plan. Creates (or re-uses) an INCOMPLETE subscription + a PENDING payment; the profile
 *  goes public only after the provider's webhook confirms payment. */
export async function startIndividualCheckout(actor: Actor | null, planCode: string, locale: string): Promise<string> {
  if (!actor || !can(actor, 'master:profile:edit', { masterUserId: actor.userId })) throw new BillingError('forbidden');
  const plan = await db.subscriptionPlan.findFirst({ where: { code: planCode, kind: 'INDIVIDUAL', isActive: true } });
  if (!plan) throw new BillingError('plan_unavailable');
  const existing = await db.subscription.findFirst({ where: { userId: actor.userId, status: { in: LIVE } } });
  if (existing && existing.status !== 'INCOMPLETE') throw new BillingError('already_subscribed'); // plan changes: cancel at period end, then choose again (no proration yet)

  const code = defaultProvider();
  const payment = await db.$transaction(async (tx) => {
    const sub = existing
      ? await tx.subscription.update({ where: { id: existing.id }, data: { planId: plan.id } })
      : await tx.subscription.create({ data: { planId: plan.id, ownerType: 'USER', userId: actor.userId, status: 'INCOMPLETE', provider: code } });
    await tx.payment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    return tx.payment.create({ data: {
      subscriptionId: sub.id, payerUserId: actor.userId, kind: 'SUBSCRIPTION', amountMinor: plan.priceMinor, currency: plan.currency, provider: code,
      idempotencyKey: `init:${sub.id}:${randomUUID()}`, lineItems: [{ code: plan.code, quantity: 1, unitMinor: plan.priceMinor, totalMinor: plan.priceMinor }],
    } });
  });
  return checkout(payment, plan.name, locale, code);
}

/** Pay an existing PENDING payment (e.g. a renewal that is due). Only the payer can open it. */
export async function payPending(actor: Actor | null, paymentId: string, locale: string): Promise<string> {
  if (!actor) throw new BillingError('forbidden');
  const p = await db.payment.findFirst({ where: { id: paymentId, payerUserId: actor.userId, status: 'PENDING' }, include: { subscription: { include: { plan: true } } } });
  if (!p) throw new BillingError('not_found');
  return checkout(p, p.subscription?.plan.name ?? 'Lumera', locale, p.provider);
}

export async function cancelSubscription(actor: Actor | null): Promise<void> {
  if (!actor) throw new BillingError('forbidden');
  const sub = await db.subscription.findFirst({ where: { userId: actor.userId, status: { in: LIVE } } });
  if (!sub) throw new BillingError('not_found');
  if (sub.status === 'INCOMPLETE') {
    await db.$transaction([db.payment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }), db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } })]);
    return;
  }
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } }); // access continues until the paid period ends
}

export async function resumeSubscription(actor: Actor | null): Promise<void> {
  if (!actor) throw new BillingError('forbidden');
  const { count } = await db.subscription.updateMany({ where: { userId: actor.userId, status: 'ACTIVE', cancelAtPeriodEnd: true }, data: { cancelAtPeriodEnd: false } });
  if (count === 0) throw new BillingError('invalid_state');
}

async function billingNotify(userId: string, type: NotificationType, plan: string, date: Date | null, amountMinor: number, currency: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { locale: true, timezone: true } });
  if (!u) return;
  const intl = localeMeta[isLocale(u.locale) ? u.locale : defaultLocale].intl;
  await notify(userId, type, { service: plan, startsAt: (date ?? new Date()).toISOString(), timezone: u.timezone, name: formatMoney(amountMinor, currency, intl) });
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/**
 * Applies a VERIFIED provider event. Idempotent (WebhookEvent unique per provider+eventId; payment updates are conditional on the
 * previous status) and strict: amount, currency and provider payment id must match our Payment row or the event is ignored.
 */
export async function processPaymentEvent(provider: PaymentProviderCode, ev: ParsedWebhookEvent, raw: unknown): Promise<WebhookOutcome> {
  try {
    await db.webhookEvent.create({ data: { provider, eventId: ev.eventId, type: ev.type, payload: raw as Prisma.InputJsonValue } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    const prev = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: ev.eventId } } });
    if (prev?.processedAt) return 'duplicate'; // a previous attempt that crashed half-way is retried below
  }
  const done = (error?: string) => db.webhookEvent.update({ where: { provider_eventId: { provider, eventId: ev.eventId } }, data: { processedAt: new Date(), error: error ?? null } });

  const payment = await db.payment.findUnique({ where: { id: ev.paymentId }, include: { subscription: { include: { plan: true } } } });
  if (!payment || payment.provider !== provider || (payment.providerPaymentId && payment.providerPaymentId !== ev.providerPaymentId)
    || payment.amountMinor !== ev.amountMinor || payment.currency !== ev.currency) {
    await done('payment mismatch or unknown');
    return 'ignored';
  }

  let activated: { userId: string; plan: string; end: Date } | null = null;
  const now = new Date();
  const outcome = await db.$transaction(async (tx): Promise<WebhookOutcome> => {
    if (ev.type === 'payment.succeeded') {
      const { count } = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'SUCCEEDED', paidAt: now } });
      if (count === 0) return 'ignored'; // already applied
      const sub = payment.subscription;
      if (sub) {
        const reactivation = sub.status === 'CANCELLED' || sub.status === 'EXPIRED';
        if (reactivation && sub.userId && (await tx.subscription.count({ where: { userId: sub.userId, status: { in: LIVE }, id: { not: sub.id } } })) > 0) return 'processed'; // paid, but a newer live subscription exists: needs manual review
        const period = periodAfterPayment(sub.currentPeriodEnd, sub.plan.interval, now);
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodStart: period.start, currentPeriodEnd: period.end, nextBillingAt: period.end, graceEndsAt: null, failedAttempts: 0, cancelAtPeriodEnd: false } });
        activated = { userId: sub.userId ?? payment.payerUserId, plan: sub.plan.name, end: period.end };
      }
      // one-time connection fees paid with this payment are recorded on the StudioMember row (so re-invites never pay twice)
      const meta = payment.lineItems as { connectionUserIds?: string[] } | null;
      if (payment.studioId && meta && Array.isArray(meta.connectionUserIds) && meta.connectionUserIds.length) {
        await tx.studioMember.updateMany({ where: { studioId: payment.studioId, userId: { in: meta.connectionUserIds }, connectionFeePaidAt: null }, data: { connectionFeePaidAt: now } });
      }
    } else if (ev.type === 'payment.failed') {
      const { count } = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'provider_declined' } });
      if (count && payment.subscriptionId) await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { failedAttempts: { increment: 1 } } });
    } else {
      await tx.payment.updateMany({ where: { id: payment.id, status: 'SUCCEEDED' }, data: { status: 'REFUNDED' } });
    }
    return 'processed';
  });
  await done();
  const a = activated as { userId: string; plan: string; end: Date } | null;
  if (a) await billingNotify(a.userId, 'billing.activated', a.plan, a.end, payment.amountMinor, payment.currency);
  return outcome;
}

export interface CycleSummary { checked: number; upcoming: number; dunning: number; grace: number; expired: number; cancelled: number }

/** Daily job: reminders, dunning, grace, expiry. Safe to run repeatedly (idempotent per period). Demo subscriptions are skipped. */
export async function runBillingCycle(now = new Date()): Promise<CycleSummary> {
  const summary: CycleSummary = { checked: 0, upcoming: 0, dunning: 0, grace: 0, expired: 0, cancelled: 0 };
  const subs = await db.subscription.findMany({ where: { isDemo: false, status: { in: ['ACTIVE', 'PAST_DUE', 'GRACE'] }, currentPeriodEnd: { not: null } }, include: { plan: true, studio: { select: { ownerId: true } } }, take: 2000 });
  for (const sub of subs) {
    summary.checked++;
    const owner = sub.userId ?? sub.studio?.ownerId;
    if (!owner) continue;
    let amount = sub.plan.priceMinor; let items: unknown = [{ code: sub.plan.code, quantity: 1, unitMinor: sub.plan.priceMinor, totalMinor: sub.plan.priceMinor }];
    if (sub.studioId) { const ctx = await studioContext(sub.studioId); const inv = buildStudioInvoice(ctx.prices, ctx.members, 'subscription'); amount = inv.totalMinor; items = { items: inv.items, connectionUserIds: inv.connectionUserIds }; } // seats are counted at renewal time
    const action = decideCycleAction({ status: sub.status as SubStatus, currentPeriodEnd: sub.currentPeriodEnd, graceEndsAt: sub.graceEndsAt, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }, now);
    try {
      if (action === 'notify_upcoming') {
        const recent = await db.notification.findFirst({ where: { userId: owner, type: 'billing.upcoming', createdAt: { gt: new Date(now.getTime() - 5 * 864e5) } }, select: { id: true } });
        if (!recent) { await billingNotify(owner, 'billing.upcoming', sub.plan.name, sub.currentPeriodEnd, amount, sub.plan.currency); summary.upcoming++; }
      } else if (action === 'cancel') {
        await db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', nextBillingAt: null } });
        await billingNotify(owner, 'billing.cancelled', sub.plan.name, sub.currentPeriodEnd, sub.plan.priceMinor, sub.plan.currency); summary.cancelled++;
      } else if (action === 'start_dunning') {
        const key = `renewal:${sub.id}:${sub.currentPeriodEnd!.toISOString()}`; // one renewal payment per period, even if the job runs twice
        await db.$transaction([
          db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } }),
          db.payment.upsert({ where: { idempotencyKey: key }, update: {}, create: {
            subscriptionId: sub.id, payerUserId: owner, amountMinor: amount, currency: sub.plan.currency, provider: sub.provider ?? defaultProvider(), studioId: sub.studioId,
            kind: sub.studioId ? 'STUDIO_BASE' : 'SUBSCRIPTION', idempotencyKey: key, lineItems: items as Prisma.InputJsonValue } }),
        ]);
        await billingNotify(owner, 'billing.due', sub.plan.name, sub.currentPeriodEnd, amount, sub.plan.currency); summary.dunning++;
      } else if (action === 'enter_grace') {
        const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * 864e5);
        await db.subscription.update({ where: { id: sub.id }, data: { status: 'GRACE', graceEndsAt } });
        await billingNotify(owner, 'billing.grace', sub.plan.name, graceEndsAt, sub.plan.priceMinor, sub.plan.currency); summary.grace++;
      } else if (action === 'expire') {
        await db.$transaction([db.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED', nextBillingAt: null } }), db.payment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })]);
        await billingNotify(owner, 'billing.expired', sub.plan.name, now, sub.plan.priceMinor, sub.plan.currency); summary.expired++;
      }
    } catch (err) { console.error('[billing cycle] subscription', sub.id, err); } // one bad row must not stop the run
  }
  return summary;
}

async function studioContext(studioId: string) {
  const [plan, members] = await Promise.all([
    db.subscriptionPlan.findFirst({ where: { kind: 'STUDIO', isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.studioMember.findMany({ where: { studioId }, select: { userId: true, status: true, countsAsSeat: true, connectionFeePaidAt: true } }),
  ]);
  if (!plan) throw new BillingError('plan_unavailable');
  const prices = { baseMinor: plan.priceMinor, seatMinor: plan.seatPriceMinor ?? 0, connectionFeeMinor: plan.connectionFeeMinor ?? 0, currency: plan.currency };
  return { plan, prices, members: members as MemberBilling[] };
}

export async function getStudioInvoices(studioId: string) {
  const c = await studioContext(studioId);
  return { plan: c.plan, subscription: buildStudioInvoice(c.prices, c.members, 'subscription'), fees: buildStudioInvoice(c.prices, c.members, 'fees') };
}

/** Owner pays the studio plan (base + active seats + unpaid connection fees) or only the new masters' connection fees. */
export async function startStudioCheckout(actor: Actor | null, studioId: string, mode: 'subscription' | 'fees', locale: string): Promise<string> {
  if (!actor || !can(actor, 'studio:billing:manage', { studioId })) throw new BillingError('forbidden');
  const { plan, prices, members } = await studioContext(studioId);
  const invoice = buildStudioInvoice(prices, members, mode);
  if (invoice.totalMinor <= 0) throw new BillingError('invalid_state');
  const live = await db.subscription.findFirst({ where: { studioId, status: { in: LIVE } } });
  if (mode === 'subscription' && live && live.status !== 'INCOMPLETE') throw new BillingError('already_subscribed');
  if (mode === 'fees' && (!live || live.status === 'INCOMPLETE')) throw new BillingError('invalid_state');
  const code = defaultProvider();
  const payment = await db.$transaction(async (tx) => {
    let subscriptionId: string | null = null;
    if (mode === 'subscription') {
      const sub = live ? await tx.subscription.update({ where: { id: live.id }, data: { planId: plan.id } }) : await tx.subscription.create({ data: { planId: plan.id, ownerType: 'STUDIO', studioId, status: 'INCOMPLETE', provider: code } });
      subscriptionId = sub.id;
      await tx.payment.updateMany({ where: { subscriptionId: sub.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    }
    return tx.payment.create({ data: {
      subscriptionId, studioId, payerUserId: actor.userId, kind: mode === 'subscription' ? 'STUDIO_BASE' : 'CONNECTION_FEE', amountMinor: invoice.totalMinor, currency: invoice.currency, provider: code,
      idempotencyKey: `studio:${studioId}:${mode}:${randomUUID()}`, lineItems: { items: invoice.items, connectionUserIds: invoice.connectionUserIds } as unknown as Prisma.InputJsonValue,
    } });
  });
  return checkout(payment, plan.name, locale, code);
}

export async function setStudioCancel(actor: Actor | null, studioId: string, cancel: boolean): Promise<void> {
  if (!actor || !can(actor, 'studio:billing:manage', { studioId })) throw new BillingError('forbidden');
  const { count } = await db.subscription.updateMany({ where: { studioId, status: 'ACTIVE', cancelAtPeriodEnd: !cancel }, data: { cancelAtPeriodEnd: cancel } });
  if (count === 0) throw new BillingError('invalid_state');
}
