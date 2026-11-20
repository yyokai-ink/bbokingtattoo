import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { TestPayPanel } from '@/components/account/billing-forms';
import { buttonClasses } from '@/components/ui/button';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { getPaymentProvider } from '@/server/payments/registry';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; paymentId: string } };
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TestPayPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  try { getPaymentProvider('TEST'); } catch { notFound(); } // the page does not exist where test payments are not allowed
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, `/pay/test/${params.paymentId}`))}`);
  const p = await db.payment.findFirst({ where: { id: params.paymentId, payerUserId: me.id, provider: 'TEST' }, include: { subscription: { include: { plan: true } } } });
  if (!p) notFound();
  const t = createT(locale);
  return (
    <AuthShell title={t('billing.test.title')} intro={`${p.subscription?.plan.name ?? ''} — ${formatMoney(p.amountMinor, p.currency, localeMeta[locale].intl)}`}>
      {p.status === 'PENDING' ? <TestPayPanel paymentId={p.id} /> : <p className="text-sm text-fg-muted">{t(`billing.paymentStatus.${p.status}`)}</p>}
      <Link href={localizePath(locale, '/dashboard/subscription')} className={buttonClasses('secondary')}>{t('billing.title')}</Link>
    </AuthShell>
  );
}
