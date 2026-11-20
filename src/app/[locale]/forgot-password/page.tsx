import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotForm } from '@/components/auth/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';

type Props = { params: { locale: string } };
export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('auth.forgotTitle'), robots: { index: false } } : {};
}
export default function ForgotPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  return <AuthShell title={t('auth.forgotTitle')} intro={t('auth.forgotIntro')}><ForgotForm /></AuthShell>;
}
