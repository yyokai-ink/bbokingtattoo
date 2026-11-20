import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { BecomeMasterWizard } from '@/components/master/forms';
import { ResendVerification } from '@/components/auth/forms';
import { Alert } from '@/components/ui/alert';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth/session';
import { getCategories, getCities } from '@/server/catalog/reference';
import { toCatOpts } from '@/server/master/context';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string } };
export function generateMetadata({ params }: Props): Metadata { return isLocale(params.locale) ? { title: createT(params.locale)('wizard.title'), robots: { index: false } } : {}; }

export default async function BecomeMasterPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/register')}?next=${encodeURIComponent(localizePath(locale, '/become-master'))}`);
  if (await db.masterProfile.findUnique({ where: { userId: me.id }, select: { id: true } })) redirect(localizePath(locale, '/dashboard/profile'));
  const t = createT(locale);
  const [cities, cats] = await Promise.all([getCities(locale), getCategories(locale)]);
  return (
    <AuthShell title={t('wizard.title')} intro={t('wizard.intro')}>
      {me.emailVerified ? <BecomeMasterWizard cities={cities.map((c) => ({ value: c.slug, label: c.name }))} cats={toCatOpts(cats)} defaultName={`${me.firstName} ${me.lastName}`} />
        : <div className="space-y-3"><Alert tone="info">{t('booking.verifyToBook')}</Alert><ResendVerification /></div>}
    </AuthShell>
  );
}
