import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default async function AdminOverview({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const intl = localeMeta[params.locale].intl;
  const since30 = new Date(Date.now() - 30 * 864e5);
  const sixMonthsAgo = new Date(); sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1); sixMonthsAgo.setUTCHours(0, 0, 0, 0);

  const [clients, masters, studios, bookings30, activeSubs, paid] = await Promise.all([
    db.user.count({ where: { roles: { some: { role: 'CLIENT' } }, status: 'ACTIVE' } }),
    db.masterProfile.count({ where: { status: 'PUBLISHED' } }),
    db.studioProfile.count({ where: { status: 'PUBLISHED' } }),
    db.booking.count({ where: { createdAt: { gte: since30 } } }),
    db.subscription.findMany({ where: { status: 'ACTIVE', isDemo: false }, select: { plan: { select: { priceMinor: true, currency: true, interval: true } } } }),
    db.payment.findMany({ where: { status: 'SUCCEEDED', paidAt: { gte: sixMonthsAgo } }, select: { amountMinor: true, paidAt: true } }),
  ]);
  const mrr = activeSubs.reduce((sum, s) => sum + (s.plan.interval === 'YEAR' ? Math.round(s.plan.priceMinor / 12) : s.plan.priceMinor), 0);
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(sixMonthsAgo); d.setUTCMonth(d.getUTCMonth() + i); return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' }).format(d), total: 0 }; });
  for (const p of paid) { const d = p.paidAt!; const m = months.find((x) => x.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`); if (m) m.total += p.amountMinor; }
  const max = Math.max(1, ...months.map((m) => m.total));

  const stats: [string, string | number][] = [[t('admin.stat.clients'), clients], [t('admin.stat.masters'), masters], [t('admin.stat.studios'), studios], [t('admin.stat.bookings30'), bookings30], [t('admin.stat.activeSubs'), activeSubs.length], [t('admin.stat.mrr'), formatMoney(mrr, 'UAH', intl)]];
  return (
    <div className="space-y-8">
      <h1 className="h-section sm:text-3xl">{t('admin.overview')}</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">{stats.map(([label, value]) => <li key={label}><Card><CardBody><p className="text-sm text-fg-muted">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></CardBody></Card></li>)}</ul>
      <section aria-labelledby="rev"><h2 id="rev" className="h-section mb-3">{t('admin.revenue')}</h2>
        <Card><CardBody>
          <div className="flex h-40 items-end gap-3" role="img" aria-label={t('admin.revenue')}>
            {months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs text-fg-muted">{m.total ? formatMoney(m.total, 'UAH', intl) : ''}</span>
                <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(2, (m.total / max) * 100)}%` }} />
                <span className="text-xs">{m.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-muted">{t('admin.revenueNote')}</p>
        </CardBody></Card>
      </section>
    </div>
  );
}
