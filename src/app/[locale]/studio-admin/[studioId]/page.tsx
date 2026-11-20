import { notFound } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { assertCan } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function StudioOverview({ params }: { params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const me = await getCurrentUser(); assertCan(me?.actor, 'studio:analytics:view', { studioId: params.studioId });
  const t = createT(params.locale); const intl = localeMeta[params.locale].intl; const since = new Date(Date.now() - 30 * 864e5);
  const [studio, team, byStatus, pending, completed, top] = await Promise.all([
    db.studioProfile.findUnique({ where: { id: params.studioId }, select: { ratingAvg: true, ratingCount: true, status: true } }),
    db.studioMember.count({ where: { studioId: params.studioId, status: 'ACTIVE', role: { not: 'OWNER' } } }),
    db.booking.groupBy({ by: ['status'], where: { studioId: params.studioId, createdAt: { gte: since } }, _count: true }),
    db.booking.count({ where: { studioId: params.studioId, status: 'PENDING', startsAt: { gt: new Date() } } }),
    db.booking.aggregate({ where: { studioId: params.studioId, status: 'COMPLETED', startsAt: { gte: since } }, _sum: { priceMinor: true }, _count: true }),
    db.booking.groupBy({ by: ['masterId'], where: { studioId: params.studioId, status: { in: ['CONFIRMED', 'COMPLETED'] }, startsAt: { gte: since } }, _count: true, orderBy: { _count: { masterId: 'desc' } }, take: 5 }),
  ]);
  const names = new Map((await db.masterProfile.findMany({ where: { id: { in: top.map((x) => x.masterId) } }, select: { id: true, displayName: true } })).map((m) => [m.id, m.displayName]));
  const total30 = byStatus.reduce((s, x) => s + x._count, 0);
  const stats: [string, string | number][] = [[t('studio.stat.team'), team], [t('studio.stat.bookings30'), total30], [t('studio.stat.pending'), pending], [t('studio.stat.revenue30'), formatMoney(completed._sum.priceMinor ?? 0, 'UAH', intl)], [t('card.reviews', { count: studio?.ratingCount ?? 0 }), studio && studio.ratingCount > 0 ? `★ ${Number(studio.ratingAvg).toFixed(1)}` : '—']];
  return (
    <div className="space-y-8"><h1 className="h-section sm:text-3xl">{t('admin.overview')}</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map(([l, v]) => <li key={l}><Card><CardBody><p className="text-sm text-fg-muted">{l}</p><p className="mt-1 text-2xl font-extrabold">{v}</p></CardBody></Card></li>)}</ul>
      <section><h2 className="h-section mb-3">{t('studio.topMasters')}</h2>
        {top.length === 0 ? <p className="text-sm text-fg-muted">{t('dashboard.noBookings')}</p> : <ol className="space-y-2">{top.map((x) => <li key={x.masterId} className="flex justify-between rounded-lg border bg-surface px-4 py-3"><span className="font-semibold">{names.get(x.masterId)}</span><span>{x._count}</span></li>)}</ol>}</section>
    </div>
  );
}
