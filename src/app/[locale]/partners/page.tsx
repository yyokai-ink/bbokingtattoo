import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';
import { localizePath } from '@/i18n/routing';
import { Card, CardBody } from '@/components/ui/card';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates } from '@/i18n/routing';
import { db } from '@/server/db';
import { formatMoney } from '@/lib/money';
import { calculateStudioMonthly } from '@/server/billing/studio-pricing';

export const dynamic = 'force-dynamic'; // prices are data (SubscriptionPlan) and may change at any time

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  return { title: createT(params.locale)('partners.title'), alternates: buildAlternates(params.locale, '/partners') };
}

export default async function PartnersPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const intl = localeMeta[params.locale].intl;
  const plans = await db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const individual = plans.filter((p) => p.kind === 'INDIVIDUAL');
  const studio = plans.find((p) => p.kind === 'STUDIO');
  const money = (minor: number, currency: string) => formatMoney(minor, currency, intl);
  const exampleCount = 5;
  const example = studio ? calculateStudioMonthly(
    { baseMinor: studio.priceMinor, seatMinor: studio.seatPriceMinor ?? 0, connectionFeeMinor: studio.connectionFeeMinor ?? 0, currency: studio.currency },
    Array.from({ length: exampleCount }, (_, i) => ({ userId: `u${i}`, status: 'ACTIVE' as const, countsAsSeat: true, connectionFeePaidAt: new Date() })),
  ) : null;

  return (
    <div className="container py-10">
      <header className="max-w-3xl">
        <h1 className="h-display">{t('partners.title')}</h1>
        <p className="mt-3 text-lg text-fg-muted">{t('partners.intro')}</p>
      </header>

      {plans.length === 0 ? <Alert tone="info" className="mt-8">{t('partners.noPlans')}</Alert> : (
        <>
          <section className="mt-10">
            <h2 className="h-section mb-4">{t('partners.individual')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {individual.map((p) => (
                <Card key={p.id}><CardBody>
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <p className="mt-2 text-2xl font-extrabold">{t('partners.perMonth', { price: money(p.priceMinor, p.currency) })}</p>
                  {typeof (p.features as { portfolioItems?: number } | null)?.portfolioItems === 'number' && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted"><Check className="h-4 w-4 text-success" aria-hidden />{(p.features as { portfolioItems: number }).portfolioItems} {t('profile.portfolio').toLowerCase()}</p>
                  )}
                </CardBody></Card>
              ))}
            </div>
          </section>

          {studio && example && (
            <section className="mt-12">
              <h2 className="h-section mb-4">{t('partners.studio')}</h2>
              <Card><CardBody className="space-y-2">
                <h3 className="text-lg font-bold">{studio.name}</h3>
                <p className="text-2xl font-extrabold">{t('partners.perMonth', { price: money(studio.priceMinor, studio.currency) })}</p>
                {studio.seatPriceMinor !== null && <p className="text-sm">{t('partners.seat', { price: money(studio.seatPriceMinor, studio.currency) })}</p>}
                {studio.connectionFeeMinor !== null && <p className="text-sm">{t('partners.connection', { price: money(studio.connectionFeeMinor, studio.currency) })}</p>}
                <div className="mt-4 rounded-md bg-brand-soft p-4 text-sm">
                  <p className="font-semibold">{t('partners.formulaTitle')}</p>
                  <p className="mt-1">{t('partners.formula')}</p>
                  <p className="mt-1 text-fg-muted">{t('partners.example', { count: exampleCount, total: money(example.totalMinor, example.currency) })}</p>
                </div>
              </CardBody></Card>
            </section>
          )}
        </>
      )}
      <Link href={localizePath(params.locale, '/become-master')} className={`${buttonClasses('primary', 'lg')} mt-10`}>{t('partners.becomeCta')}</Link>
    </div>
  );
}
