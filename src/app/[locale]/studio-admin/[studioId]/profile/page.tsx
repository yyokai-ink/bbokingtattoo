import { notFound } from 'next/navigation';
import { BranchForm, StudioProfileForm, StudioPublishPanel } from '@/components/studio/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { assertCan, can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export default async function StudioProfilePage({ params }: { params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const sid = params.studioId; const me = await getCurrentUser(); assertCan(me?.actor, 'studio:profile:edit', { studioId: sid });
  const t = createT(params.locale);
  const s = await db.studioProfile.findUnique({ where: { id: sid }, include: { branches: { where: { isActive: true }, include: { address: true } } } });
  if (!s) notFound();
  const soc = (s.socials ?? {}) as { instagram?: string };
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-10"><section><h1 className="h-section mb-5 sm:text-3xl">{t('dashboard.profile')}</h1>
        <StudioProfileForm studioId={sid} s={{ name: s.name, description: s.description ?? '', phone: s.phone ?? '', email: s.email ?? '', instagram: soc.instagram ?? '', logoUrl: s.logoUrl, coverUrl: s.coverUrl }} /></section>
        <section className="space-y-3"><h2 className="h-section">{t('profile.branches')}</h2>
          <ul className="space-y-2">{s.branches.map((b) => <li key={b.id} className="rounded-lg border bg-surface p-3 text-sm"><p className="font-semibold">{b.name}</p><p className="text-fg-muted">{b.address.line1}</p></li>)}</ul>
          {can(me?.actor, 'studio:branches:manage', { studioId: sid }) && <BranchForm studioId={sid} />}</section></div>
      <aside className="lg:sticky lg:top-24 lg:self-start"><StudioPublishPanel studioId={sid} published={s.status === 'PUBLISHED'} /></aside>
    </div>
  );
}
