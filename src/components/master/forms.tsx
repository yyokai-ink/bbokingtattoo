'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import { Building2, User } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton, StateAlerts } from '@/components/auth/forms';
import { MediaUploader } from '@/components/account/media-uploader';
import { useI18n } from '@/i18n/client';
import { localizePath } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { initialFormState } from '@/server/auth/form-state';
import { addDayOffAction, addPortfolioAction, becomeMasterAction, deleteDayOffAction, deletePortfolioAction, deleteServiceAction, saveProfileAction, saveScheduleAction, saveServiceAction, setPublishedAction } from '@/server/actions/master';

export interface Opt { value: string; label: string }
export interface CatOpt extends Opt { subs: Opt[] }
const textarea = 'control min-h-28 py-2';

function Categories({ cats, selected }: { cats: CatOpt[]; selected: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cats.map((c) => (
        <label key={c.value} className="flex min-h-touch items-center gap-3 rounded-md border bg-surface px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="categories" value={c.value} defaultChecked={selected.includes(c.value)} className="h-5 w-5 accent-[hsl(var(--brand))]" />{c.label}
        </label>
      ))}
    </div>
  );
}

/** Multi-step onboarding (account type → basics → categories → confirm). One <form>: every step stays mounted so values persist. */
export function BecomeMasterWizard({ cities, cats, defaultName }: { cities: Opt[]; cats: CatOpt[]; defaultName: string }) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState(1);
  const [state, action] = useFormState(becomeMasterAction, initialFormState);
  const steps = ['wizard.step1', 'wizard.step2', 'wizard.step3', 'wizard.step4'];
  const show = (n: number) => (step === n ? '' : 'hidden');
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      <ol className="flex gap-2" aria-label="Steps">{steps.map((k, i) => <li key={k} aria-current={step === i + 1 ? 'step' : undefined} className={cn('h-1.5 flex-1 rounded-full', step >= i + 1 ? 'bg-brand' : 'bg-muted')}><span className="sr-only">{t(k)}</span></li>)}</ol>
      <p className="text-sm font-semibold text-fg-muted">{t('wizard.stepOf', { n: step, total: 4 })} · {t(steps[step - 1]!)}</p>
      <StateAlerts state={state} />

      <section className={show(1)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStep(2)} className="rounded-xl border-2 border-brand bg-brand-soft p-5 text-left"><User className="mb-2 h-6 w-6 text-brand" aria-hidden /><span className="block font-bold">{t('wizard.individual')}</span><span className="text-sm text-fg-muted">{t('wizard.individualHint')}</span></button>
          <Link href={localizePath(locale, '/become-studio')} className="rounded-xl border-2 bg-surface p-5 hover:border-brand"><Building2 className="mb-2 h-6 w-6 text-brand" aria-hidden /><span className="block font-bold">{t('wizard.studio')}</span><span className="text-sm text-fg-muted">{t('wizard.studioHint')}</span></Link>
        </div>
      </section>
      <section className={cn('space-y-4', show(2))}>
        <Input label={t('wizard.displayName')} name="displayName" defaultValue={defaultName} maxLength={80} />
        <Select label={t('search.city')} name="city" defaultValue={cities[0]?.value}>{cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
        <Input label={t('wizard.headline')} name="headline" maxLength={120} hint={t('wizard.headlineHint')} />
        <label className="block space-y-1.5 text-sm font-medium">{t('wizard.bio')}<textarea name="bio" maxLength={2000} className={textarea} /></label>
      </section>
      <section className={cn('space-y-4', show(3))}>
        <fieldset><legend className="mb-2 text-sm font-medium">{t('search.category')}</legend><Categories cats={cats} selected={[]} /></fieldset>
        <Input label={t('wizard.experienceSince')} name="experienceSince" type="number" inputMode="numeric" min={1960} max={new Date().getFullYear()} />
      </section>
      <section className={cn('space-y-3', show(4))}>
        <Alert tone="info">{t('wizard.finalNote')}</Alert>
      </section>

      <div className="flex justify-between gap-3">
        {step > 1 ? <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>{t('search.prev')}</Button> : <span />}
        {step >= 2 && step < 4 && <Button type="button" onClick={() => setStep(step + 1)}>{t('search.next')}</Button>}
        {step === 4 && <SubmitButton className="w-auto">{t('wizard.create')}</SubmitButton>}
      </div>
    </form>
  );
}

