import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, MapPin, Phone, Instagram } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Gallery } from '@/components/catalog/gallery';
import { Rating } from '@/components/catalog/rating';
import { HoursTable, ReviewList, ServiceList } from '@/components/catalog/profile-parts';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates, localizePath } from '@/i18n/routing';
import { getStudioProfile } from '@/server/catalog/profile';
import { jsonLd } from '@/lib/json-ld';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const s = await getStudioProfile(params.slug, params.locale);
  if (!s) return {};
  const description = (s.description ?? '').slice(0, 160);
  return { title: `${s.name} — ${s.city}`, description, alternates: buildAlternates(params.locale, `/studio/${s.slug}`),
    openGraph: { type: 'website', title: s.name, description, images: s.logoUrl ? [{ url: s.logoUrl }] : undefined } };
}

export default async function StudioPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const s = await getStudioProfile(params.slug, locale);
  if (!s) notFound();
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  const structured = {
    '@context': 'https://schema.org', '@type': 'BeautySalon', name: s.name, description: s.description ?? undefined, image: s.logoUrl ?? undefined,
    address: { '@type': 'PostalAddress', addressLocality: s.city, streetAddress: s.addressLine ?? undefined, addressCountry: 'UA' },
    ...(s.phone ? { telephone: s.phone } : {}), ...(s.email ? { email: s.email } : {}),
    ...(s.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.ratingAvg.toFixed(1), reviewCount: s.ratingCount } } : {}),
  };
  const mapQuery = encodeURIComponent(s.addressLine ?? s.city);

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <div className="relative h-40 bg-muted sm:h-56 lg:h-64">
        {s.coverUrl && <img src={s.coverUrl} alt="" width={1200} height={400} decoding="async" className="h-full w-full object-cover" />}
      </div>
      <div className="container">
        <header className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          {s.logoUrl && <img src={s.logoUrl} alt={s.name} width={112} height={112} className="h-24 w-24 shrink-0 rounded-2xl border-4 border-bg bg-surface object-cover shadow-card sm:h-28 sm:w-28" />}
          <div className="min-w-0 pb-1">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{s.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Rating value={s.ratingAvg} count={s.ratingCount} t={t} />
              <span className="flex items-center gap-1 text-sm text-fg-muted"><MapPin className="h-4 w-4" aria-hidden />{[s.city, s.district].filter(Boolean).join(', ')}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.categories.map((c) => <Link key={c.slug} href={localizePath(locale, `/cities/${s.citySlug}/${c.slug}`)}><Badge tone="brand">{c.name}</Badge></Link>)}
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-10">
            {s.description && <section><h2 className="h-section mb-3">{t('profile.aboutStudio')}</h2><p className="whitespace-pre-line text-fg-muted">{s.description}</p></section>}
            {s.photos.length > 0 && <section><h2 className="h-section mb-3">{t('profile.photos')}</h2><Gallery items={s.photos} label={t('profile.photos')} /></section>}
            {s.team.length > 0 && (
              <section>
                <h2 className="h-section mb-3">{t('profile.team')}</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {s.team.map((m) => (
                    <li key={m.slug}>
                      <Link href={localizePath(locale, `/master/${m.slug}`)} className="flex items-center gap-3 rounded-lg border bg-surface p-3 hover:bg-muted">
                        {m.avatarUrl && <img src={m.avatarUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0 rounded-full object-cover" />}
                        <span className="min-w-0"><span className="block font-semibold">{m.name}</span><span className="block truncate text-sm text-fg-muted">{m.categories.join(' · ')}</span><Rating value={m.ratingAvg} count={m.ratingCount} t={t} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section><h2 className="h-section mb-3">{t('profile.services')}</h2><ServiceList services={s.services} t={t} intl={intl} showMaster /></section>
            <section><h2 className="h-section mb-3">{t('profile.reviews')}</h2><ReviewList reviews={s.reviews} t={t} intl={intl} /></section>
          </div>
          <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
            <section><Alert tone="info">{t('profile.chooseMaster')}</Alert></section>
            <section><h2 className="h-section mb-3">{t('profile.hoursTeam')}</h2><HoursTable hours={s.hours} t={t} /></section>
            <section className="space-y-2 text-sm">
              <h2 className="h-section mb-3">{t('profile.contacts')}</h2>
              {s.addressLine && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{s.addressLine}{' '}<a className="font-medium text-brand underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}>{t('profile.openOnMap')}</a></span></p>}
              {s.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden /><a href={`tel:${s.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">{s.phone}</a></p>}
              {s.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden /><a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a></p>}
              {s.socials.instagram && <p className="flex items-center gap-2"><Instagram className="h-4 w-4" aria-hidden /><a rel="noopener noreferrer nofollow" target="_blank" href={`https://instagram.com/${encodeURIComponent(s.socials.instagram.replace(/^@/, ''))}`} className="hover:underline">@{s.socials.instagram.replace(/^@/, '')}</a></p>}
            </section>
            {s.branches.length > 1 && (
              <section><h2 className="h-section mb-3">{t('profile.branches')}</h2>
                <ul className="space-y-2 text-sm">{s.branches.map((b) => <li key={b.id} className="rounded-lg border bg-surface p-3"><p className="font-semibold">{b.name}</p><p className="text-fg-muted">{b.address}</p></li>)}</ul></section>
            )}
          </aside>
        </div>
      </div>
    </article>
  );
}
