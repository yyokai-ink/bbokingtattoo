import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardBody } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button';
import { MarkRead } from '@/components/account/mark-read';
import { CancelBookingButton, DeleteAccountForm, PasswordForm, ProfileForm, ReviewForm } from '@/components/account/forms';
import { ResendVerification } from '@/components/auth/forms';
import { isLocale, localeMeta, type Locale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { publicMasterWhere, publicStudioWhere } from '@/server/catalog/visibility';
import { canClientCancel, canReschedule, canReview, type BookingStatus } from '@/server/booking/rules';
import { formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('account.title'), robots: { index: false } } : {};
}

const tone = (s: string) => (s === 'CONFIRMED' || s === 'COMPLETED' ? 'success' : s === 'PENDING' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';

export default async function AccountPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale: Locale = params.locale;
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, '/account'))}`);
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  const now = new Date();

  const [bookings, favMasters, favStudios, notifications] = await Promise.all([
    db.booking.findMany({ where: { clientId: me.id }, orderBy: { startsAt: 'desc' }, take: 60,
      include: { service: { select: { name: true } }, master: { select: { displayName: true, slug: true } }, review: { select: { status: true } } } }),
    db.favorite.findMany({ where: { userId: me.id, master: { is: publicMasterWhere } }, include: { master: { select: { slug: true, displayName: true, headline: true } } } }),
    db.favorite.findMany({ where: { userId: me.id, studio: { is: publicStudioWhere } }, include: { studio: { select: { slug: true, name: true } } } }),
    db.notification.findMany({ where: { userId: me.id, channel: 'IN_APP' }, orderBy: { createdAt: 'desc' }, take: 15 }),
  ]);
  const upcoming = bookings.filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.startsAt >= now).reverse();
  const history = bookings.filter((b) => !upcoming.includes(b));
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="container space-y-10 py-8">
      <header><h1 className="h-section sm:text-3xl">{t('account.hello', { name: me.firstName })}</h1></header>
      {!me.emailVerified && <Alert tone="info"><div className="space-y-2"><p>{t('auth.verifyHint')}</p><ResendVerification /></div></Alert>}

      <section aria-labelledby="up"><h2 id="up" className="h-section mb-3">{t('account.upcoming')}</h2>
        {upcoming.length === 0 ? <p className="text-sm text-fg-muted">{t('account.noUpcoming')}</p> : (
          <ul className="space-y-3">{upcoming.map((b) => (
            <li key={b.id}><Card><CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{b.service.name} · <Link className="text-brand hover:underline" href={localizePath(locale, `/master/${b.master.slug}`)}>{b.master.displayName}</Link></p>
                <p className="text-sm text-fg-muted">{formatDateTime(b.startsAt, intl, b.timezone)} · {formatMoney(b.priceMinor, b.currency, intl)}</p>
                <Badge tone={tone(b.status)}>{t(`account.status.${b.status}`)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {canReschedule(b.status as BookingStatus, b.startsAt, now) && <Link href={localizePath(locale, `/account/reschedule/${b.id}`)} className={buttonClasses('secondary', 'md', 'min-h-9 px-3')}>{t('account.reschedule')}</Link>}
                {canClientCancel(b.status as BookingStatus, b.startsAt, now) && <CancelBookingButton bookingId={b.id} />}
              </div>
            </CardBody></Card></li>
          ))}</ul>)}
      </section>

      <section aria-labelledby="hist"><h2 id="hist" className="h-section mb-3">{t('account.history')}</h2>
        {history.length === 0 ? <p className="text-sm text-fg-muted">{t('account.noHistory')}</p> : (
          <ul className="space-y-3">{history.map((b) => (
            <li key={b.id}><Card><CardBody className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{b.service.name} · <Link className="text-brand hover:underline" href={localizePath(locale, `/master/${b.master.slug}`)}>{b.master.displayName}</Link></p>
                <Badge tone={tone(b.status)}>{t(`account.status.${b.status}`)}</Badge>
              </div>
              <p className="text-sm text-fg-muted">{formatDateTime(b.startsAt, intl, b.timezone)}</p>
              {b.review ? <p className="text-sm text-fg-muted">{t(b.review.status === 'PUBLISHED' ? 'account.reviewPublished' : 'account.reviewPending')}</p>
                : canReview(b.status as BookingStatus, b.startsAt, false, now) && <ReviewForm bookingId={b.id} />}
            </CardBody></Card></li>
          ))}</ul>)}
      </section>

      <section aria-labelledby="fav"><h2 id="fav" className="h-section mb-3">{t('account.favorites')}</h2>
        {favMasters.length + favStudios.length === 0 ? <p className="text-sm text-fg-muted">{t('account.noFavorites')}</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {favMasters.map((f) => f.master && <li key={f.id}><Link href={localizePath(locale, `/master/${f.master.slug}`)} className="block rounded-lg border bg-surface p-4 hover:bg-muted"><p className="font-semibold">{f.master.displayName}</p><p className="text-sm text-fg-muted">{f.master.headline}</p></Link></li>)}
            {favStudios.map((f) => f.studio && <li key={f.id}><Link href={localizePath(locale, `/studio/${f.studio.slug}`)} className="block rounded-lg border bg-surface p-4 hover:bg-muted"><p className="font-semibold">{f.studio.name}</p></Link></li>)}
          </ul>)}
      </section>

      <section aria-labelledby="notif"><div className="mb-3 flex items-center justify-between gap-3"><h2 id="notif" className="h-section">{t('account.notifications')}{unread > 0 && <Badge tone="brand" className="ml-2">{unread}</Badge>}</h2>{unread > 0 && <MarkRead />}</div>
        {notifications.length === 0 ? <p className="text-sm text-fg-muted">{t('account.noNotifications')}</p> : (
          <ul className="divide-y rounded-lg border bg-surface">{notifications.map((n) => {
            const p = n.payload as { service: string; startsAt: string; timezone: string; name: string } | null;
            return <li key={n.id} className={`px-4 py-3 text-sm ${n.readAt ? 'text-fg-muted' : 'font-semibold'}`}>{p ? t(`notification.${n.type}`, { service: p.service, name: p.name, when: formatDateTime(p.startsAt, intl, p.timezone) }) : n.type}</li>;
          })}</ul>)}
      </section>

      <section aria-labelledby="set" className="grid gap-8 lg:grid-cols-2">
        <div><h2 id="set" className="h-section mb-3">{t('account.profile')}</h2><ProfileForm firstName={me.firstName} lastName={me.lastName} phone={me.phone ?? ''} userLocale={me.locale} /></div>
        <div className="space-y-6"><div><h2 className="h-section mb-3">{t('account.security')}</h2><PasswordForm /></div><DeleteAccountForm /></div>
      </section>
    </div>
  );
}
