'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { getEnv } from '../env';
import { getCurrentUser } from '../auth/session';
import { BillingError, cancelSubscription, payPending, processPaymentEvent, resumeSubscription, startIndividualCheckout } from '../billing/service';
import { getPaymentProvider } from '../payments/registry';
import { TEST_SIGNATURE_HEADER, signTestPayload } from '../payments/test-provider';
import type { FormState } from '../auth/form-state';
import { createRateLimiter } from '../security/rate-limit';
import { defaultLocale, isLocale } from '@/i18n/config';

const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });
const str = (fd: FormData, k: string) => fd.get(k)?.toString() ?? '';
const locale = (fd: FormData) => { const v = str(fd, 'locale'); return isLocale(v) ? v : defaultLocale; };
const fail = (e: unknown): FormState => { if (e instanceof BillingError) return { error: `billing_${e.code}` }; console.error('[billing action]', e); return { error: 'unexpected' }; };
const idSchema = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);

export async function startCheckoutAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'loginRequired' };
  if (!limiter.check(`co:${me.id}`).ok) return { error: 'rateLimited' };
  let url: string;
  try { url = await startIndividualCheckout(me.actor, str(fd, 'planCode').slice(0, 40), locale(fd)); } catch (e) { return fail(e); }
  redirect(url); // outside try/catch: redirect() works by throwing
}

export async function payPendingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const id = idSchema.safeParse(str(fd, 'paymentId'));
  if (!me || !id.success) return { error: 'forbidden' };
  if (!limiter.check(`pay:${me.id}`).ok) return { error: 'rateLimited' };
  let url: string;
  try { url = await payPending(me.actor, id.data, locale(fd)); } catch (e) { return fail(e); }
  redirect(url);
}

export async function cancelSubscriptionAction(_: FormState): Promise<FormState> {
  const me = await getCurrentUser();
  try { await cancelSubscription(me?.actor ?? null); revalidatePath('/', 'layout'); return { ok: true, message: 'saved' }; } catch (e) { return fail(e); }
}

export async function resumeSubscriptionAction(_: FormState): Promise<FormState> {
  const me = await getCurrentUser();
  try { await resumeSubscription(me?.actor ?? null); revalidatePath('/', 'layout'); return { ok: true, message: 'saved' }; } catch (e) { return fail(e); }
}

/**
 * DEVELOPMENT ONLY test checkout: signs a webhook exactly like a provider would and feeds it through the SAME verification
 * and processing path as /api/webhooks/test. Refused for non-TEST payments and in production (unless ALLOW_TEST_PAYMENTS=true).
 */
export async function simulateTestPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser(); const id = idSchema.safeParse(str(fd, 'paymentId')); const outcome = str(fd, 'outcome');
  if (!me || !id.success || (outcome !== 'success' && outcome !== 'fail')) return { error: 'forbidden' };
  const payment = await db.payment.findFirst({ where: { id: id.data, payerUserId: me.id, provider: 'TEST', status: 'PENDING' } });
  if (!payment) return { error: 'billing_not_found' };
  try {
    const provider = getPaymentProvider('TEST'); // throws when TEST is not allowed in this environment
    const body = JSON.stringify({ id: `evt_${payment.id}_${Date.now()}`, type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed', paymentId: payment.id, providerPaymentId: payment.providerPaymentId ?? `test_${payment.id}`, amountMinor: payment.amountMinor, currency: payment.currency });
    const headers = new Headers({ [TEST_SIGNATURE_HEADER]: signTestPayload(getEnv().AUTH_SECRET, body) });
    await processPaymentEvent('TEST', provider.verifyAndParseWebhook(body, headers), JSON.parse(body));
  } catch (e) { return fail(new BillingError('provider_unavailable')); }
  revalidatePath('/', 'layout');
  return { ok: true, message: outcome === 'success' ? 'paid' : 'payFailed' };
}
