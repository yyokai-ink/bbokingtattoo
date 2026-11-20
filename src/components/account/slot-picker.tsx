'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n/client';
import { getSlotsAction } from '@/server/actions/booking';

type Data = { timezone: string; days: { date: string; times: string[] }[] } | null;

/** Loads real free slots for one service (its own duration + buffer) and exposes the chosen instant as a hidden input. */
export function SlotPicker({ masterId, serviceId, name = 'startsAt' }: { masterId: string; serviceId: string; name?: string }) {
  const { t, intl } = useI18n();
  const [data, setData] = useState<Data | undefined>(undefined);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState('');

  useEffect(() => {
    let alive = true;
    setData(undefined); setTime(''); setDay(null);
    getSlotsAction(masterId, serviceId).then((d) => { if (alive) { setData(d); setDay(d?.days[0]?.date ?? null); } });
    return () => { alive = false; };
  }, [masterId, serviceId]);

  if (data === undefined) return <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>;
  if (!data || data.days.length === 0) return <p className="text-sm text-fg-muted">{t('booking.noSlots')}</p>;

  const dayFmt = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: data.timezone });
  const timeFmt = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: data.timezone });
  const times = data.days.find((d) => d.date === day)?.times ?? [];
  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={time} required />
      <div role="tablist" aria-label={t('booking.date')} className="flex gap-2 overflow-x-auto pb-1">
        {data.days.map((d) => (
          <button key={d.date} type="button" role="tab" aria-selected={d.date === day} onClick={() => { setDay(d.date); setTime(''); }}
            className={cn('chip shrink-0 capitalize', d.date === day ? 'chip-active' : 'chip-idle')}>{dayFmt.format(new Date(d.times[0]!))}</button>
        ))}
      </div>
      <div role="radiogroup" aria-label={t('booking.time')} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map((iso) => (
          <button key={iso} type="button" role="radio" aria-checked={iso === time} onClick={() => setTime(iso)}
            className={cn('min-h-touch rounded-md border text-sm font-semibold', iso === time ? 'border-brand bg-brand text-brand-fg' : 'bg-surface hover:bg-muted')}>{timeFmt.format(new Date(iso))}</button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{t('booking.timezoneNote', { tz: data.timezone })}</p>
    </div>
  );
}
