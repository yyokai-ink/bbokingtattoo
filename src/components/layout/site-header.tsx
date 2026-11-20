import Link from 'next/link';
import { Building2, LayoutDashboard, MapPin, Search, User } from 'lucide-react';
import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { buttonClasses } from '@/components/ui/button';
import { localizePath } from '@/i18n/routing';
import { createT } from '@/i18n/translate';
import { logoutAction } from '@/server/actions/auth';
import { getCurrentUser } from '@/server/auth/session';
import { getAppearance } from '@/server/site-settings';
import type { Locale } from '@/i18n/config';

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = createT(locale);
  const [me, appearance] = await Promise.all([getCurrentUser().catch(() => null), getAppearance()]); // a DB outage must not take the whole header down
  const isMaster = me?.actor.platformRoles.includes('MASTER');
  const studioId = me?.actor.studioMemberships.find((m) => m.status === 'ACTIVE' && (m.role === 'OWNER' || m.role === 'ADMIN'))?.studioId;
  const icon = 'h-4 w-4';
  const label = (text: string) => <><span className="hidden lg:inline">{text}</span><span className="sr-only lg:hidden">{text}</span></>;
  return (
    <header className="sticky top-0 z-40 border-b bg-bg/95 pt-safe md:bg-bg/90 md:backdrop-blur">
      <div className="container flex min-h-16 items-center justify-between gap-2">
        <Link href={localizePath(locale, '/')} aria-label={t('app.name')} className="rounded-md"><Logo name={t('app.name')} src={appearance.logoUrl} /></Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href={localizePath(locale, '/search')} className={buttonClasses('ghost', 'md', 'px-3')}><Search className={icon} aria-hidden />{label(t('nav.search'))}</Link>
          <Link href={localizePath(locale, '/map')} className={buttonClasses('ghost', 'md', 'px-3')}><MapPin className={icon} aria-hidden />{label(t('nav.map'))}</Link>
          {me ? (
            <>
              {studioId && <Link href={localizePath(locale, `/studio-admin/${studioId}`)} className={buttonClasses('ghost', 'md', 'px-3')}><Building2 className={icon} aria-hidden />{label(t('studio.panel'))}</Link>}
              {isMaster && <Link href={localizePath(locale, '/dashboard')} className={buttonClasses('ghost', 'md', 'px-3')}><LayoutDashboard className={icon} aria-hidden />{label(t('dashboard.title'))}</Link>}
              <Link href={localizePath(locale, '/account')} className={buttonClasses('secondary', 'md', 'px-3')}><User className={icon} aria-hidden />{label(me.firstName)}</Link>
              <form action={logoutAction}><input type="hidden" name="locale" value={locale} /><button type="submit" className={buttonClasses('ghost', 'md', 'px-3 text-sm')}>{t('auth.logout')}</button></form>
            </>
          ) : (
            <>
              <Link href={localizePath(locale, '/login')} className={buttonClasses('ghost', 'md', 'px-3')}>{t('auth.login')}</Link>
              <Link href={localizePath(locale, '/register')} className={buttonClasses('primary', 'md', 'hidden px-3 sm:inline-flex')}>{t('auth.register')}</Link>
              <Link href={localizePath(locale, '/become-master')} className={buttonClasses('secondary', 'md', 'hidden px-3 lg:inline-flex')}>{t('nav.becomePartner')}</Link>
            </>
          )}
          <InstallPrompt />
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
