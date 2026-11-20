import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { ModerationForm } from '@/components/admin/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function AdminReviews({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const intl = localeMeta[params.locale].intl;
  const pending = await db.review.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50,
    include: { author: { select: { firstName: true, lastName: true, email: true } }, master: { select: { displayName: true } }, booking: { select: { startsAt: true, timezone: true, service: { select: { name: true } } } } } });
  return (
    <div className="space-y-5">
      <h1 className="h-section sm:text-3xl">{t('admin.reviews')} <span className="text-base font-normal text-fg-muted">({pending.length})</span></h1>
      {pending.length === 0 ? <p className="text-fg-muted">{t('admin.noPendingReviews')}</p> : (
        <ul className="space-y-3">{pending.map((r) => (
          <li key={r.id}><Card><CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{r.master.displayName} · {r.booking.service.name} · {formatDateTime(r.booking.startsAt, intl, r.booking.timezone)}</p>
              <span className="inline-flex items-center gap-1 font-bold"><Star className="h-4 w-4 fill-warning text-warning" aria-hidden />{r.rating}</span>
            </div>
            <p className="text-sm text-fg-muted">{r.author.firstName} {r.author.lastName} · {r.author.email}</p>
            {r.text && <blockquote className="rounded-md bg-muted p-3 text-sm">{r.text}</blockquote>}
            <ModerationForm reviewId={r.id} />
          </CardBody></Card></li>
        ))}</ul>)}
    </div>
  );
}
