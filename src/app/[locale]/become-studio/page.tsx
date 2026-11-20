import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResendVerification } from '@/components/auth/forms';
import { Alert } from '@/components/ui/alert';
import { CreateStudioForm } from '@/components/studio/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { getCurrentUser } from '@/server/auth/session';
import { getCategories, getCities } from '@/server/catalog/reference';
import { toCatOpts } from '@/server/master/context';

export const dynamic = 'force-dynamic';
export function generateMetadata({ params }: { params: { locale: string } }): Metadata { return isLocale(params.locale) ? { title: createT(params.locale)('studio.createTitle'), robots: { index: false } } : {}; }

export default async function BecomeStudioPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale; const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/register')}?next=${encodeURIComponent(localizePath(locale, '/become-studio'))}`);
  const t = createT(locale); const [cities, cats] = await Promise.all([getCities(locale), getCategories(locale)]);
  return <AuthShell title={t('studio.createTitle')} intro={t('studio.createIntro')}>{me.emailVerified ? <CreateStudioForm cities={cities.map((c) => ({ value: c.slug, label: c.name }))} cats={toCatOpts(cats)} /> : <div className="space-y-3"><Alert tone="info">{t('booking.verifyToBook')}</Alert><ResendVerification /></div>}</AuthShell>;
}
