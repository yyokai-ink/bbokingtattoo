import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { getCurrentUser } from '@/server/auth/session';
import { safeRedirectPath } from '@/server/auth/utils';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string }; searchParams: { next?: string } };

export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('auth.registerTitle'), robots: { index: false } } : {};
}

export default async function RegisterPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  if (await getCurrentUser()) redirect(localizePath(params.locale, '/account'));
  const next = searchParams.next ? safeRedirectPath(searchParams.next, '') || undefined : undefined;
  const t = createT(params.locale);
  return <AuthShell title={t('auth.registerTitle')} intro={t('auth.registerIntro')}><RegisterForm next={next} /></AuthShell>;
}
