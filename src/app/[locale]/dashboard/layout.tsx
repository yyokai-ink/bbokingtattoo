import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';

export default function DashboardLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const items = [['/dashboard', t('dashboard.bookings')], ['/dashboard/profile', t('dashboard.profile')], ['/dashboard/portfolio', t('profile.portfolio')], ['/dashboard/services', t('profile.services')], ['/dashboard/schedule', t('dashboard.schedule')], ['/dashboard/subscription', t('billing.title')]] as const;
  return (
    <div>
      <nav aria-label="Dashboard" className="container mt-4 flex gap-2 overflow-x-auto border-b pb-3">
        {items.map(([href, label]) => <Link key={href} href={localizePath(params.locale, href)} className="chip chip-idle shrink-0">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
