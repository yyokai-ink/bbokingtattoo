import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, MapPin, Phone, Instagram, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Gallery } from '@/components/catalog/gallery';
import { BookingWidget } from '@/components/account/booking-widget';
import { FavoriteButton } from '@/components/account/favorite-button';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { Rating } from '@/components/catalog/rating';
import { HoursTable, ReviewList, ServiceList, SlotCalendar } from '@/components/catalog/profile-parts';
import { isLocale, localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { buildAlternates, localizePath } from '@/i18n/routing';
import { getMasterProfile } from '@/server/catalog/profile';
import { jsonLd } from '@/lib/json-ld';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';
type Props = { params: { locale: string; slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const m = await getMasterProfile(params.slug, params.locale);
  if (!m) return {};
  const description = (m.bio ?? m.headline ?? '').slice(0, 160);
  return {
    title: `${m.name} — ${m.categories.map((c) => c.name).join(', ')}, ${m.city}`, description,
    alternates: buildAlternates(params.locale, `/master/${m.slug}`),
    openGraph: { type: 'profile', title: m.name, description, images: m.avatarUrl ? [{ url: m.avatarUrl }] : undefined },
  };
}

export default async function MasterPage({ params }: Props) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const m = await getMasterProfile(params.slug, locale);
  if (!m) notFound();
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  const structured = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: m.name, description: m.headline ?? undefined,
    image: m.avatarUrl ?? undefined, address: { '@type': 'PostalAddress', addressLocality: m.city, streetAddress: m.addressLine ?? undefined, addressCountry: 'UA' },
    ...(m.contactPhone ? { telephone: m.contactPhone } : {}),
    ...(m.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: m.ratingAvg.toFixed(1), reviewCount: m.ratingCount } } : {}),
    ...(m.priceFromMinor !== null ? { priceRange: `from ${formatMoney(m.priceFromMinor, 'UAH', 'en')}` } : {}),
  };
  const me = await getCurrentUser().catch(() => null);
  const isFav = me ? !!(await db.favorite.findFirst({ where: { userId: me.id, masterId: m.id }, select: { id: true } })) : false;
  const selfPath = localizePath(locale, `/master/${m.slug}`);
  const widgetServices = m.services.filter((x) => x.priceMinor !== null).map((x) => ({ id: x.id, label: `${x.name} · ${t('profile.minutes', { count: x.durationMin })} · ${formatMoney(x.priceMinor!, 'UAH', intl)}` }));
  const mapQuery = encodeURIComponent([m.addressLine, m.city].filter(Boolean).join(', '));

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <div className="relative h-40 bg-muted sm:h-56 lg:h-64">
        {m.coverUrl && <img src={m.coverUrl} alt="" width={1200} height={400} decoding="async" className="h-full w-full object-cover" />}
      </div>
      <div className="container">
        <header className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          {m.avatarUrl && <img src={m.avatarUrl} alt={m.name} width={112} height={112} className="h-24 w-24 shrink-0 rounded-full border-4 border-bg bg-surface object-cover shadow-card sm:h-28 sm:w-28" />}
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{m.name}</h1><FavoriteButton kind="master" id={m.id} initial={isFav} loggedIn={!!me} nextPath={selfPath} className="border" /></div>
            {m.headline && <p className="text-fg-muted">{m.headline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Rating value={m.ratingAvg} count={m.ratingCount} t={t} />
              <span className="flex items-center gap-1 text-sm text-fg-muted"><MapPin className="h-4 w-4" aria-hidden />{[m.city, m.district].filter(Boolean).join(', ')}</span>
              {m.experienceYears !== null && <span className="text-sm text-fg-muted">{t('card.experience', { count: m.experienceYears })}</span>}
              {m.gender && <span className="text-sm text-fg-muted">{t(`profile.gender.${m.gender}`)}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.categories.map((c) => <Link key={c.slug} href={localizePath(locale, `/cities/${m.citySlug}/${c.slug}`)}><Badge tone="brand">{c.name}</Badge></Link>)}
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-10">
            {m.bio && <section><h2 className="h-section mb-3">{t('profile.about')}</h2><p className="whitespace-pre-line text-fg-muted">{m.bio}</p></section>}
            {m.portfolio.length > 0 && <section><h2 className="h-section mb-3">{t('profile.portfolio')}</h2><Gallery items={m.portfolio} label={t('profile.portfolio')} /></section>}
            <section><h2 className="h-section mb-3">{t('profile.services')}</h2><ServiceList services={m.services} t={t} intl={intl} /></section>
            <section><h2 className="h-section mb-3">{t('profile.reviews')}</h2><ReviewList reviews={m.reviews} t={t} intl={intl} /></section>
          </div>
          <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
            <section id="booking">
              <h2 className="h-section mb-3">{t('profile.freeSlots')}</h2>
              <SlotCalendar days={m.slotDays} timezone={m.timezone} intl={intl} t={t} />
              <div className="mt-4"><h3 className="mb-2 font-bold">{t('booking.title')}</h3>
                <BookingWidget masterId={m.id} services={widgetServices} nextPath={selfPath}
                  user={me ? { name: `${me.firstName} ${me.lastName}`, email: me.email, phone: me.phone ?? '', verified: me.emailVerified } : null} /></div>
            </section>
            <section>
              <h2 className="h-section mb-3">{t('profile.hours')}</h2>
              <HoursTable hours={m.hours} t={t} />
            </section>
            <section className="space-y-2 text-sm">
              <h2 className="h-section mb-3">{t('profile.contacts')}</h2>
              {(m.addressLine || m.workAreaNote) && (
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{[m.addressLine, m.workAreaNote].filter(Boolean).join(' · ')}{' '}
                  {m.addressLine && <a className="font-medium text-brand underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}>{t('profile.openOnMap')}</a>}</span></p>
              )}
              {m.contactPhone && <p className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden /><a href={`tel:${m.contactPhone.replace(/[^+\d]/g, '')}`} className="hover:underline">{m.contactPhone}</a></p>}
              {m.contactEmail && <p className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden /><a href={`mailto:${m.contactEmail}`} className="hover:underline">{m.contactEmail}</a></p>}
              {m.socials.instagram && <p className="flex items-center gap-2"><Instagram className="h-4 w-4" aria-hidden /><a rel="noopener noreferrer nofollow" target="_blank" href={`https://instagram.com/${encodeURIComponent(m.socials.instagram.replace(/^@/, ''))}`} className="hover:underline">@{m.socials.instagram.replace(/^@/, '')}</a></p>}
              {m.socials.telegram && <p className="flex items-center gap-2"><Send className="h-4 w-4" aria-hidden /><a rel="noopener noreferrer nofollow" target="_blank" href={`https://t.me/${encodeURIComponent(m.socials.telegram.replace(/^@/, ''))}`} className="hover:underline">@{m.socials.telegram.replace(/^@/, '')}</a></p>}
            </section>
            {m.studios.length > 0 && (
              <section>
                <h2 className="h-section mb-3">{t('profile.studios')}</h2>
                <ul className="space-y-2">{m.studios.map((s) => (
                  <li key={s.slug}><Link href={localizePath(locale, `/studio/${s.slug}`)} className="flex items-center gap-3 rounded-lg border bg-surface p-3 hover:bg-muted">
                    {s.logoUrl && <img src={s.logoUrl} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-lg object-cover" />}<span className="font-semibold">{s.name}</span></Link></li>
                ))}</ul>
              </section>
            )}
          </aside>
        </div>
      </div>
      {widgetServices.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 flex items-center justify-between gap-3 border-t bg-surface/95 px-4 py-2.5 md:hidden">
          <p className="text-sm font-bold">{m.priceFromMinor !== null ? t('card.priceFrom', { price: formatMoney(m.priceFromMinor, 'UAH', intl) }) : ''}</p>
          <a href="#booking" className="inline-flex min-h-touch items-center rounded-md bg-brand px-6 font-semibold text-brand-fg">{t('booking.title')}</a>
        </div>
      )}
    </article>
  );
}
