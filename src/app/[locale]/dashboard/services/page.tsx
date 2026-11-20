import { notFound } from 'next/navigation';
import { ServiceForm } from '@/components/master/forms';
import { Alert } from '@/components/ui/alert';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { requireMasterPage, toCatOpts } from '@/server/master/context';

export const dynamic = 'force-dynamic';

export default async function DashboardServices({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const { profile, myCategories } = await requireMasterPage(params.locale, '/dashboard/services');
  const t = createT(params.locale);
  const cats = toCatOpts(myCategories);
  const services = await db.service.findMany({ where: { masterId: profile.id, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { prices: { where: { currency: 'UAH' } }, category: { select: { slug: true } }, subcategory: { select: { slug: true } } } });
  return (
    <div className="container space-y-6 py-8"><h1 className="h-section sm:text-3xl">{t('profile.services')}</h1>
      {cats.length === 0 ? <Alert tone="info">{t('dashboard.missing.category')}</Alert> : <>
        <section><h2 className="mb-3 font-bold">{t('dashboard.addService')}</h2><ServiceForm cats={cats} /></section>
        {services.map((s) => (
          <section key={s.id}><ServiceForm cats={cats} service={{ id: s.id, name: s.name, description: s.description ?? '', durationMin: s.durationMin, bufferMin: s.bufferMin, price: (s.prices[0]?.amountMinor ?? 0) / 100, isFrom: s.prices[0]?.isFrom ?? false, category: s.category.slug, sub: s.subcategory?.slug ?? '' }} /></section>
        ))}</>}
    </div>
  );
}
