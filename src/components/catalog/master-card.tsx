import Link from 'next/link';
import { MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FavoriteButton } from '@/components/account/favorite-button';
import { buttonClasses } from '@/components/ui/button';
import { Rating } from './rating';
import type { MasterCard as Data } from '@/server/catalog/search';
import type { Locale } from '@/i18n/config';
import { localeMeta } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { formatMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/datetime';

// Plain <img>: demo media are SVG placeholders. When real S3/CDN media are connected (Stage 3) switch to next/image.
export interface FavProp { on: boolean; loggedIn: boolean }
export function MasterCard({ m, locale, fav }: { m: Data; locale: Locale; fav?: FavProp }) {
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  const href = localizePath(locale, `/master/${m.slug}`);
  return (
    <Card className="relative flex flex-col sm:flex-row">
      {fav && <FavoriteButton kind="master" id={m.id} initial={fav.on} loggedIn={fav.loggedIn} nextPath={localizePath(locale, '/search')} className="absolute left-3 top-3 z-10" />}
      <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-[4/3] shrink-0 bg-muted sm:aspect-auto sm:w-56 lg:w-64">
        {m.photoUrl && <img src={m.photoUrl} alt="" loading="lazy" decoding="async" width={640} height={480} className="h-full w-full object-cover" />}
        {m.avatarUrl && <img src={m.avatarUrl} alt="" loading="lazy" decoding="async" width={56} height={56} className="absolute bottom-3 left-3 h-14 w-14 rounded-full border-2 border-surface object-cover shadow-card" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight"><Link href={href} className="hover:underline">{m.name}</Link></h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-fg-muted"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{[m.city, m.district].filter(Boolean).join(', ')}{m.distanceKm !== null && ` · ${t('search.kmAway', { km: m.distanceKm.toFixed(m.distanceKm < 10 ? 1 : 0) })}`}</p>
          </div>
          <Rating value={m.ratingAvg} count={m.ratingCount} t={t} />
        </div>
        <div className="flex flex-wrap gap-1.5">{m.categories.map((c) => <Badge key={c} tone="brand">{c}</Badge>)}</div>
        {m.bio && <p className="line-clamp-2 text-sm text-fg-muted">{m.bio}</p>}
        {m.studios[0] && <p className="text-xs text-fg-muted">{t('card.atStudio', { name: m.studios.map((s) => s.name).join(', ') })}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          <div className="space-y-1 text-sm">
            <p className="font-bold">{m.priceFromMinor !== null ? t(m.priceIsFrom ? 'card.priceFrom' : 'card.price', { price: formatMoney(m.priceFromMinor, 'UAH', intl) }) : t('card.noPrice')}</p>
            <p className="flex items-center gap-1 text-fg-muted"><Clock className="h-3.5 w-3.5" aria-hidden />{m.nearestSlot ? t('card.nearestSlot', { when: formatDateTime(m.nearestSlot, intl, m.timezone) }) : t('card.noSlots')}</p>
          </div>
          <Link href={href} className={buttonClasses('primary', 'md')}>{t('card.viewProfile')}</Link>
        </div>
      </div>
    </Card>
  );
}

/** Image-forward tile (Behance-style): the work fills the card; name, rating and price sit on a gradient. */
export function MasterTile({ m, locale }: { m: Data; locale: Locale }) {
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  return (
    <Link href={localizePath(locale, `/master/${m.slug}`)} className="group relative block aspect-[4/5] overflow-hidden rounded-xl bg-muted shadow-card">
      {m.photoUrl && <img src={m.photoUrl} alt="" loading="lazy" decoding="async" width={480} height={600} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4 text-white">
        <p className="truncate text-xs font-medium text-white/80">{m.categories.join(' · ')}</p>
        <h3 className="text-lg font-bold leading-tight">{m.name}</h3>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1">{m.avatarUrl && <img src={m.avatarUrl} alt="" width={24} height={24} className="h-6 w-6 rounded-full border border-white/60 object-cover" />}{m.ratingCount > 0 ? `★ ${m.ratingAvg.toFixed(1)}` : m.city}</span>
          <span className="font-semibold">{m.priceFromMinor !== null ? t('card.priceFrom', { price: formatMoney(m.priceFromMinor, 'UAH', intl) }) : ''}</span>
        </div>
      </div>
    </Link>
  );
}
