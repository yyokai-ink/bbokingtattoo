import { notFound } from 'next/navigation';
import { MasterProfileForm, PublishPanel } from '@/components/master/forms';
import { MasterStudios } from '@/components/studio/forms';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { db } from '@/server/db';
import { missingForPublish } from '@/server/master/rules';
import { requireMasterPage, toCatOpts } from '@/server/master/context';

export const dynamic = 'force-dynamic';

export default async function DashboardProfile({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const { profile, categories } = await requireMasterPage(params.locale, '/dashboard/profile');
  const t = createT(params.locale);
  const [pricedServiceCount, workingRangeCount] = await Promise.all([
    db.service.count({ where: { masterId: profile.id, isActive: true, prices: { some: { currency: 'UAH' } } } }), db.workingHours.count({ where: { masterId: profile.id } }),
  ]);
  const missing = missingForPublish({ avatarUrl: profile.avatarUrl, categoryCount: profile.categories.length, pricedServiceCount, workingRangeCount });
  const memberships = await db.studioMember.findMany({ where: { userId: profile.userId, status: 'ACTIVE', role: { not: 'OWNER' } }, include: { studio: { select: { name: true } } } });
  const soc = (profile.socials ?? {}) as { instagram?: string; telegram?: string };
  return (
    <div className="container grid gap-8 py-8 lg:grid-cols-[1fr_22rem]">
      <div><h1 className="h-section mb-5 sm:text-3xl">{t('dashboard.profile')}</h1>
        <MasterProfileForm cats={toCatOpts(categories)} selected={profile.categories.map((c) => c.category.slug)}
          p={{ address: profile.address?.line1 ?? '', displayName: profile.displayName, headline: profile.headline ?? '', bio: profile.bio ?? '', workAreaNote: profile.workAreaNote ?? '', phone: profile.contactPhone ?? '', email: profile.contactEmail ?? '', instagram: soc.instagram ?? '', telegram: soc.telegram ?? '', experienceSince: profile.experienceSince, gender: profile.gender ?? '', showGender: profile.showGender, avatarUrl: profile.avatarUrl, coverUrl: profile.coverUrl }} /></div>
      <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start"><PublishPanel published={profile.status === 'PUBLISHED'} missing={missing} locale={params.locale} /><MasterStudios items={memberships.map((m) => ({ memberId: m.id, name: m.studio.name, consent: m.portfolioConsent }))} /></aside>
    </div>
  );
}