export function MasterProfileForm({ p, cats, selected }: { p: { address: string; displayName: string; headline: string; bio: string; workAreaNote: string; phone: string; email: string; instagram: string; telegram: string; experienceSince: number | null; gender: string; showGender: boolean; avatarUrl: string | null; coverUrl: string | null }; cats: CatOpt[]; selected: string[] }) {
  const { t } = useI18n();
  const [state, action] = useFormState(saveProfileAction, initialFormState);
  return (
    <form action={action} className="space-y-6"><StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MediaUploader purpose="avatar" accept="image/jpeg,image/png,image/webp,image/avif" name="avatarKey" label={t('dashboard.avatar')} initialUrl={p.avatarUrl} />
        <MediaUploader purpose="cover" accept="image/jpeg,image/png,image/webp,image/avif" name="coverKey" label={t('dashboard.cover')} initialUrl={p.coverUrl} />
      </div>
      <Input label={t('wizard.displayName')} name="displayName" defaultValue={p.displayName} required maxLength={80} />
      <Input label={t('wizard.headline')} name="headline" defaultValue={p.headline} maxLength={120} />
      <label className="block space-y-1.5 text-sm font-medium">{t('wizard.bio')}<textarea name="bio" defaultValue={p.bio} maxLength={2000} className={textarea} /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">{t('search.category')}</legend><Categories cats={cats} selected={selected} /></fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('wizard.experienceSince')} name="experienceSince" type="number" defaultValue={p.experienceSince ?? ''} min={1960} />
        <Input label={t('studio.address')} name="address" defaultValue={p.address} maxLength={160} hint={t('dashboard.addressHint')} />
        <Input label={t('dashboard.workArea')} name="workAreaNote" defaultValue={p.workAreaNote} maxLength={160} />
        <Input label={t('auth.phone')} name="phone" type="tel" defaultValue={p.phone} />
        <Input label={t('booking.email')} name="email" type="email" defaultValue={p.email} />
        <Input label="Instagram" name="instagram" defaultValue={p.instagram} />
        <Input label="Telegram" name="telegram" defaultValue={p.telegram} />
        <Select label={t('search.gender')} name="gender" defaultValue={p.gender}><option value="">—</option><option value="female">{t('search.female')}</option><option value="male">{t('search.male')}</option></Select>
        <label className="flex min-h-touch items-center gap-3 self-end text-sm"><input type="checkbox" name="showGender" value="1" defaultChecked={p.showGender} className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('dashboard.showGender')}</label>
      </div>
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}

export function PublishPanel({ published, missing, locale }: { published: boolean; missing: string[]; locale: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(setPublishedAction, initialFormState);
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-surface p-4"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="publish" value={published ? '0' : '1'} /><StateAlerts state={state} />
      <p className="font-semibold">{t(published ? 'dashboard.statusPublished' : 'dashboard.statusDraft')}</p>
      {!published && missing.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">{missing.map((m) => <li key={m}>{t(`dashboard.missing.${m}`)}</li>)}</ul>}
      <p className="text-xs text-fg-muted">{t('dashboard.publishNote')}</p>
      <SubmitButton variant={published ? 'secondary' : 'primary'} className="w-full sm:w-auto">{t(published ? 'dashboard.unpublish' : 'dashboard.publish')}</SubmitButton>
    </form>
  );
}

export function PortfolioManager({ items, cats }: { items: { id: string; url: string; caption: string | null; video: boolean }[]; cats: Opt[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  const [caption, setCaption] = useState(''); const [category, setCategory] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [del, delAction] = useFormState(deletePortfolioAction, initialFormState);
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2"><Input label={t('dashboard.caption')} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} />
          <Select label={t('search.category')} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">—</option>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></div>
        <MediaUploader purpose="portfolio" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" label={t('dashboard.addWork')}
          onUploaded={(u) => start(async () => { const r = await addPortfolioAction(u.key, caption, category || null); if (!r.ok) setErr('upload_failed'); else { setErr(null); setCaption(''); router.refresh(); } })} />
        {err && <p role="alert" className="text-sm text-danger">{t(`media.errors.${err}`)}</p>}
      </div>
      {del.error && <Alert tone="error">{t(`errors.${del.error}`)}</Alert>}
      {items.length === 0 ? <p className="text-sm text-fg-muted">{t('dashboard.noWorks')}</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((i) => (
          <li key={i.id} className="space-y-2"><div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">{i.video ? <video src={i.url} muted playsInline controls className="h-full w-full object-cover" /> : <img src={i.url} alt={i.caption ?? ''} loading="lazy" className="h-full w-full object-cover" />}</div>
            <form action={delAction} onSubmit={(e) => { if (!window.confirm(t('dashboard.confirmDelete'))) e.preventDefault(); }}><input type="hidden" name="itemId" value={i.id} /><SubmitButton variant="secondary" className="min-h-9 w-full">{t('dashboard.delete')}</SubmitButton></form></li>
        ))}</ul>)}
    </div>
  );
}

