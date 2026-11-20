'use client';

import { useFormState } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton, StateAlerts } from '@/components/auth/forms';
import { MediaUploader } from '@/components/account/media-uploader';
import type { CatOpt, Opt } from '@/components/master/forms';
import { useI18n } from '@/i18n/client';
import { initialFormState } from '@/server/auth/form-state';
import { addBranchAction, createStudioAction, inviteMasterAction, masterMembershipAction, removeMemberAction, respondInvitationAction, revokeInvitationAction, saveStudioProfileAction, setMemberRoleAction, setStudioPublishedAction, studioBillingAction } from '@/server/actions/studio';

const textarea = 'control min-h-28 py-2';
const Hidden = ({ name, value }: { name: string; value: string }) => <input type="hidden" name={name} value={value} />;

export function CreateStudioForm({ cities, cats }: { cities: Opt[]; cats: CatOpt[] }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(createStudioAction, initialFormState);
  return (
    <form action={action} className="space-y-5"><Hidden name="locale" value={locale} /><StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MediaUploader purpose="studio" accept="image/jpeg,image/png,image/webp,image/avif" name="logoKey" label={t('studio.logo')} />
        <MediaUploader purpose="studio" accept="image/jpeg,image/png,image/webp,image/avif" name="coverKey" label={t('dashboard.cover')} />
      </div>
      <Input label={t('studio.name')} name="name" required maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2"><Select label={t('search.city')} name="city">{cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select><Input label={t('studio.address')} name="address" required maxLength={160} /></div>
      <label className="block space-y-1.5 text-sm font-medium">{t('wizard.bio')}<textarea name="description" maxLength={2000} className={textarea} /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">{t('search.category')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">{cats.map((c) => <label key={c.value} className="flex min-h-touch items-center gap-3 rounded-md border bg-surface px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft"><input type="checkbox" name="categories" value={c.value} className="h-5 w-5 accent-[hsl(var(--brand))]" />{c.label}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><Input label={t('auth.phone')} name="phone" type="tel" /><Input label={t('booking.email')} name="email" type="email" /></div>
      <SubmitButton className="w-full sm:w-auto">{t('studio.create')}</SubmitButton>
    </form>
  );
}

export function StudioProfileForm({ studioId, s }: { studioId: string; s: { name: string; description: string; phone: string; email: string; instagram: string; logoUrl: string | null; coverUrl: string | null } }) {
  const { t } = useI18n();
  const [state, action] = useFormState(saveStudioProfileAction, initialFormState);
  return (
    <form action={action} className="space-y-5"><Hidden name="studioId" value={studioId} /><StateAlerts state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MediaUploader purpose="studio" accept="image/jpeg,image/png,image/webp,image/avif" name="logoKey" label={t('studio.logo')} initialUrl={s.logoUrl} />
        <MediaUploader purpose="studio" accept="image/jpeg,image/png,image/webp,image/avif" name="coverKey" label={t('dashboard.cover')} initialUrl={s.coverUrl} />
      </div>
      <Input label={t('studio.name')} name="name" defaultValue={s.name} required maxLength={100} />
      <label className="block space-y-1.5 text-sm font-medium">{t('wizard.bio')}<textarea name="description" defaultValue={s.description} maxLength={2000} className={textarea} /></label>
      <div className="grid gap-4 sm:grid-cols-3"><Input label={t('auth.phone')} name="phone" defaultValue={s.phone} /><Input label={t('booking.email')} name="email" defaultValue={s.email} /><Input label="Instagram" name="instagram" defaultValue={s.instagram} /></div>
      <SubmitButton className="w-full sm:w-auto">{t('common.save')}</SubmitButton>
    </form>
  );
}

export function StudioPublishPanel({ studioId, published }: { studioId: string; published: boolean }) {
  const { t } = useI18n();
  const [state, action] = useFormState(setStudioPublishedAction, initialFormState);
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-surface p-4"><Hidden name="studioId" value={studioId} /><Hidden name="publish" value={published ? '0' : '1'} /><StateAlerts state={state} />
      <p className="font-semibold">{t(published ? 'dashboard.statusPublished' : 'dashboard.statusDraft')}</p><p className="text-xs text-fg-muted">{t('studio.publishNote')}</p>
      <SubmitButton variant={published ? 'secondary' : 'primary'} className="w-full sm:w-auto">{t(published ? 'dashboard.unpublish' : 'dashboard.publish')}</SubmitButton></form>
  );
}

export function BranchForm({ studioId }: { studioId: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(addBranchAction, initialFormState);
  return <form action={action} className="grid items-end gap-3 rounded-lg border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]"><Hidden name="studioId" value={studioId} /><Input label={t('studio.branchName')} name="name" required /><Input label={t('studio.address')} name="address" required /><SubmitButton className="w-auto">{t('studio.addBranch')}</SubmitButton><div className="sm:col-span-3"><StateAlerts state={state} /></div></form>;
}

export function InviteForm({ studioId }: { studioId: string }) {
  const { t, locale } = useI18n();
  const [state, action] = useFormState(inviteMasterAction, initialFormState);
  return <form action={action} className="grid items-end gap-3 rounded-lg border bg-surface p-4 sm:grid-cols-[1fr_auto]"><Hidden name="studioId" value={studioId} /><Hidden name="locale" value={locale} /><Input label={t('studio.inviteEmail')} name="email" type="email" required /><SubmitButton className="w-auto">{t('studio.invite')}</SubmitButton><div className="sm:col-span-2"><StateAlerts state={state} /></div></form>;
}

export function MemberActions({ memberId, role, canRoles, canRemove }: { memberId: string; role: string; canRoles: boolean; canRemove: boolean }) {
  const { t } = useI18n();
  const [rm, rmAction] = useFormState(removeMemberAction, initialFormState);
  const [rl, rlAction] = useFormState(setMemberRoleAction, initialFormState);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRoles && role !== 'OWNER' && <form action={rlAction}><Hidden name="memberId" value={memberId} /><Hidden name="role" value={role === 'ADMIN' ? 'MASTER' : 'ADMIN'} /><SubmitButton variant="secondary" className="min-h-9 px-3">{t(role === 'ADMIN' ? 'studio.makeMaster' : 'studio.makeAdmin')}</SubmitButton></form>}
      {canRemove && <form action={rmAction} onSubmit={(e) => { if (!window.confirm(t('studio.confirmRemove'))) e.preventDefault(); }}><Hidden name="memberId" value={memberId} /><SubmitButton variant="danger" className="min-h-9 px-3">{t('studio.remove')}</SubmitButton></form>}
      {(rm.error || rl.error) && <p role="alert" className="w-full text-xs text-danger">{t(`errors.${rm.error ?? rl.error}`)}</p>}
    </div>
  );
}

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const { t } = useI18n();
  const [, action] = useFormState(revokeInvitationAction, initialFormState);
  return <form action={action}><Hidden name="invitationId" value={invitationId} /><SubmitButton variant="ghost" className="min-h-9 px-3">{t('studio.revoke')}</SubmitButton></form>;
}

