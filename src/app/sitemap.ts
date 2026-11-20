import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { db } from '@/server/db';
import { publicMasterWhere, publicStudioWhere } from '@/server/catalog/visibility';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const entry = (path: string, lastModified: Date = new Date()) => ({
    url: `${base}/${locales[0]}${path === '/' ? '' : path}`, lastModified,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${base}/${l}${path === '/' ? '' : path}`])) },
  });
  // one sitemap entry per path; hreflang alternates cover the other locales
  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const [cities, categories, masters, studios] = await Promise.all([
      db.city.findMany({ where: { isActive: true, country: { isActive: true } }, select: { slug: true } }),
      db.category.findMany({ where: { isActive: true }, select: { slug: true } }),
      db.masterProfile.findMany({ where: publicMasterWhere, select: { slug: true, updatedAt: true } }),
      db.studioProfile.findMany({ where: publicStudioWhere, select: { slug: true, updatedAt: true } }),
    ]);
    dynamicEntries = [
      ...cities.map((c) => entry(`/cities/${c.slug}`)),
      ...cities.flatMap((c) => categories.map((k) => entry(`/cities/${c.slug}/${k.slug}`))),
      ...masters.map((m) => entry(`/master/${m.slug}`, m.updatedAt)),
      ...studios.map((s) => entry(`/studio/${s.slug}`, s.updatedAt)),
    ];
  } catch { /* DB down: still serve the static part */ }
  return [entry('/'), entry('/search'), entry('/map'), entry('/partners'), entry('/terms'), entry('/privacy'), ...dynamicEntries];
}
