import { Star } from 'lucide-react';
import type { TFunction } from '@/i18n/translate';
import type { HoursView, ReviewView, ServiceView, SlotDay } from '@/server/catalog/profile';
import { formatMoney } from '@/lib/money';

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function HoursTable({ hours, t }: { hours: HoursView[]; t: TFunction }) {
  return (
    <dl className="divide-y rounded-lg border bg-surface text-sm">
      {hours.map((h) => (
        <div key={h.weekday} className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="font-medium">{t(`profile.weekday.${h.weekday}`)}</dt>
          <dd className="text-fg-muted">{h.ranges.length ? h.ranges.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(', ') : t('profile.closed')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ServiceList({ services, t, intl, showMaster }: { services: (ServiceView & { master?: string })[]; t: TFunction; intl: string; showMaster?: boolean }) {
  return (
    <ul className="divide-y rounded-lg border bg-surface">
      {services.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold">{s.name}</p>
            <p className="text-sm text-fg-muted">{[s.category, s.subcategory, t('profile.minutes', { count: s.durationMin }), showMaster && s.master ? t('profile.withMaster', { name: s.master }) : null].filter(Boolean).join(' · ')}</p>
          </div>
          <p className="font-bold">{s.priceMinor !== null ? t(s.priceIsFrom ? 'card.priceFrom' : 'card.price', { price: formatMoney(s.priceMinor, 'UAH', intl) }) : t('card.noPrice')}</p>
        </li>
      ))}
    </ul>
  );
}

export function SlotCalendar({ days, timezone, intl, t }: { days: SlotDay[]; timezone: string; intl: string; t: TFunction }) {
  if (days.length === 0) return <p className="text-sm text-fg-muted">{t('profile.noFreeSlots')}</p>;
  const day = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone });
  const time = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <div key={d.date} className="rounded-lg border bg-surface p-3">
          <p className="mb-2 text-sm font-semibold capitalize">{day.format(new Date(d.times[0]!))}</p>
          <ul className="flex flex-wrap gap-2">
            {d.times.map((iso) => <li key={iso} className="rounded-md bg-brand-soft px-2.5 py-1 text-sm font-medium text-brand">{time.format(new Date(iso))}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ReviewList({ reviews, t, intl }: { reviews: ReviewView[]; t: TFunction; intl: string }) {
  if (reviews.length === 0) return <p className="text-sm text-fg-muted">{t('profile.noReviews')}</p>;
  const fmt = new Intl.DateTimeFormat(intl, { dateStyle: 'medium' });
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-lg border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{r.author}</p>
            <span className="inline-flex items-center gap-1 text-sm font-bold"><Star className="h-4 w-4 fill-warning text-warning" aria-hidden />{r.rating}</span>
          </div>
          {r.text && <p className="mt-1 text-sm text-fg-muted">{r.text}</p>}
          <p className="mt-2 text-xs text-fg-muted">{fmt.format(r.date)}</p>
        </li>
      ))}
    </ul>
  );
}
