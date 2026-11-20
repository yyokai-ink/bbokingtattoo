import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

// Tenant isolation: access comes ONLY from an ACTIVE membership of THIS studio; everybody else gets a plain 404.
export default async function StudioAdminLayout({ children, params }: { children: ReactNode; params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const me = await getCurrentUser();
  if (!can(me?.actor, 'studio:dashboard:view', { studioId: params.studioId })) notFound();
  const studio = await db.studioProfile.findUnique({ where: { id: params.studioId }, select: { name: true } });
  if (!studio) notFound();
  const t = createT(params.locale); const base = `/studio-admin/${params.studioId}`;
  const items = [[base, t('admin.overview')], [`${base}/team`, t('studio.team')], [`${base}/bookings`, t('dashboard.bookings')], [`${base}/billing`, t('billing.title')], [`${base}/profile`, t('dashboard.profile')]] as const;
  return (
    <div className="container py-6"><p className="mb-2 text-sm font-semibold text-fg-muted">{studio.name}</p>
      <nav aria-label="Studio" className="mb-6 flex gap-2 overflow-x-auto border-b pb-3">{items.map(([href, label]) => <Link key={href} href={localizePath(params.locale, href)} className="chip chip-idle shrink-0">{label}</Link>)}</nav>{children}</div>
  );
}
