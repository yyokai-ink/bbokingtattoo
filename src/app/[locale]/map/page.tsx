import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapExplorer } from '@/components/map/map-explorer';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates } from '@/i18n/routing';
import { getCategories } from '@/server/catalog/reference';

export const dynamic = 'force-dynamic';
export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  const t = createT(params.locale);
  return { title: t('map.title'), description: t('map.subtitle'), alternates: buildAlternates(params.locale, '/map') };
}

export default async function MapPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const cats = await getCategories(params.locale);
  return (
    <div className="container py-8"><h1 className="h-section mb-1 sm:text-3xl">{t('map.title')}</h1><p className="mb-5 text-fg-muted">{t('map.subtitle')}</p>
      <MapExplorer categories={cats.map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.map((s) => ({ slug: s.slug, name: s.name })) }))} /></div>
  );
}
