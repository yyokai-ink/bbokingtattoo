import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
const tone = (s: string) => (s === 'SUCCEEDED' || s === 'ACTIVE' ? 'success' : s === 'FAILED' || s === 'EXPIRED' ? 'danger' : s === 'PENDING' || s === 'PAST_DUE' || s === 'GRACE' || s === 'INCOMPLETE' ? 'warning' : 'neutral') as 'success' | 'danger' | 'warning' | 'neutral';

export default async function AdminPayments({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const intl = localeMeta[params.locale].intl;
  const [payments, subs] = await Promise.all([
    db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { payer: { select: { email: true } } } }),
    db.subscription.findMany({ orderBy: { updatedAt: 'desc' }, take: 50, include: { plan: { select: { name: true } }, user: { select: { email: true } }, studio: { select: { name: true } } } }),
  ]);
  return (
    <div className="space-y-10">
      <section><h1 className="h-section mb-3 sm:text-3xl">{t('admin.payments')}</h1>
        <table className="responsive-table"><thead><tr><th className="p-2">{t('billing.date')}</th><th className="p-2">{t('admin.user')}</th><th className="p-2">{t('billing.amount')}</th><th className="p-2">{t('admin.provider')}</th><th className="p-2">{t('billing.statusCol')}</th></tr></thead>
          <tbody>{payments.map((p) => (
            <tr key={p.id} className="border-b"><td data-label={t('billing.date')} className="p-2">{formatDateTime(p.paidAt ?? p.createdAt, intl, 'Europe/Kyiv')}</td><td data-label={t('admin.user')} className="p-2">{p.payer.email}</td><td data-label={t('billing.amount')} className="p-2 font-semibold">{formatMoney(p.amountMinor, p.currency, intl)}</td><td data-label={t('admin.provider')} className="p-2">{p.provider}</td><td data-label={t('billing.statusCol')} className="p-2"><Badge tone={tone(p.status)}>{p.status}</Badge></td></tr>
          ))}</tbody></table>
      </section>
      <section><h2 className="h-section mb-3">{t('admin.subscriptions')}</h2>
        <table className="responsive-table"><thead><tr><th className="p-2">{t('admin.subscriber')}</th><th className="p-2">{t('admin.plan')}</th><th className="p-2">{t('billing.statusCol')}</th><th className="p-2">{t('billing.nextPaymentCol')}</th></tr></thead>
          <tbody>{subs.map((s) => (
            <tr key={s.id} className="border-b"><td data-label={t('admin.subscriber')} className="p-2">{s.user?.email ?? s.studio?.name}{s.isDemo && <Badge className="ml-2">{t('billing.demo')}</Badge>}</td><td data-label={t('admin.plan')} className="p-2">{s.plan.name}</td><td data-label={t('billing.statusCol')} className="p-2"><Badge tone={tone(s.status)}>{s.status}</Badge></td><td data-label={t('billing.nextPaymentCol')} className="p-2">{s.currentPeriodEnd ? formatDateTime(s.currentPeriodEnd, intl, 'Europe/Kyiv') : '—'}</td></tr>
          ))}</tbody></table>
      </section>
    </div>
  );
}
