import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { ProviderActions } from '@/components/account/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { assertCan, can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { canProviderCancel, canProviderComplete, canProviderConfirm, type BookingStatus } from '@/server/booking/rules';
import { formatDateTime } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function StudioBookings({ params }: { params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const sid = params.studioId; const me = await getCurrentUser(); assertCan(me?.actor, 'studio:bookings:view_all', { studioId: sid });
  const t = createT(params.locale); const intl = localeMeta[params.locale].intl; const now = new Date();
  const canManage = can(me?.actor, 'studio:bookings:manage', { studioId: sid });
  const items = await db.booking.findMany({ where: { studioId: sid, startsAt: { gte: new Date(now.getTime() - 14 * 864e5) } }, orderBy: { startsAt: 'asc' }, take: 200, include: { service: { select: { name: true } }, master: { select: { displayName: true } } } });
  return (
    <div className="space-y-5"><h1 className="h-section sm:text-3xl">{t('dashboard.bookings')}</h1>
      {items.length === 0 ? <p className="text-sm text-fg-muted">{t('dashboard.noBookings')}</p> : <ul className="space-y-3">{items.map((b) => { const s = b.status as BookingStatus; return (
        <li key={b.id}><Card><CardBody className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className="font-semibold">{b.master.displayName} · {b.service.name}</p><p className="text-sm text-fg-muted">{formatDateTime(b.startsAt, intl, b.timezone)} · {b.clientName} · {formatMoney(b.priceMinor, b.currency, intl)}</p><Badge tone={s === 'CONFIRMED' || s === 'COMPLETED' ? 'success' : s === 'PENDING' ? 'warning' : 'neutral'}>{t(`account.status.${s}`)}</Badge></div>
          {canManage && <ProviderActions bookingId={b.id} can={{ confirm: canProviderConfirm(s), cancel: canProviderCancel(s), complete: canProviderComplete(s, b.startsAt, now) }} />}</CardBody></Card></li>); })}</ul>}
    </div>
  );
}
