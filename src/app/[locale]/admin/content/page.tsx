import { notFound } from 'next/navigation';
import { AppearanceForm } from '@/components/admin/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { getAppearance } from '@/server/site-settings';

export const dynamic = 'force-dynamic';

export default async function AdminContent({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const t = createT(params.locale);
  return <div className="space-y-6"><h1 className="h-section sm:text-3xl">{t('admin.content.title_page')}</h1><AppearanceForm a={await getAppearance()} /></div>;
}
