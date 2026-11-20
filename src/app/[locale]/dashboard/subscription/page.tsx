import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { CancelResume, ChoosePlanButton, PayNowButton } from '@/components/account/billing-forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string } };
export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('billing.title'), robots: { index: false } } : {};
}

const tone = (s: string) => (s === 'ACTIVE' || s === 'SUCCEEDED' ? 'success' : s === 'PAST_DUE' || s === 'GRACE' || s === 'PENDING' || s === 'INCOMPLETE' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';

export default async function SubscriptionPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, '/dashboard/subscription'))}`);
  const t = createT(locale);
  if (!can(me.actor, 'master:profile:edit', { masterUserId: me.id })) return <div className="container py-10"><Alert tone="info">{t('dashboard.notMaster')}</Alert></div>;

  const intl = localeMeta[locale].intl;
  const [plans, sub, payments] = await Promise.all([
    db.subscriptionPlan.findMany({ where: { kind: 'INDIVIDUAL', isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.subscription.findFirst({ where: { userId: me.id, status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'GRACE'] } }, include: { plan: true } }),
    db.payment.findMany({ where: { payerUserId: me.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  const pending = payments.find((p) => p.status === 'PENDING' && p.subscriptionId === sub?.id);
  const money = (m: number, c: string) => formatMoney(m, c, intl);

  return (
    <div className="container space-y-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="h-section sm:text-3xl">{t('billing.title')}</h1><Link href={localizePath(locale, '/dashboard')} className={buttonClasses('secondary')}>{t('dashboard.title')}</Link></div>

      {sub ? (
        <Card><CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{sub.plan.name}</h2><Badge tone={tone(sub.status)}>{t(`billing.status.${sub.status}`)}</Badge>{sub.isDemo && <Badge>{t('billing.demo')}</Badge>}</div>
          <p className="text-sm">{t('partners.perMonth', { price: money(sub.plan.priceMinor, sub.plan.currency) })}</p>
          {sub.currentPeriodEnd && <p className="text-sm text-fg-muted">{sub.cancelAtPeriodEnd ? t('billing.endsOn', { date: formatDate(sub.currentPeriodEnd, intl, 'Europe/Kyiv') }) : t('billing.nextPayment', { date: formatDate(sub.currentPeriodEnd, intl, 'Europe/Kyiv') })}</p>}
          {sub.status === 'GRACE' && <Alert tone="error">{t('billing.graceNote', { date: sub.graceEndsAt ? formatDate(sub.graceEndsAt, intl, 'Europe/Kyiv') : '' })}</Alert>}
          {sub.status === 'PAST_DUE' && <Alert tone="info">{t('billing.pastDueNote')}</Alert>}
          {sub.status === 'INCOMPLETE' && <Alert tone="info">{t('billing.incompleteNote')}</Alert>}
          <div className="flex flex-wrap gap-3">
            {pending && <PayNowButton paymentId={pending.id} />}
            {(sub.status === 'ACTIVE' || sub.status === 'INCOMPLETE') && <CancelResume cancelling={sub.cancelAtPeriodEnd} />}
          </div>
        </CardBody></Card>
      ) : <Alert tone="info">{t('billing.noSubscription')}</Alert>}

      {(!sub || sub.status === 'INCOMPLETE') && (
        <section><h2 className="h-section mb-3">{t('billing.choosePlan')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">{plans.map((p) => (
            <Card key={p.id}><CardBody className="space-y-3"><h3 className="text-lg font-bold">{p.name}</h3><p className="text-2xl font-extrabold">{t('partners.perMonth', { price: money(p.priceMinor, p.currency) })}</p><ChoosePlanButton planCode={p.code} label={t('billing.choose')} /></CardBody></Card>
          ))}</div>
          <p className="mt-3 text-xs text-fg-muted">{t('billing.profileNote')}</p>
        </section>
      )}

      <section><h2 className="h-section mb-3">{t('billing.history')}</h2>
        {payments.length === 0 ? <p className="text-sm text-fg-muted">{t('billing.noPayments')}</p> : (
          <table className="responsive-table"><thead><tr><th className="p-2">{t('billing.date')}</th><th className="p-2">{t('billing.amount')}</th><th className="p-2">{t('billing.statusCol')}</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id} className="border-b"><td data-label={t('billing.date')} className="p-2">{formatDateTime(p.paidAt ?? p.createdAt, intl, 'Europe/Kyiv')}</td><td data-label={t('billing.amount')} className="p-2 font-semibold">{money(p.amountMinor, p.currency)}</td><td data-label={t('billing.statusCol')} className="p-2"><Badge tone={tone(p.status)}>{t(`billing.paymentStatus.${p.status}`)}</Badge></td></tr>
            ))}</tbody></table>)}
      </section>
    </div>
  );
}
