import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetForm } from '@/components/auth/forms';
import { Alert } from '@/components/ui/alert';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';

type Props = { params: { locale: string }; searchParams: { token?: string } };
export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('auth.resetTitle'), robots: { index: false, follow: false } } : {};
}
export default function ResetPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  return <AuthShell title={t('auth.resetTitle')}>{searchParams.token ? <ResetForm token={searchParams.token} /> : <Alert tone="error">{t('errors.tokenInvalid')}</Alert>}</AuthShell>;
}
