import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/server/payments/registry';
import { ProviderNotConfiguredError, WebhookVerificationError, type PaymentProviderCode } from '@/server/payments/types';
import { processPaymentEvent } from '@/server/billing/service';
import { createRateLimiter } from '@/server/security/rate-limit';
import { clientIp } from '@/server/auth/utils';

export const dynamic = 'force-dynamic';
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
const CODES = new Set(['TEST', 'STRIPE', 'LIQPAY', 'WAYFORPAY']);

/** Provider webhooks. The RAW body is verified before anything else; processing is idempotent. 5xx makes providers retry. */
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const code = params.provider.toUpperCase();
  if (!CODES.has(code)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  if (!limiter.check(`wh:${clientIp(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip'))}`).ok) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 64_000) return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  try {
    const provider = getPaymentProvider(code as PaymentProviderCode);
    const event = provider.verifyAndParseWebhook(raw, req.headers);
    const outcome = await processPaymentEvent(code as PaymentProviderCode, event, JSON.parse(raw));
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    if (e instanceof WebhookVerificationError) return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
    if (e instanceof ProviderNotConfiguredError) return NextResponse.json({ error: 'provider not available' }, { status: 404 });
    console.error('[webhook]', code, e);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
