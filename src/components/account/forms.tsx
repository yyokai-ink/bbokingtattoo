'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Star } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SubmitButton, StateAlerts } from '@/components/auth/forms';
import { SlotPicker } from './slot-picker';
import { FavoriteButton } from './favorite-button';
import { useI18n } from '@/i18n/client';
import { locales, localeMeta } from '@/i18n/config';
import { initialFormState } from '@/server/auth/form-state';
import { cancelBookingAction, providerAction, reviewAction, rescheduleAction } from '@/server/actions/booking';
import { changePasswordAction, deleteAccountAction, updateProfileAction } from '@/server/actions/account';

export { FavoriteButton };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(cancelBookingAction, initialFormState);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(t('account.confirmCancel'))) e.preventDefault(); }}>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.error && <p className="mb-1 text-xs text-danger" role="alert">{t(`errors.${state.error}`)}</p>}
      <SubmitButton variant="secondary" className="min-h-9 px-3">{t('account.cancel')}</SubmitButton>
    </form>
  );
}

export function RescheduleForm({ bookingId, masterId, serviceId }: { bookingId: string; masterId: string; serviceId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(rescheduleAction, initialFormState);
  if (state.ok) return <Alert tone="success">{t('auth.msg.rescheduled')}</Alert>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} /><StateAlerts state={state} />
      <SlotPicker masterId={masterId} serviceId={serviceId} />
      <SubmitButton>{t('account.reschedule')}</SubmitButton>
    </form>
  );
}

export function ProviderActions({ bookingId, can }: { bookingId: string; can: { confirm: boolean; cancel: boolean; complete: boolean } }) {
  const { t } = useI18n();
  const [state, action] = useFormState(providerAction, initialFormState);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.error && <p className="w-full text-xs text-danger" role="alert">{t(`errors.${state.error}`)}</p>}
      {can.confirm && <Button type="submit" name="action" value="confirm" className="min-h-9 px-3">{t('dashboard.confirm')}</Button>}
      {can.complete && <Button type="submit" name="action" value="complete" variant="secondary" className="min-h-9 px-3">{t('dashboard.complete')}</Button>}
      {can.cancel && <Button type="submit" name="action" value="cancel" variant="secondary" className="min-h-9 px-3" onClick={(e) => { if (!window.confirm(t('account.confirmCancel'))) e.preventDefault(); }}>{t('account.cancel')}</Button>}
    </form>
  );
}

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(reviewAction, initialFormState);
  const [rating, setRating] = useState(5);
  if (state.ok) return <Alert tone="success">{t('auth.msg.reviewSent')}</Alert>;
  return (
    <form action={action} className="space-y-3 rounded-md border bg-bg p-3">
      <input type="hidden" name="bookingId" value={bookingId} /><input type="hidden" name="rating" value={rating} /><StateAlerts state={state} />
      <div role="radiogroup" aria-label={t('account.ratingLabel')} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className="min-h-touch min-w-touch rounded-md hover:bg-muted">
            <Star className={`mx-auto h-6 w-6 ${n <= rating ? 'fill-warning text-warning' : 'text-fg-muted'}`} />
          </button>
        ))}
      </div>
      <Input label={t('account.reviewText')} name="text" maxLength={1000} />
      <SubmitButton className="w-full sm:w-auto">{t('account.sendReview')}</SubmitButton>
    </form>
  );
}

export function ProfileForm({ firstName, lastName, phone, userLocale }: { firstName: string; lastName: string; phone: string; userLocale: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(updateProfileAction, initialFormState);
  return (
    <form action={action} className="space-y-4"><StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('auth.firstName')} name="firstName" defaultValue={firstName} required maxLength={60} />
        <Input label={t('auth.lastName')} name="lastName" defaultValue={lastName} required maxLength={60} />
      </div>
      <Input label={t('auth.phone')} name="phone" type="tel" defaultValue={phone} />
      <Select label={t('common.language')} name="userLocale" defaultValue={userLocale}>{locales.map((l) => <option key={l} value={l}>{localeMeta[l].label}</option>)}</Select>
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const [state, action] = useFormState(changePasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4"><StateAlerts state={state} />
      <Input label={t('account.currentPassword')} name="currentPassword" type="password" autoComplete="current-password" required />
      <Input label={t('auth.newPassword')} name="newPassword" type="password" autoComplete="new-password" required minLength={10} hint={t('auth.passwordHint')} />
      <SubmitButton className="w-full sm:w-auto">{t('account.savePassword')}</SubmitButton></form>
  );
}

export function DeleteAccountForm() {
  const { t } = useI18n();
  const [state, action] = useFormState(deleteAccountAction, initialFormState);
  return (
    <details className="rounded-lg border bg-surface p-4"><summary className="cursor-pointer font-semibold text-danger">{t('account.delete.title')}</summary>
      <form action={action} onSubmit={(e) => { if (!window.confirm(t('account.delete.confirm'))) e.preventDefault(); }} className="mt-4 space-y-3"><StateAlerts state={state} />
        <p className="text-sm text-fg-muted">{t('account.delete.note')}</p>
        <Input label={t('auth.password')} name="password" type="password" autoComplete="current-password" required />
        <SubmitButton variant="danger" className="w-full sm:w-auto">{t('account.delete.button')}</SubmitButton></form></details>
  );
}