export function InviteResponse({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, action] = useFormState(respondInvitationAction, initialFormState);
  if (state.ok) return <Alert tone="success">{t(`studio.msg.${state.message}`)}</Alert>;
  return (
    <form action={action} className="space-y-3"><Hidden name="token" value={token} /><StateAlerts state={state} />
      <div className="flex gap-2"><button type="submit" name="decision" value="accept" className="min-h-touch flex-1 rounded-md bg-brand px-4 font-semibold text-brand-fg">{t('studio.accept')}</button><button type="submit" name="decision" value="decline" className="min-h-touch flex-1 rounded-md border bg-surface px-4 font-semibold">{t('studio.decline')}</button></div></form>
  );
}

export function BillingButton({ studioId, action: act, label, variant }: { studioId: string; action: 'subscribe' | 'fees' | 'cancel' | 'resume'; label: string; variant?: 'primary' | 'secondary' }) {
  const { locale } = useI18n();
  const [state, action] = useFormState(studioBillingAction, initialFormState);
  return <form action={action} className="space-y-2"><Hidden name="studioId" value={studioId} /><Hidden name="action" value={act} /><Hidden name="locale" value={locale} /><StateAlerts state={state} /><SubmitButton variant={variant} className="w-full sm:w-auto">{label}</SubmitButton></form>;
}

export function MasterStudios({ items }: { items: { memberId: string; name: string; consent: boolean }[] }) {
  const { t } = useI18n();
  const [state, action] = useFormState(masterMembershipAction, initialFormState);
  if (items.length === 0) return null;
  return (
    <section className="space-y-3"><h2 className="h-section">{t('profile.studios')}</h2><StateAlerts state={state} />
      <ul className="space-y-2">{items.map((i) => (
        <li key={i.memberId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"><span className="font-semibold">{i.name}</span>
          <div className="flex flex-wrap gap-2">
            <form action={action}><Hidden name="memberId" value={i.memberId} /><Hidden name="consent" value={i.consent ? '0' : '1'} /><SubmitButton variant="secondary" className="min-h-9 px-3">{t(i.consent ? 'studio.consentOff' : 'studio.consentOn')}</SubmitButton></form>
            <form action={action} onSubmit={(e) => { if (!window.confirm(t('studio.confirmLeave'))) e.preventDefault(); }}><Hidden name="memberId" value={i.memberId} /><Hidden name="action" value="leave" /><SubmitButton variant="ghost" className="min-h-9 px-3">{t('studio.leave')}</SubmitButton></form>
          </div></li>))}</ul>
      <p className="text-xs text-fg-muted">{t('studio.consentNote')}</p></section>
  );
}
