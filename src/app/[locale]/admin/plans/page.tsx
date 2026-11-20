import { notFound } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { PlanForm } from '@/components/admin/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function AdminPlans({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const plans = await db.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  return (
    <div className="space-y-5">
      <h1 className="h-section sm:text-3xl">{t('admin.plans')}</h1>
      <p className="max-w-2xl text-sm text-fg-muted">{t('admin.plansNote')}</p>
      <div className="grid gap-4 md:grid-cols-2">{plans.map((p) => (
        <Card key={p.id}><CardBody><PlanForm planId={p.id} name={`${p.name} (${p.kind === 'STUDIO' ? t('partners.studio') : t('partners.individual')})`} studio={p.kind === 'STUDIO'} price={p.priceMinor / 100} seat={p.seatPriceMinor === null ? null : p.seatPriceMinor / 100} fee={p.connectionFeeMinor === null ? null : p.connectionFeeMinor / 100} active={p.isActive} /></CardBody></Card>
      ))}</div>
    </div>
  );
}
