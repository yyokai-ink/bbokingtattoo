import { redirect } from 'next/navigation';
import { db } from '../db';
import { getCurrentUser } from '../auth/session';
import { getCategories, getCities } from '../catalog/reference';
import { localizePath } from '@/i18n/routing';
import type { Locale } from '@/i18n/config';

/** Page guard for the master cabinet: logged in → has a profile (else onboarding). Returns everything pages commonly need. */
export async function requireMasterPage(locale: Locale, path: string) {
  const me = await getCurrentUser();
  if (!me) redirect(`${localizePath(locale, '/login')}?next=${encodeURIComponent(localizePath(locale, path))}`);
  const profile = await db.masterProfile.findUnique({ where: { userId: me.id }, include: { city: { select: { timezone: true } }, address: { select: { line1: true } }, categories: { select: { category: { select: { slug: true } } } } } });
  if (!profile) redirect(localizePath(locale, '/become-master'));
  const categories = await getCategories(locale);
  const mine = new Set(profile.categories.map((c) => c.category.slug));
  return { me, profile, categories, myCategories: categories.filter((c) => mine.has(c.slug)) };
}

export const toCatOpts = (cats: Awaited<ReturnType<typeof getCategories>>) => cats.map((c) => ({ value: c.slug, label: c.name, subs: c.subs.map((s) => ({ value: s.slug, label: s.name })) }));
export { getCities };
