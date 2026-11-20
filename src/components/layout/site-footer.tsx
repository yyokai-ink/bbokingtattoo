import Link from 'next/link';
import { getT } from '@/i18n/server';
import { localizePath } from '@/i18n/routing';
import type { Locale } from '@/i18n/config';

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const links = [['/search', t('nav.search')], ['/map', t('nav.map')], ['/partners', t('nav.partners')], ['/terms', t('legal.footerTerms')], ['/privacy', t('legal.footerPrivacy')]] as const;
  return (
    <footer className="mt-16 border-t pb-safe">
      <div className="container flex flex-col gap-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {t('app.name')}. {t('footer.rights')}</p>
        <ul className="flex flex-wrap gap-x-6">{links.map(([href, label]) => <li key={href}><Link href={localizePath(locale, href)} className="inline-flex min-h-touch items-center hover:text-fg">{label}</Link></li>)}</ul>
      </div>
    </footer>
  );
}
