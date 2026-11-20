'use client';

import { useFormState } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { SubmitButton, StateAlerts } from '@/components/auth/forms';
import { useI18n } from '@/i18n/client';
import { initialFormState } from '@/server/auth/form-state';
import { cancelSubscriptionAction, payPendingAction, resumeSubscriptionAction, simulateTestPaymentAction, startCheckoutAction } from '@/server/actions/billing';

export function ChoosePlanButton({ planCode, label }: { planCode: string; label: string }) {
  const { locale } = useI18n();
  const [state, action] = useFormState(startCheckoutAction, initialFormState);
  return <form action={action} className="space-y-2"><input type="hidden" name="planCode" value={planCode} /><input type="hidden" name="locale" value={locale} /><StateAlerts state={state} /><SubmitButton>{label}</SubmitButton></form>;
}

export function PayNowButton({ paymentId }: { paymentId: string }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(payPendingAction, initialFormState);
  return <form action={action} className="space-y-2"><input type="hidden" name="paymentId" value={paymentId} /><input type="hidden" name="locale" value={locale} /><StateAlerts state={state} /><SubmitButton className="w-full sm:w-auto">{t('billing.payNow')}</SubmitButton></form>;
}

export function CancelResume({ cancelling }: { cancelling: boolean }) {
  const { t } = useI18n();
  const [state, action] = useFormState(cancelling ? resumeSubscriptionAction : cancelSubscriptionAction, initialFormState);
  return (
    <form action={action} className="space-y-2" onSubmit={(e) => { if (!cancelling && !window.confirm(t('billing.confirmCancel'))) e.preventDefault(); }}>
      <StateAlerts state={state} />
      <SubmitButton variant="secondary" className="w-full sm:w-auto">{t(cancelling ? 'billing.resume' : 'billing.cancel')}</SubmitButton>
    </form>
  );
}

export function TestPayPanel({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(simulateTestPaymentAction, initialFormState);
  if (state.ok) return <Alert tone={state.message === 'paid' ? 'success' : 'error'}>{t(`billing.test.${state.message}`)}</Alert>;
  return (
    <div className="space-y-3">
      <Alert tone="info">{t('billing.test.warning')}</Alert>
      <StateAlerts state={state} />
      <form action={action} className="flex flex-wrap gap-2"><input type="hidden" name="paymentId" value={paymentId} />
        <button type="submit" name="outcome" value="success" className="min-h-touch rounded-md bg-success px-4 font-semibold text-white">{t('billing.test.success')}</button>
        <button type="submit" name="outcome" value="fail" className="min-h-touch rounded-md border bg-surface px-4 font-semibold">{t('billing.test.fail')}</button>
      </form>
    </div>
  );
}
