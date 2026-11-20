import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardBody } from '@/components/ui/card';
import { ProviderActions } from '@/components/account/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { canProviderCancel, canProviderComplete, canProviderConfirm, type BookingStatus } from '@/server/booking/rules';
import { formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('dashboard.title'), robots: { index: false } } : {};
}

// Stage 3a: bookings section of the master dashboard. Profile, portfolio, services, calendar, clients, reviews… arrive in 3b.
export default async function DashboardPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, '/dashboard'))}`);
  const t = createT(locale);
  const profile = await db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true, userId: true } });
  if (!profile) redirect(localizePath(locale, '/become-master'));
  if (!can(me.actor, 'master:bookings:manage', { masterUserId: profile.userId })) return <div className="container py-10"><Alert tone="info">{t('dashboard.notMaster')}</Alert></div>;

  const intl = localeMeta[locale].intl;
  const now = new Date();
  const bookings = await db.booking.findMany({ where: { masterId: profile.id }, orderBy: { startsAt: 'asc' }, take: 200, include: { service: { select: { name: true } } } });
  const pending = bookings.filter((b) => b.status === 'PENDING');
  const upcoming = bookings.filter((b) => b.status === 'CONFIRMED' && b.endsAt >= now);
  const past = bookings.filter((b) => !pending.includes(b) && !upcoming.includes(b)).reverse().slice(0, 30);

  const list = (items: typeof bookings, empty: string) => items.length === 0 ? <p className="text-sm text-fg-muted">{empty}</p> : (
    <ul className="space-y-3">{items.map((b) => {
      const s = b.status as BookingStatus;
      return (
        <li key={b.id}><Card><CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{b.service.name} · {formatDateTime(b.startsAt, intl, b.timezone)}</p>
            <p className="text-sm text-fg-muted">{t('dashboard.client')}: {b.clientName} · <a className="underline" href={`tel:${b.clientPhone.replace(/[^+\d]/g, '')}`}>{b.clientPhone}</a> · {formatMoney(b.priceMinor, b.currency, intl)}</p>
            {b.clientNote && <p className="text-sm text-fg-muted">“{b.clientNote}”</p>}
            <Badge tone={s === 'CONFIRMED' || s === 'COMPLETED' ? 'success' : s === 'PENDING' ? 'warning' : 'neutral'}>{t(`account.status.${s}`)}</Badge>
          </div>
          <ProviderActions bookingId={b.id} can={{ confirm: canProviderConfirm(s), cancel: canProviderCancel(s), complete: canProviderComplete(s, b.startsAt, now) }} />
        </CardBody></Card></li>
      );
    })}</ul>
  );

  return (
    <div className="container space-y-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="h-section sm:text-3xl">{t('dashboard.title')}</h1><Link href={localizePath(locale, '/dashboard/subscription')} className={buttonClasses('secondary')}>{t('billing.title')}</Link></div>
      <section><h2 className="h-section mb-3">{t('dashboard.pending')}</h2>{list(pending, t('dashboard.noBookings'))}</section>
      <section><h2 className="h-section mb-3">{t('dashboard.upcoming')}</h2>{list(upcoming, t('dashboard.noBookings'))}</section>
      <section><h2 className="h-section mb-3">{t('dashboard.past')}</h2>{list(past, t('dashboard.noBookings'))}</section>
    </div>
  );
}
