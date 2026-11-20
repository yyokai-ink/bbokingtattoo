import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { InviteResponse } from '@/components/studio/forms';
import { Alert } from '@/components/ui/alert';
import { buttonClasses } from '@/components/ui/button';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { sha256 } from '@/server/auth/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvitePage({ params, searchParams }: { params: { locale: string }; searchParams: { token?: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale; const t = createT(locale); const token = searchParams.token ?? '';
  const inv = token ? await db.studioInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { studio: { select: { name: true } } } }) : null;
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt < new Date()) return <AuthShell title={t('studio.inviteTitle')}><Alert tone="error">{t('errors.tokenInvalid')}</Alert></AuthShell>;
  const me = await getCurrentUser();
  const here = `${localizePath(locale, '/studio-invite')}?token=${encodeURIComponent(token)}`;
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(here)}`);
  const hasProfile = !!(await db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true } }));
  return (
    <AuthShell title={t('studio.inviteTitle')} intro={t('studio.inviteIntro', { studio: inv.studio.name })}>
      {!hasProfile && <div className="space-y-3"><Alert tone="info">{t('errors.needMasterProfile')}</Alert><Link href={localizePath(locale, '/become-master')} className={buttonClasses('primary')}>{t('wizard.title')}</Link></div>}
      {hasProfile && <InviteResponse token={token} />}
    </AuthShell>
  );
}
