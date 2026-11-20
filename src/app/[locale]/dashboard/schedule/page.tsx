import { notFound } from 'next/navigation';
import { DayOffForm, ScheduleForm } from '@/components/master/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { requireMasterPage } from '@/server/master/context';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function DashboardSchedule({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const { profile } = await requireMasterPage(params.locale, '/dashboard/schedule');
  const t = createT(params.locale);
  const intl = localeMeta[params.locale].intl, tz = profile.city.timezone;
  const [hours, off] = await Promise.all([db.workingHours.findMany({ where: { masterId: profile.id }, orderBy: { startMinute: 'asc' } }), db.availability.findMany({ where: { masterId: profile.id, type: 'BLOCKED', endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } })]);
  const weekly: Record<number, [number, number][]> = {};
  for (const h of hours) (weekly[h.weekday] ??= []).push([h.startMinute, h.endMinute]);
  return (
    <div className="container space-y-10 py-8">
      <section><h1 className="h-section mb-4 sm:text-3xl">{t('dashboard.schedule')}</h1><ScheduleForm weekly={weekly} /></section>
      <section><h2 className="h-section mb-4">{t('dashboard.daysOff')}</h2><DayOffForm items={off.map((o) => ({ id: o.id, label: `${formatDateTime(o.startsAt, intl, tz)} → ${formatDateTime(new Date(o.endsAt.getTime() - 1), intl, tz)}${o.note ? ` · ${o.note}` : ''}` }))} /></section>
    </div>
  );
}
