'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n/client';
import { localizePath } from '@/i18n/routing';
import { initialFormState, type FormState } from '@/server/auth/form-state';
import { forgotPasswordAction, loginAction, registerAction, resendVerificationAction, resetPasswordAction, verifyEmailAction } from '@/server/actions/auth';

export function SubmitButton({ children, variant, className }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} variant={variant} className={className ?? 'w-full'}>{children}</Button>;
}

/** Renders the Server Action result as accessible alerts. error/message are i18n key suffixes. */
export function StateAlerts({ state }: { state: FormState }) {
  const { t } = useI18n();
  return (
    <>
      {state.error && <Alert tone="error">{t(`errors.${state.error}`)}</Alert>}
      {state.ok && state.message && <Alert tone="success">{t(`auth.msg.${state.message}`)}</Alert>}
    </>
  );
}

const Hidden = ({ locale, next }: { locale: string; next?: string }) => <><input type="hidden" name="locale" value={locale} />{next && <input type="hidden" name="next" value={next} />}</>;

export function LoginForm({ next, notice }: { next?: string; notice?: 'reset' }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(loginAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <Hidden locale={locale} next={next} />
      {notice === 'reset' && <Alert tone="success">{t('auth.resetDone')}</Alert>}
      <StateAlerts state={state} />
      <Input label={t('auth.email')} name="email" type="email" autoComplete="email" required />
      <Input label={t('auth.password')} name="password" type="password" autoComplete="current-password" required />
      <SubmitButton>{t('auth.loginBtn')}</SubmitButton>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href={localizePath(locale, '/forgot-password')} className="font-medium text-brand underline">{t('auth.forgotLink')}</Link>
        <Link href={`${localizePath(locale, '/register')}${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-brand underline">{t('auth.noAccount')}</Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(registerAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <Hidden locale={locale} next={next} />
      <StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('auth.firstName')} name="firstName" autoComplete="given-name" required maxLength={60} />
        <Input label={t('auth.lastName')} name="lastName" autoComplete="family-name" required maxLength={60} />
      </div>
      <Input label={t('auth.email')} name="email" type="email" autoComplete="email" required />
      <Input label={t('auth.phone')} name="phone" type="tel" autoComplete="tel" inputMode="tel" />
      <Input label={t('auth.password')} name="password" type="password" autoComplete="new-password" required minLength={10} hint={t('auth.passwordHint')} />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="terms" className="mt-1 h-5 w-5 accent-[hsl(var(--brand))]" required /><span>{t('legal.consentPrefix')} <Link href={localizePath(locale, '/terms')} target="_blank" className="font-medium text-brand underline">{t('legal.termsLink')}</Link> {t('legal.consentAnd')} <Link href={localizePath(locale, '/privacy')} target="_blank" className="font-medium text-brand underline">{t('legal.privacyLink')}</Link></span></label>
      <SubmitButton>{t('auth.registerBtn')}</SubmitButton>
      <p className="text-sm"><Link href={`${localizePath(locale, '/login')}${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-brand underline">{t('auth.haveAccount')}</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(forgotPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4"><Hidden locale={locale} /><StateAlerts state={state} />
      <Input label={t('auth.email')} name="email" type="email" autoComplete="email" required />
      <SubmitButton>{t('auth.sendResetBtn')}</SubmitButton></form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4"><Hidden locale={locale} /><input type="hidden" name="token" value={token} /><StateAlerts state={state} />
      <Input label={t('auth.newPassword')} name="password" type="password" autoComplete="new-password" required minLength={10} hint={t('auth.passwordHint')} />
      <SubmitButton>{t('auth.resetBtn')}</SubmitButton></form>
  );
}

export function VerifyForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(verifyEmailAction, initialFormState);
  if (state.ok) return <StateAlerts state={state} />;
  return <form action={action} className="space-y-4"><input type="hidden" name="token" value={token} /><StateAlerts state={state} /><SubmitButton>{t('auth.verifyBtn')}</SubmitButton></form>;
}

export function ResendVerification() {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(resendVerificationAction, initialFormState);
  return (
    <form action={action} className="space-y-2"><Hidden locale={locale} /><StateAlerts state={state} />
      <SubmitButton variant="secondary" className="w-full sm:w-auto">{t('auth.resend')}</SubmitButton></form>
  );
}
