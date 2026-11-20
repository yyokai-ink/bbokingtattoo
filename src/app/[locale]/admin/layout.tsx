import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

// Authorisation is enforced HERE (server) for every /admin page, and again inside every admin Server Action.
// Non-admins get a plain 404 so the area's existence is not revealed.
export default async function AdminLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const me = await getCurrentUser();
  if (!can(me?.actor, 'admin:access')) notFound();
  const t = createT(params.locale);
  const items = [['/admin', t('admin.overview')], ['/admin/users', t('admin.users')], ['/admin/reviews', t('admin.reviews')], ['/admin/plans', t('admin.plans')], ['/admin/payments', t('admin.payments')], ['/admin/content', t('admin.content.title_page')]] as const;
  return (
    <div className="container py-6">
      <nav aria-label="Admin" className="mb-6 flex gap-2 overflow-x-auto border-b pb-3">
        {items.map(([href, label]) => <Link key={href} href={localizePath(params.locale, href)} className="chip chip-idle shrink-0">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
