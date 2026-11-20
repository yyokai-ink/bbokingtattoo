'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, LogIn, MapPin, Search, User } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { localizePath, splitLocale } from '@/i18n/routing';
import { cn } from '@/lib/cn';

/** Bottom tab bar for phones (hidden from md up). Respects the iPhone home-indicator safe area. */
export function MobileNav({ loggedIn, isMaster }: { loggedIn: boolean; isMaster: boolean }) {
  const { t, locale } = useI18n();
  const { path } = splitLocale(usePathname() ?? '/');
  const items = [
    { href: '/', label: t('nav.home'), Icon: Home },
    { href: '/search', label: t('nav.search'), Icon: Search },
    { href: '/map', label: t('nav.map'), Icon: MapPin },
    ...(isMaster ? [{ href: '/dashboard', label: t('dashboard.title'), Icon: LayoutDashboard }] : []),
    loggedIn ? { href: '/account', label: t('account.title'), Icon: User } : { href: '/login', label: t('auth.login'), Icon: LogIn },
  ];
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 pb-safe md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label, Icon }) => (
          <li key={href} className="flex-1">
            <Link href={localizePath(locale, href)} aria-current={isActive(href) ? 'page' : undefined}
              className={cn('flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-semibold transition-colors', isActive(href) ? 'text-brand' : 'text-fg-muted')}>
              <Icon className={cn('h-5 w-5', isActive(href) && 'stroke-[2.5]')} aria-hidden /><span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
