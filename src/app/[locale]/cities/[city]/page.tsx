import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogSearch } from '@/components/catalog/catalog-search';
import { isLocale } from '@/i18n/config';
import { getT } from '@/i18n/server';
import { buildAlternates } from '@/i18n/routing';
import { parseSearchParams } from '@/server/catalog/params';
import { findCity } from '@/server/catalog/seo';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; city: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const city = await findCity(params.city, params.locale);
  if (!city) return {};
  const t = getT(params.locale);
  return { title: t('cityPage.titleCity', { city: city.name }), description: t('cityPage.introCity', { city: city.name }), alternates: buildAlternates(params.locale, `/cities/${city.slug}`) };
}

export default async function CityPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const city = await findCity(params.city, params.locale);
  if (!city) notFound();
  const t = getT(params.locale);
  return <CatalogSearch locale={params.locale} filters={parseSearchParams(searchParams, { city: city.slug })}
    heading={t('cityPage.titleCity', { city: city.name })} intro={t('cityPage.introCity', { city: city.name })} />;
}
