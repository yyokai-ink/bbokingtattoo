import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { BlockButton } from '@/components/admin/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { buttonClasses } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
const PAGE = 25;
type Props = { params: { locale: string }; searchParams: { q?: string; page?: string } };

export default async function AdminUsers({ params, searchParams }: Props) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  const me = await getCurrentUser();
  const q = (searchParams.q ?? '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(searchParams.page) || 1));
  const where = q ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }] } : {};
  const [total, users] = await Promise.all([db.user.count({ where }), db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: { roles: true } })]);
  const href = (p: number) => `${localizePath(params.locale, '/admin/users')}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <div className="space-y-5">
      <h1 className="h-section sm:text-3xl">{t('admin.users')} <span className="text-base font-normal text-fg-muted">({total})</span></h1>
      <form method="get" className="flex gap-2"><input name="q" defaultValue={q} placeholder={t('admin.searchUsers')} className="control max-w-sm" /><button className={buttonClasses('primary')}>{t('search.searchBtn')}</button></form>
      <table className="responsive-table">
        <thead><tr><th className="p-2">{t('admin.user')}</th><th className="p-2">{t('admin.roles')}</th><th className="p-2">{t('billing.statusCol')}</th><th className="p-2" /></tr></thead>
        <tbody>{users.map((u) => {
          const isAdmin = u.roles.some((r) => r.role === 'SUPER_ADMIN');
          return (
            <tr key={u.id} className="border-b">
              <td data-label={t('admin.user')} className="p-2"><span className="font-semibold">{u.firstName} {u.lastName}</span><br /><span className="text-fg-muted">{u.email}</span></td>
              <td data-label={t('admin.roles')} className="p-2"><span className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.id} tone="brand">{r.role}</Badge>)}</span></td>
              <td data-label={t('billing.statusCol')} className="p-2"><Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status}</Badge></td>
              <td className="p-2">{!isAdmin && u.id !== me?.id && u.status !== 'DELETED' && <BlockButton userId={u.id} blocked={u.status === 'BLOCKED'} />}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <nav className="flex justify-between">{page > 1 ? <Link href={href(page - 1)} className={buttonClasses('secondary')}>{t('search.prev')}</Link> : <span />}{page * PAGE < total && <Link href={href(page + 1)} className={buttonClasses('secondary')}>{t('search.next')}</Link>}</nav>
    </div>
  );
}
