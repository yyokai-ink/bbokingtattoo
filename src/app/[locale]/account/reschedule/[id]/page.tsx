import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { AuthShell } from '@/components/auth/auth-shell';
import { RescheduleForm } from '@/components/account/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { canReschedule, type BookingStatus } from '@/server/booking/rules';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; id: string } };

export function generateMetadata({ params }: Props): Metadata {
  return isLocale(params.locale) ? { title: createT(params.locale)('account.reschedule'), robots: { index: false } } : {};
}

export default async function ReschedulePage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, `/account/reschedule/${params.id}`))}`);
  const b = await db.booking.findFirst({ where: { id: params.id, clientId: me.id }, include: { service: { select: { name: true } } } }); // scoped to the owner: other ids simply 404
  if (!b) notFound();
  const t = createT(locale);
  const ok = canReschedule(b.status as BookingStatus, b.startsAt);
  return (
    <AuthShell title={t('account.reschedule')} intro={`${b.service.name} · ${formatDateTime(b.startsAt, localeMeta[locale].intl, b.timezone)}`}>
      {ok ? <><Alert tone="info">{t('account.rescheduleNote')}</Alert><RescheduleForm bookingId={b.id} masterId={b.masterId} serviceId={b.serviceId} /></> : <Alert tone="error">{t('errors.too_late')}</Alert>}
    </AuthShell>
  );
}