export function ServiceForm({ cats, service }: { cats: CatOpt[]; service?: { id: string; name: string; description: string; durationMin: number; bufferMin: number; price: number; isFrom: boolean; category: string; sub: string } }) {
  const { t } = useI18n();
  const [state, action] = useFormState(saveServiceAction, initialFormState);
  const [del, delAction] = useFormState(deleteServiceAction, initialFormState);
  const [cat, setCat] = useState(service?.category ?? cats[0]?.value ?? '');
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3 rounded-lg border bg-surface p-4"><input type="hidden" name="serviceId" value={service?.id ?? ''} /><StateAlerts state={state} />
        <Input label={t('booking.service')} name="name" defaultValue={service?.name} required maxLength={120} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t('search.category')} name="category" value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
          <Select label={t('search.sub')} name="sub" defaultValue={service?.sub ?? ''}><option value="">—</option>{(cats.find((c) => c.value === cat)?.subs ?? []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
          <Input label={t('dashboard.duration')} name="durationMin" type="number" min={10} max={720} step={5} defaultValue={service?.durationMin ?? 60} required />
          <Input label={t('dashboard.buffer')} name="bufferMin" type="number" min={0} max={120} step={5} defaultValue={service?.bufferMin ?? 15} />
          <Input label={t('dashboard.priceUah')} name="price" inputMode="decimal" defaultValue={service?.price} required />
          <label className="flex min-h-touch items-center gap-3 self-end text-sm"><input type="checkbox" name="isFrom" value="1" defaultChecked={service?.isFrom} className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('dashboard.priceFrom')}</label>
        </div>
        <Input label={t('dashboard.description')} name="description" defaultValue={service?.description} maxLength={500} />
        <SubmitButton className="w-full sm:w-auto">{t(service ? 'common.save' : 'dashboard.addService')}</SubmitButton>
      </form>
      {service && <form action={delAction} onSubmit={(e) => { if (!window.confirm(t('dashboard.confirmDelete'))) e.preventDefault(); }}><input type="hidden" name="serviceId" value={service.id} />{del.error && <p role="alert" className="text-sm text-danger">{t(`errors.${del.error}`)}</p>}<SubmitButton variant="secondary" className="w-full sm:w-auto">{t('dashboard.delete')}</SubmitButton></form>}
    </div>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function ScheduleForm({ weekly }: { weekly: Record<number, [number, number][]> }) {
  const { t } = useI18n();
  const [state, action] = useFormState(saveScheduleAction, initialFormState);
  return (
    <form action={action} className="space-y-3"><StateAlerts state={state} /><p className="text-sm text-fg-muted">{t('dashboard.scheduleHint')}</p>
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <fieldset key={d} className="grid items-end gap-3 rounded-lg border bg-surface p-3 sm:grid-cols-[8rem_1fr_1fr]"><legend className="sr-only">{t(`profile.weekday.${d}`)}</legend>
          <p className="font-semibold">{t(`profile.weekday.${d}`)}</p>
          {[1, 2].map((n) => { const r = weekly[d]?.[n - 1]; return (
            <div key={n} className="grid grid-cols-2 gap-2">
              <Input label={n === 1 ? t('dashboard.from') : t('dashboard.fromAfterBreak')} name={`d${d}s${n}`} type="time" step={900} defaultValue={r ? hhmm(r[0]) : ''} />
              <Input label={t('dashboard.to')} name={`d${d}e${n}`} type="time" step={900} defaultValue={r ? hhmm(r[1]) : ''} />
            </div>); })}
        </fieldset>
      ))}
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}

export function DayOffForm({ items }: { items: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const [state, action] = useFormState(addDayOffAction, initialFormState);
  const [del, delAction] = useFormState(deleteDayOffAction, initialFormState);
  return (
    <div className="space-y-4">
      <form action={action} className="grid items-end gap-3 rounded-lg border bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"><Input label={t('dashboard.from')} name="from" type="date" required /><Input label={t('dashboard.to')} name="to" type="date" /><Input label={t('booking.note')} name="note" maxLength={120} /><SubmitButton className="w-auto">{t('dashboard.addDayOff')}</SubmitButton></form>
      <StateAlerts state={state} />{del.error && <p role="alert" className="text-sm text-danger">{t(`errors.${del.error}`)}</p>}
      <ul className="space-y-2">{items.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border bg-surface px-3 py-2 text-sm"><span>{i.label}</span><form action={delAction}><input type="hidden" name="availabilityId" value={i.id} /><SubmitButton variant="ghost" className="min-h-9 w-auto px-3">{t('dashboard.delete')}</SubmitButton></form></li>)}</ul>
    </div>
  );
}
