'use client';

import { useFormState } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SubmitButton, StateAlerts } from '@/components/auth/forms';
import { useI18n } from '@/i18n/client';
import { initialFormState } from '@/server/auth/form-state';
import { moderateReviewAction, setUserBlockedAction, updatePlanAction } from '@/server/actions/admin';

export function BlockButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const { t } = useI18n();
  const [state, action] = useFormState(setUserBlockedAction, initialFormState);
  return (
    <form action={action} onSubmit={(e) => { if (!blocked && !window.confirm(t('admin.confirmBlock'))) e.preventDefault(); }} className="space-y-1">
      <input type="hidden" name="userId" value={userId} /><input type="hidden" name="block" value={blocked ? '0' : '1'} />
      {state.error && <p className="text-xs text-danger" role="alert">{t(`errors.${state.error}`)}</p>}
      <SubmitButton variant={blocked ? 'secondary' : 'danger'} className="min-h-9 px-3">{t(blocked ? 'admin.unblock' : 'admin.block')}</SubmitButton>
    </form>
  );
}

export function ModerationForm({ reviewId }: { reviewId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(moderateReviewAction, initialFormState);
  return (
    <form action={action} className="space-y-2"><input type="hidden" name="reviewId" value={reviewId} /><StateAlerts state={state} />
      <Input label={t('admin.note')} name="note" maxLength={300} />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve" className="min-h-9 px-3">{t('admin.approve')}</Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" className="min-h-9 px-3">{t('admin.reject')}</Button>
      </div>
    </form>
  );
}

export function PlanForm({ planId, name, studio, price, seat, fee, active }: { planId: string; name: string; studio: boolean; price: number; seat: number | null; fee: number | null; active: boolean }) {
  const { t } = useI18n();
  const [state, action] = useFormState(updatePlanAction, initialFormState);
  return (
    <form action={action} className="space-y-3"><input type="hidden" name="planId" value={planId} /><h3 className="text-lg font-bold">{name}</h3><StateAlerts state={state} />
      <Input label={t('admin.priceUah')} name="price" type="number" min={0} step="0.01" defaultValue={price} required />
      {studio && <>
        <Input label={t('admin.seatUah')} name="seat" type="number" min={0} step="0.01" defaultValue={seat ?? ''} />
        <Input label={t('admin.feeUah')} name="fee" type="number" min={0} step="0.01" defaultValue={fee ?? ''} />
      </>}
      <label className="flex min-h-touch items-center gap-3 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={active} className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('admin.planActive')}</label>
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}

import { MediaUploader } from '@/components/account/media-uploader';
import { locales, localeMeta } from '@/i18n/config';
import { saveAppearanceAction } from '@/server/actions/admin';
import type { Appearance } from '@/server/site-settings';

export function AppearanceForm({ a }: { a: Appearance }) {
  const { t } = useI18n();
  const [state, action] = useFormState(saveAppearanceAction, initialFormState);
  return (
    <form action={action} className="space-y-8"><StateAlerts state={state} />
      <section className="space-y-4"><h2 className="h-section">{t('admin.content.legal')}</h2><p className="text-sm text-fg-muted">{t('admin.content.legalHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2"><Input label={t('admin.content.company')} name="companyName" defaultValue={a.companyName} maxLength={120} /><Input label={t('admin.content.contactEmail')} name="contactEmail" type="email" defaultValue={a.contactEmail} /></div>
      </section>
      <section className="space-y-4"><h2 className="h-section">{t('admin.content.logo')}</h2>
        <MediaUploader purpose="site" accept="image/jpeg,image/png,image/webp,image/avif" name="logoKey" label={t('admin.content.logoFile')} initialUrl={a.logoUrl} />
        <label className="flex min-h-touch items-center gap-3 text-sm"><input type="checkbox" name="logoRemove" value="1" className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('admin.content.removeLogo')}</label>
      </section>
      <section className="space-y-4"><h2 className="h-section">{t('admin.content.hero')}</h2>
        <p className="text-sm text-fg-muted">{t('admin.content.heroHint')}</p>
        <MediaUploader purpose="site" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" name="heroKey" label={t('admin.content.heroMedia')} initialUrl={a.heroUrl} initialKind={a.heroKind === 'video' ? 'video' : 'image'} />
        <MediaUploader purpose="site" accept="image/jpeg,image/png,image/webp,image/avif" name="posterKey" label={t('admin.content.poster')} initialUrl={a.heroPosterUrl} />
        <label className="block max-w-sm space-y-1.5 text-sm font-medium">{t('admin.content.overlay')}: <output>{a.heroOverlay}</output>%
          <input type="range" name="overlay" min={0} max={80} step={5} defaultValue={a.heroOverlay} className="w-full accent-[hsl(var(--brand))]" onChange={(e) => { e.currentTarget.parentElement!.querySelector('output')!.textContent = e.currentTarget.value; }} />
        </label>
        <label className="flex min-h-touch items-center gap-3 text-sm"><input type="checkbox" name="heroRemove" value="1" className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('admin.content.removeHero')}</label>
      </section>
      <section className="space-y-4"><h2 className="h-section">{t('admin.content.texts')}</h2>
        {locales.map((l) => (
          <fieldset key={l} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{localeMeta[l].label}</legend>
            <Input label={t('admin.content.title')} name={`title_${l}`} defaultValue={a.heroTitle[l] ?? ''} maxLength={200} />
            <Input label={t('admin.content.subtitle')} name={`subtitle_${l}`} defaultValue={a.heroSubtitle[l] ?? ''} maxLength={200} />
          </fieldset>
        ))}
        <p className="text-xs text-fg-muted">{t('admin.content.textsHint')}</p>
      </section>
      <section className="space-y-4"><h2 className="h-section">{t('admin.content.cta')}</h2>
        <MediaUploader purpose="site" accept="image/jpeg,image/png,image/webp,image/avif" name="ctaKey" label={t('admin.content.ctaBg')} initialUrl={a.ctaBgUrl} />
        <label className="flex min-h-touch items-center gap-3 text-sm"><input type="checkbox" name="ctaRemove" value="1" className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('admin.content.removeCta')}</label>
      </section>
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}
