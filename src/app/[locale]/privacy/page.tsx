import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalDocument } from '@/components/layout/legal-document';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates } from '@/i18n/routing';

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  return { title: createT(params.locale)('legal.privacy.title'), alternates: buildAlternates(params.locale, '/privacy') };
}
export default function Page({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <LegalDocument doc="privacy" locale={params.locale} />;
}
