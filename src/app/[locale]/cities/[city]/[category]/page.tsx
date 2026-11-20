import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogSearch } from '@/components/catalog/catalog-search';
import { isLocale } from '@/i18n/config';
import { getT } from '@/i18n/server';
import { buildAlternates } from '@/i18n/routing';
import { parseSearchParams } from '@/server/catalog/params';
import { findCategory, findCity } from '@/server/catalog/seo';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; city: string; category: string }; searchParams: Record<string, string | string[] | undefined> };

// e.g. /uk/cities/lviv/tattoo, /en/cities/kyiv/nails — the indexable SEO landing pages
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const [city, category] = await Promise.all([findCity(params.city, params.locale), findCategory(params.category, params.locale)]);
  if (!city || !category) return {};
  const t = getT(params.locale);
  const vars = { city: city.name, category: category.name };
  return { title: t('cityPage.title', vars), description: t('cityPage.intro', vars), alternates: buildAlternates(params.locale, `/cities/${city.slug}/${category.slug}`) };
}

export default async function CityCategoryPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const [city, category] = await Promise.all([findCity(params.city, params.locale), findCategory(params.category, params.locale)]);
  if (!city || !category) notFound();
  const t = getT(params.locale);
  const vars = { city: city.name, category: category.name };
  return <CatalogSearch locale={params.locale} filters={parseSearchParams(searchParams, { city: city.slug, category: category.slug })}
    heading={t('cityPage.title', vars)} intro={t('cityPage.intro', vars)} />;
}
