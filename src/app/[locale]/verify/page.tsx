import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyForm } from '@/components/auth/forms';
import { Alert } from '@/components/ui/alert';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';

type Props = { params: { locale: string }; searchParams: { token?: string } };
export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('auth.verifyTitle'), robots: { index: false, follow: false } } : {};
}
// The token is consumed by a POST (button), not by the GET: mail scanners / link prefetchers cannot burn it.
export default function VerifyPage({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  return <AuthShell title={t('auth.verifyTitle')} intro={t('auth.verifyIntro')}>{searchParams.token ? <VerifyForm token={searchParams.token} /> : <Alert tone="error">{t('errors.tokenInvalid')}</Alert>}</AuthShell>;
}
