import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button, buttonClasses } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FilterDisclosure, NearMeButton } from './filters-client';
import { MasterCard } from './master-card';
import { StudioCard } from './studio-card';
import { Pagination } from './pagination';
import { getCategories, getCities, getDistricts } from '@/server/catalog/reference';
import { searchMasters, searchStudios } from '@/server/catalog/search';
import { toQueryString, type SearchFilters, type SortKey } from '@/server/catalog/params';
import type { Locale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { localizePath } from '@/i18n/routing';
import { cn } from '@/lib/cn';

const MASTER_SORTS: SortKey[] = ['rating', 'popularity', 'price', 'nearest', 'distance'];
const STUDIO_SORTS: SortKey[] = ['rating', 'popularity', 'price', 'distance'];

/** Shared by /search and the SEO pages /cities/<city>[/<category>]. The URL query is the only state. */
export async function CatalogSearch({ locale, filters: f, heading, intro }: { locale: Locale; filters: SearchFilters; heading: string; intro?: string }) {
  const t = createT(locale);
  const [cities, categories, districts, result] = await Promise.all([
    getCities(locale), getCategories(locale), f.city ? getDistricts(f.city, locale) : Promise.resolve([]),
    f.type === 'studio' ? searchStudios(f, locale) : searchMasters(f, locale),
  ]);
  const me = await getCurrentUser().catch(() => null);
  const favRows = me ? await db.favorite.findMany({ where: { userId: me.id }, select: { masterId: true, studioId: true } }) : [];
  const favIds = new Set(favRows.flatMap((r) => [r.masterId, r.studioId]).filter((x): x is string => !!x));
  const activeCategory = categories.find((c) => c.slug === f.category);
  const base = localizePath(locale, '/search');
  const link = (o: Partial<SearchFilters>) => `${base}${toQueryString(f, { page: 1, ...o })}`;
  const sorts = f.type === 'studio' ? STUDIO_SORTS : MASTER_SORTS;
  const hasFilters = Object.keys(f).some((k) => !['type', 'sort', 'page'].includes(k) && f[k as keyof SearchFilters] !== undefined);

  return (
    <div className="container py-8">
      <header className="mb-6">
        <h1 className="h-section sm:text-3xl">{heading}</h1>
        {intro && <p className="mt-2 max-w-3xl text-fg-muted">{intro}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside>
          <FilterDisclosure>
            <form action={base} method="get" className="space-y-4">
              <input type="hidden" name="type" value={f.type} />
              {f.sort !== 'rating' && f.sort !== 'distance' && <input type="hidden" name="sort" value={f.sort} />}
              {f.lat !== undefined && f.lng !== undefined && (<><input type="hidden" name="lat" value={f.lat} /><input type="hidden" name="lng" value={f.lng} />{f.sort === 'distance' && <input type="hidden" name="sort" value="distance" />}</>)}
              <Select label={t('search.city')} name="city" defaultValue={f.city ?? ''}>
                <option value="">{t('search.anyCity')}</option>
                {cities.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </Select>
              {districts.length > 0 && (
                <Select label={t('search.district')} name="district" defaultValue={f.district ?? ''}>
                  <option value="">{t('search.anyDistrict')}</option>
                  {districts.map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}
                </Select>
              )}
              <Select label={t('search.category')} name="category" defaultValue={f.category ?? ''}>
                <option value="">{t('search.anyCategory')}</option>
                {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </Select>
              {activeCategory && activeCategory.subs.length > 0 && (
                <Select label={t('search.sub')} name="sub" defaultValue={f.sub ?? ''}>
                  <option value="">{t('search.anySub')}</option>
                  {activeCategory.subs.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                </Select>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('search.date')} type="date" name="date" defaultValue={f.date ?? ''} />
                <Input label={t('search.time')} type="time" name="time" step={1800} defaultValue={f.time ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('search.priceMin')} type="number" inputMode="numeric" min={0} name="priceMin" defaultValue={f.priceMin ?? ''} />
                <Input label={t('search.priceMax')} type="number" inputMode="numeric" min={0} name="priceMax" defaultValue={f.priceMax ?? ''} />
              </div>
              <Select label={t('search.rating')} name="rating" defaultValue={f.rating ?? ''}>
                <option value="">{t('search.anyRating')}</option>
                {[5, 4, 3].map((n) => <option key={n} value={n}>{t('search.ratingFrom', { count: n })}</option>)}
              </Select>
              {f.type === 'master' && (<>
                <Select label={t('search.experience')} name="experience" defaultValue={f.experience ?? ''}>
                  <option value="">{t('search.anyExperience')}</option>
                  {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{t('search.experienceFrom', { count: n })}</option>)}
                </Select>
                <Select label={t('search.gender')} name="gender" defaultValue={f.gender ?? ''}>
                  <option value="">{t('search.anyGender')}</option>
                  <option value="female">{t('search.female')}</option>
                  <option value="male">{t('search.male')}</option>
                </Select>
                <label className="flex min-h-touch items-center gap-3 text-sm">
                  <input type="checkbox" name="available" value="1" defaultChecked={f.available} className="h-5 w-5 accent-[hsl(var(--brand))]" />{t('search.available')}
                </label>
              </>)}
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">{t('search.apply')}</Button>
                <Link href={`${base}${f.type === 'studio' ? '?type=studio' : ''}`} className={buttonClasses('ghost')}>{t('search.reset')}</Link>
              </div>
              <NearMeButton />
            </form>
          </FilterDisclosure>
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="tablist">
              {(['master', 'studio'] as const).map((tp) => (
                <Link key={tp} role="tab" aria-selected={f.type === tp} href={link({ type: tp, sort: f.sort === 'nearest' && tp === 'studio' ? 'rating' : f.sort })} className={cn('chip', f.type === tp ? 'chip-active' : 'chip-idle')}>
                  {t(tp === 'master' ? 'search.tabMasters' : 'search.tabStudios')}
                </Link>
              ))}
            </div>
            <p className="text-sm font-semibold">{t('search.results', { count: result.total })}</p>
          </div>

          <nav aria-label={t('search.sortLabel')} className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {sorts.filter((s) => s !== 'distance' || f.lat !== undefined).map((s) => (
              <Link key={s} href={link({ sort: s })} aria-current={f.sort === s ? 'true' : undefined} className={cn('chip shrink-0', f.sort === s ? 'chip-active' : 'chip-idle')}>{t(`search.sort.${s}`)}</Link>
            ))}
          </nav>

          {result.items.length === 0 ? (
            <div className="rounded-lg border bg-surface p-10 text-center">
              <SearchX className="mx-auto h-10 w-10 text-fg-muted" aria-hidden />
              <h2 className="mt-3 text-lg font-bold">{t('search.noResults')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('search.noResultsHint')}</p>
              {hasFilters && <Link href={`${base}${f.type === 'studio' ? '?type=studio' : ''}`} className={cn(buttonClasses('secondary'), 'mt-4')}>{t('search.reset')}</Link>}
            </div>
          ) : (
            <ul className="space-y-4">
              {f.type === 'studio'
                ? (result.items as Awaited<ReturnType<typeof searchStudios>>['items']).map((s) => <li key={s.id}><StudioCard s={s} locale={locale} fav={{ on: favIds.has(s.id), loggedIn: !!me }} /></li>)
                : (result.items as Awaited<ReturnType<typeof searchMasters>>['items']).map((m) => <li key={m.id}><MasterCard m={m} locale={locale} fav={{ on: favIds.has(m.id), loggedIn: !!me }} /></li>)}
            </ul>
          )}
          <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => link({ page: p })} t={t} />
          {f.date && <Alert tone="info" className="mt-6">{f.date}{f.time ? ` · ${f.time}+` : ''}</Alert>}
        </section>
      </div>
    </div>
  );
}
