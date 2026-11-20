import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin, ShieldCheck, Wallet, Images } from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardBody } from '@/components/ui/card';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { MasterTile } from '@/components/catalog/master-card';
import { StudioTile } from '@/components/catalog/studio-card';
import { isLocale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates, localizePath } from '@/i18n/routing';
import { getCategories, getCities } from '@/server/catalog/reference';
import { searchMasters, searchStudios } from '@/server/catalog/search';
import { parseSearchParams } from '@/server/catalog/params';
import { HeroMedia } from '@/components/catalog/hero-media';
import { LazyMap } from '@/components/map/lazy-map';
import { getAppearance } from '@/server/site-settings';
import { db } from '@/server/db';
import { publicMasterWhere } from '@/server/catalog/visibility';

export const dynamic = 'force-dynamic'; // TODO(Stage 4): cache with revalidate once admin edits can invalidate it

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  if (!isLocale(params.locale)) return {};
  const t = createT(params.locale);
  return { title: { absolute: `${t('app.name')} — ${t('home.heroTitle')}` }, description: t('home.heroSub'), alternates: buildAlternates(params.locale, '/') };
}

function SectionHead({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="h-section">{title}</h2>
      <Link href={href} className="inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-brand hover:underline">{label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </div>
  );
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const t = createT(locale);
  const [appearance, feed, cities, categories, popular, recommended, studios] = await Promise.all([
    getAppearance(),
    db.portfolioItem.findMany({ where: { moderation: 'APPROVED', type: 'IMAGE', master: { is: publicMasterWhere } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 120,
      select: { id: true, url: true, caption: true, categoryId: true, master: { select: { slug: true, displayName: true } } } }),
    getCities(locale), getCategories(locale),
    searchMasters(parseSearchParams({ sort: 'popularity' }), locale),
    searchMasters(parseSearchParams({ sort: 'rating' }), locale),
    searchStudios(parseSearchParams({ type: 'studio', sort: 'rating' }), locale),
  ]);
  const coverByCategory = new Map<string, string>();
  for (const f of feed) if (f.categoryId && !coverByCategory.has(f.categoryId)) coverByCategory.set(f.categoryId, f.url);
  const masonry = feed.filter((_, i) => i % 3 !== 2).slice(0, 12); // a varied slice of recent real works
  const popularIds = new Set(popular.items.slice(0, 4).map((m) => m.id));
  const recs = recommended.items.filter((m) => !popularIds.has(m.id)).slice(0, 4);
  const search = localizePath(locale, '/search');

  const benefits = [
    { Icon: ShieldCheck, title: t('home.benefits.b1Title'), body: t('home.benefits.b1Body') },
    { Icon: Wallet, title: t('home.benefits.b2Title'), body: t('home.benefits.b2Body') },
    { Icon: Images, title: t('home.benefits.b3Title'), body: t('home.benefits.b3Body') },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden text-white">
        <HeroMedia a={appearance} />
        <div className="container relative z-10 flex min-h-[26rem] flex-col justify-end py-10 sm:min-h-[34rem] sm:py-16">
          <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">{appearance.heroTitle[locale] || t('home.heroTitle')}</h1>
          <p className="mt-4 max-w-2xl text-white/85 sm:text-xl">{appearance.heroSubtitle[locale] || t('home.heroSub')}</p>
          <form action={search} method="get" className="mt-8 grid gap-3 rounded-2xl bg-surface p-4 text-fg shadow-pop sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_10rem_auto] lg:items-end">
            <Select label={t('search.city')} name="city" defaultValue="">
              <option value="">{t('search.anyCity')}</option>
              {cities.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
            <Select label={t('search.category')} name="category" defaultValue="">
              <option value="">{t('search.anyCategory')}</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
            <Input label={t('search.date')} type="date" name="date" />
            <Input label={t('search.priceMax')} type="number" inputMode="numeric" min={0} name="priceMax" />
            <Button type="submit" size="lg" className="sm:col-span-2 lg:col-span-1">{t('search.searchBtn')}</Button>
          </form>
        </div>
      </section>

      <section className="container pt-12" aria-labelledby="map-h">
        <h2 id="map-h" className="h-section sm:text-3xl">{t('map.title')}</h2><p className="mb-5 mt-1 text-fg-muted">{t('map.subtitle')}</p>
        <LazyMap categories={categories.map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.map((x) => ({ slug: x.slug, name: x.name })) }))} />
      </section>

      <div className="container cv-auto space-y-14 py-12">
        <section>
          <h2 className="h-section mb-5">{t('home.categoriesTitle')}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`${search}?category=${c.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-brand shadow-card">
                  {coverByCategory.get(c.id) && <img src={coverByCategory.get(c.id)} alt="" loading="lazy" decoding="async" width={300} height={400} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />}
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-sm font-bold text-white"><CategoryIcon name={c.icon} className="h-4 w-4 shrink-0" />{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {masonry.length > 0 && (
          <section>
            <SectionHead title={t('home.worksTitle')} href={search} label={t('home.seeAll')} />
            <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>li]:mb-3 [&>li]:break-inside-avoid">
              {masonry.map((w, i) => (
                <li key={w.id}>
                  <Link href={localizePath(locale, `/master/${w.master.slug}`)} className="group relative block overflow-hidden rounded-xl bg-muted">
                    <img src={w.url} alt={w.caption ?? w.master.displayName} loading="lazy" decoding="async" width={400} height={i % 2 ? 500 : 400} className="h-auto w-full transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-semibold text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">{w.master.displayName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {popular.items.length > 0 && (
          <section>
            <SectionHead title={t('home.mastersTitle')} href={`${search}?sort=popularity`} label={t('home.seeAll')} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{popular.items.slice(0, 4).map((m) => <li key={m.id}><MasterTile m={m} locale={locale} /></li>)}</ul>
          </section>
        )}

        {studios.items.length > 0 && (
          <section>
            <SectionHead title={t('home.studiosTitle')} href={`${search}?type=studio`} label={t('home.seeAll')} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{studios.items.slice(0, 4).map((s) => <li key={s.id}><StudioTile s={s} locale={locale} /></li>)}</ul>
          </section>
        )}

        {recs.length > 0 && (
          <section>
            <SectionHead title={t('home.recommendedTitle')} href={search} label={t('home.seeAll')} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{recs.map((m) => <li key={m.id}><MasterTile m={m} locale={locale} /></li>)}</ul>
          </section>
        )}

        <section>
          <h2 className="h-section mb-5">{t('home.citiesTitle')}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cities.map((c) => (
              <li key={c.id}>
                <Link href={localizePath(locale, `/cities/${c.slug}`)} className="flex min-h-touch items-center gap-3 rounded-lg border bg-surface p-4 font-semibold transition-shadow hover:shadow-pop">
                  <MapPin className="h-5 w-5 text-accent" aria-hidden /><span>{c.name}<span className="block text-xs font-normal text-fg-muted">{t('card.team', { count: c.masterCount })}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="h-section mb-5">{t('home.benefitsTitle')}</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {benefits.map(({ Icon, title, body }) => (
              <li key={title}><Card className="h-full"><CardBody>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand"><Icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm text-fg-muted">{body}</p>
              </CardBody></Card></li>
            ))}
          </ul>
        </section>

        <section className={`relative isolate overflow-hidden rounded-2xl p-6 sm:p-12 ${appearance.ctaBgUrl ? 'text-white' : 'bg-brand-soft'}`}>
          {appearance.ctaBgUrl && <><img src={appearance.ctaBgUrl} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" /><div aria-hidden className="absolute inset-0 -z-10 bg-black/55" /></>}
          <h2 className="h-section sm:text-4xl">{t('home.partnerTitle')}</h2>
          <p className={`mt-2 max-w-2xl ${appearance.ctaBgUrl ? 'text-white/85' : 'text-fg-muted'}`}>{t('home.partnerBody')}</p>
          <Link href={localizePath(locale, '/partners')} className={`${buttonClasses('primary', 'lg')} mt-5`}>{t('home.partnerCta')}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </section>
      </div>
    </>
  );
}
