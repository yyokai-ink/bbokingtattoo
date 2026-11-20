import Link from 'next/link';
import { headers } from 'next/headers';
import { buttonClasses } from '@/components/ui/button';
import { defaultLocale, isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';

export default function NotFound() {
  // not-found gets no params; the locale cookie set by middleware is the best hint
  const cookie = headers().get('cookie')?.match(/NEXT_LOCALE=([a-z]{2})/)?.[1];
  const locale = isLocale(cookie) ? cookie : defaultLocale;
  const t = createT(locale);
  return (
    <div className="container py-24 text-center">
      <h1 className="h-display">404</h1>
      <p className="mt-3 font-semibold">{t('profile.notFound')}</p>
      <p className="mt-1 text-fg-muted">{t('profile.notFoundHint')}</p>
      <Link href={localizePath(locale, '/search')} className={`${buttonClasses('primary')} mt-6`}>{t('nav.search')}</Link>
    </div>
  );
}
