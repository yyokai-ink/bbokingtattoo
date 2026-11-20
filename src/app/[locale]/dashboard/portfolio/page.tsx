import { notFound } from 'next/navigation';
import { PortfolioManager } from '@/components/master/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { requireMasterPage } from '@/server/master/context';

export const dynamic = 'force-dynamic';

export default async function DashboardPortfolio({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const { profile, myCategories } = await requireMasterPage(params.locale, '/dashboard/portfolio');
  const t = createT(params.locale);
  const items = await db.portfolioItem.findMany({ where: { masterId: profile.id }, orderBy: { sortOrder: 'asc' } });
  return (
    <div className="container space-y-5 py-8"><h1 className="h-section sm:text-3xl">{t('profile.portfolio')}</h1>
      <PortfolioManager cats={myCategories.map((c) => ({ value: c.slug, label: c.name }))} items={items.map((i) => ({ id: i.id, url: i.url, caption: i.caption, video: i.type === 'VIDEO' }))} /></div>
  );
}
