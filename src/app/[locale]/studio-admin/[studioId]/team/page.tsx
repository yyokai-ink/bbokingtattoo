import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { InviteForm, MemberActions, RevokeButton } from '@/components/studio/forms';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { assertCan, can } from '@/server/auth/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { formatDate } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function StudioTeam({ params }: { params: { locale: string; studioId: string } }) {
  if (!isLocale(params.locale)) notFound();
  const me = await getCurrentUser(); const sid = params.studioId; assertCan(me?.actor, 'studio:dashboard:view', { studioId: sid });
  const t = createT(params.locale); const intl = localeMeta[params.locale].intl;
  const [members, invites] = await Promise.all([
    db.studioMember.findMany({ where: { studioId: sid, status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' }, include: { user: { select: { firstName: true, lastName: true, email: true } }, master: { select: { slug: true } } } }),
    db.studioInvitation.findMany({ where: { studioId: sid, status: 'PENDING', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const canInvite = can(me?.actor, 'studio:team:invite', { studioId: sid });
  return (
    <div className="space-y-8"><h1 className="h-section sm:text-3xl">{t('studio.team')}</h1>
      {canInvite && <section><h2 className="mb-3 font-bold">{t('studio.inviteTitle')}</h2><InviteForm studioId={sid} /><p className="mt-2 text-xs text-fg-muted">{t('studio.inviteNote')}</p></section>}
      <section><ul className="space-y-3">{members.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4">
          <div><p className="font-semibold">{m.user.firstName} {m.user.lastName} <Badge tone={m.role === 'OWNER' ? 'brand' : 'neutral'}>{t(`studio.role.${m.role}`)}</Badge></p><p className="text-sm text-fg-muted">{m.user.email} · {formatDate(m.joinedAt, intl, 'Europe/Kyiv')}{m.countsAsSeat && !m.connectionFeePaidAt ? ` · ${t('studio.feeUnpaid')}` : ''}</p></div>
          <MemberActions memberId={m.id} role={m.role} canRoles={can(me?.actor, 'studio:team:manage_roles', { studioId: sid })} canRemove={can(me?.actor, 'studio:team:remove', { studioId: sid, targetRole: m.role })} />
        </li>))}</ul></section>
      {invites.length > 0 && <section><h2 className="mb-3 font-bold">{t('studio.pending')}</h2><ul className="space-y-2">{invites.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border bg-surface px-4 py-2 text-sm"><span>{i.email} · {formatDate(i.expiresAt, intl, 'Europe/Kyiv')}</span>{canInvite && <RevokeButton invitationId={i.id} />}</li>)}</ul></section>}
    </div>
  );
}
