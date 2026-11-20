import { NextResponse } from 'next/server';
import { getMapPoints } from '@/server/catalog/map';
import { parseSearchParams } from '@/server/catalog/params';
import { createRateLimiter } from '@/server/security/rate-limit';
import { clientIp } from '@/server/auth/utils';
import { isLocale, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';
const limiter = createRateLimiter({ limit: 90, windowMs: 60_000 });

/** Public read-only: masters as map points. Filters are parsed/validated by the same parser as the search page. */
export async function GET(req: Request) {
  if (!limiter.check(`map:${clientIp(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip'))}`).ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const url = new URL(req.url);
  const locale = url.searchParams.get('locale');
  const filters = parseSearchParams(Object.fromEntries(url.searchParams.entries()));
  const points = await getMapPoints(filters, isLocale(locale) ? locale : defaultLocale);
  return NextResponse.json({ points }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
