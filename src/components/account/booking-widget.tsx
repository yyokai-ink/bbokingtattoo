'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { buttonClasses } from '@/components/ui/button';
import { SubmitButton, StateAlerts, ResendVerification } from '@/components/auth/forms';
import { SlotPicker } from './slot-picker';
import { useI18n } from '@/i18n/client';
import { localizePath } from '@/i18n/routing';
import { initialFormState } from '@/server/auth/form-state';
import { createBookingAction } from '@/server/actions/booking';

export interface WidgetService { id: string; label: string }
export interface WidgetUser { name: string; email: string; phone: string; verified: boolean }

export function BookingWidget({ masterId, services, user, nextPath }: { masterId: string; services: WidgetService[]; user: WidgetUser | null; nextPath: string }) {
  const { t, locale } = useI18n();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [state, action] = useFormState(createBookingAction, initialFormState);
  const next = `?next=${encodeURIComponent(nextPath)}`;

  if (services.length === 0) return null;
  if (!user) return (
    <div className="space-y-3 rounded-lg border bg-surface p-4">
      <p className="text-sm">{t('booking.loginToBook')}</p>
      <div className="flex gap-2">
        <Link href={`${localizePath(locale, '/login')}${next}`} className={buttonClasses('primary')}>{t('auth.login')}</Link>
        <Link href={`${localizePath(locale, '/register')}${next}`} className={buttonClasses('secondary')}>{t('auth.register')}</Link>
      </div>
    </div>
  );
  if (!user.verified) return <div className="space-y-3"><Alert tone="info">{t('booking.verifyToBook')}</Alert><ResendVerification /></div>;
  if (state.ok) return <div className="space-y-3"><Alert tone="success">{t('auth.msg.booked')}</Alert><Link href={localizePath(locale, '/account')} className={buttonClasses('secondary')}>{t('account.title')}</Link></div>;

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-surface p-4">
      <input type="hidden" name="masterId" value={masterId} />
      <StateAlerts state={state} />
      <Select label={t('booking.service')} name="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
      <SlotPicker masterId={masterId} serviceId={serviceId} />
      <fieldset className="space-y-3"><legend className="mb-1 text-sm font-semibold">{t('booking.contact')}</legend>
        <Input label={t('booking.name')} name="name" defaultValue={user.name} required maxLength={100} autoComplete="name" />
        <Input label={t('booking.phone')} name="phone" type="tel" defaultValue={user.phone} required autoComplete="tel" inputMode="tel" />
        <Input label={t('booking.email')} name="email" type="email" defaultValue={user.email} required autoComplete="email" />
        <Input label={t('booking.note')} name="note" maxLength={500} />
      </fieldset>
      <SubmitButton>{t('booking.submit')}</SubmitButton>
    </form>
  );
}
