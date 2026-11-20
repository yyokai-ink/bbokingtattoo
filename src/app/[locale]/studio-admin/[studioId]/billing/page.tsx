import { notFound } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { BillingButton } from '@/components/studio/forms';
import { PayNowButton } from '@/components/account/billing-forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { assertCan } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { getStudioInvoices } from '@/server/billing/service';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function StudioBilling({ params }: { params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const sid = params.studioId; const me = await getCurrentUser(); assertCan(me?.actor, 'studio:billing:view', { studioId: sid });
  const t = createT(params.locale); const intl = localeMeta[params.locale].intl; const money = (m: number, c: string) => formatMoney(m, c, intl);
  const [inv, sub, payments] = await Promise.all([getStudioInvoices(sid).catch(() => null),
    db.subscription.findFirst({ where: { studioId: sid, status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'GRACE'] } }, include: { plan: true } }),
    db.payment.findMany({ where: { studioId: sid }, orderBy: { createdAt: 'desc' }, take: 30 })]);
  const pending = payments.find((p) => p.status === 'PENDING');
  const live = sub && sub.status !== 'INCOMPLETE';
  return (
    <div className="space-y-8"><h1 className="h-section sm:text-3xl">{t('billing.title')}</h1>
      {!inv ? <Alert tone="info">{t('partners.noPlans')}</Alert> : (
        <Card><CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{inv.plan.name}</h2>{sub ? <Badge tone={sub.status === 'ACTIVE' ? 'success' : 'warning'}>{t(`billing.status.${sub.status}`)}</Badge> : <Badge>{t('billing.status.INCOMPLETE')}</Badge>}{sub?.isDemo && <Badge>{t('billing.demo')}</Badge>}</div>
          {sub?.currentPeriodEnd && <p className="text-sm text-fg-muted">{sub.cancelAtPeriodEnd ? t('billing.endsOn', { date: formatDate(sub.currentPeriodEnd, intl, 'Europe/Kyiv') }) : t('billing.nextPayment', { date: formatDate(sub.currentPeriodEnd, intl, 'Europe/Kyiv') })}</p>}
          <div className="rounded-md bg-brand-soft p-4 text-sm"><p className="font-semibold">{t('studio.invoice')}</p>
            <ul className="mt-2 space-y-1">{inv.subscription.items.map((i) => <li key={i.code} className="flex justify-between gap-4"><span>{t(`studio.item.${i.code}`)} × {i.quantity}</span><span>{money(i.totalMinor, inv.subscription.currency)}</span></li>)}</ul>
            <p className="mt-2 flex justify-between border-t pt-2 font-bold"><span>{t('studio.total')}</span><span>{money(inv.subscription.totalMinor, inv.subscription.currency)}</span></p></div>
          {sub?.status === 'GRACE' && <Alert tone="error">{t('billing.graceNote', { date: sub.graceEndsAt ? formatDate(sub.graceEndsAt, intl, 'Europe/Kyiv') : '' })}</Alert>}
          <div className="flex flex-wrap gap-3">
            {pending && <PayNowButton paymentId={pending.id} />}
            {!live && !pending && <BillingButton studioId={sid} action="subscribe" label={t('billing.choose')} />}
            {live && inv.fees.totalMinor > 0 && <BillingButton studioId={sid} action="fees" label={t('studio.payFees', { amount: money(inv.fees.totalMinor, inv.fees.currency) })} />}
            {sub?.status === 'ACTIVE' && <BillingButton studioId={sid} action={sub.cancelAtPeriodEnd ? 'resume' : 'cancel'} variant="secondary" label={t(sub.cancelAtPeriodEnd ? 'billing.resume' : 'billing.cancel')} />}
          </div>
          <p className="text-xs text-fg-muted">{t('studio.billingNote')}</p>
        </CardBody></Card>)}
      <section><h2 className="h-section mb-3">{t('billing.history')}</h2>
        {payments.length === 0 ? <p className="text-sm text-fg-muted">{t('billing.noPayments')}</p> : <ul className="divide-y rounded-lg border bg-surface">{payments.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span>{formatDateTime(p.paidAt ?? p.createdAt, intl, 'Europe/Kyiv')}</span><span className="font-semibold">{money(p.amountMinor, p.currency)}</span><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'neutral'}>{t(`billing.paymentStatus.${p.status}`)}</Badge></li>)}</ul>}</section>
    </div>
  );
}
