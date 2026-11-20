import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runBillingCycle } from '@/server/billing/service';

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false; // disabled until a strong secret is configured
  const given = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await runBillingCycle());
}
export const POST = run;
export const GET = run;
