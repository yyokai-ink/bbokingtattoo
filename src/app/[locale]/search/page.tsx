import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogSearch } from '@/components/catalog/catalog-search';
import { isLocale } from '@/i18n/config';
import { getT } from '@/i18n/server';
import { parseSearchParams } from '@/server/catalog/params';
import { buildAlternates } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  if (!isLocale(params.locale)) return {};
  const t = getT(params.locale);
  // Faceted search URLs are not indexed; the SEO landing pages /cities/<city>/<category> are.
  return { title: t('search.title'), description: t('meta.searchDescription'), robots: { index: false, follow: true }, alternates: buildAlternates(params.locale, '/search') };
}

export default function SearchPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const t = getT(params.locale);
  return <CatalogSearch locale={params.locale} filters={parseSearchParams(searchParams)} heading={t('search.title')} />;
}
