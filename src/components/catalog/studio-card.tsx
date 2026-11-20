import Link from 'next/link';
import { MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FavoriteButton } from '@/components/account/favorite-button';
import { buttonClasses } from '@/components/ui/button';
import { Rating } from './rating';
import type { StudioCard as Data } from '@/server/catalog/search';
import { localeMeta, type Locale } from '@/i18n/config';
import { createT } from '@/i18n/translate';
import { localizePath } from '@/i18n/routing';
import { formatMoney } from '@/lib/money';

export function StudioCard({ s, locale, fav }: { s: Data; locale: Locale; fav?: { on: boolean; loggedIn: boolean } }) {
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  const href = localizePath(locale, `/studio/${s.slug}`);
  return (
    <Card className="relative flex flex-col sm:flex-row">
      {fav && <FavoriteButton kind="studio" id={s.id} initial={fav.on} loggedIn={fav.loggedIn} nextPath={localizePath(locale, '/search')} className="absolute left-3 top-3 z-10" />}
      <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-[4/3] shrink-0 bg-muted sm:aspect-auto sm:w-56 lg:w-64">
        {s.photoUrl && <img src={s.photoUrl} alt="" loading="lazy" decoding="async" width={640} height={480} className="h-full w-full object-cover" />}
        {s.logoUrl && <img src={s.logoUrl} alt="" loading="lazy" decoding="async" width={56} height={56} className="absolute bottom-3 left-3 h-14 w-14 rounded-xl border-2 border-surface object-cover shadow-card" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight"><Link href={href} className="hover:underline">{s.name}</Link></h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-fg-muted"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{[s.city, s.district].filter(Boolean).join(', ')}{s.distanceKm !== null && ` · ${t('search.kmAway', { km: s.distanceKm.toFixed(s.distanceKm < 10 ? 1 : 0) })}`}</p>
          </div>
          <Rating value={s.ratingAvg} count={s.ratingCount} t={t} />
        </div>
        <div className="flex flex-wrap gap-1.5">{s.categories.map((c) => <Badge key={c} tone="brand">{c}</Badge>)}</div>
        {s.description && <p className="line-clamp-2 text-sm text-fg-muted">{s.description}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          <div className="space-y-1 text-sm">
            <p className="font-bold">{s.priceFromMinor !== null ? t('card.priceFrom', { price: formatMoney(s.priceFromMinor, 'UAH', intl) }) : t('card.noPrice')}</p>
            <p className="flex items-center gap-1 text-fg-muted"><Users className="h-3.5 w-3.5" aria-hidden />{t('card.team', { count: s.teamSize })}</p>
          </div>
          <Link href={href} className={buttonClasses('primary', 'md')}>{t('card.viewProfile')}</Link>
        </div>
      </div>
    </Card>
  );
}

export function StudioTile({ s, locale }: { s: Data; locale: Locale }) {
  const t = createT(locale);
  const intl = localeMeta[locale].intl;
  return (
    <Link href={localizePath(locale, `/studio/${s.slug}`)} className="group relative block aspect-[4/5] overflow-hidden rounded-xl bg-muted shadow-card">
      {s.photoUrl && <img src={s.photoUrl} alt="" loading="lazy" decoding="async" width={480} height={600} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-1 p-4 text-white">
        <p className="truncate text-xs font-medium text-white/80">{s.categories.join(' · ')}</p>
        <h3 className="text-lg font-bold leading-tight">{s.name}</h3>
        <div className="flex items-center justify-between gap-2 text-sm"><span>{s.ratingCount > 0 ? `★ ${s.ratingAvg.toFixed(1)}` : s.city}</span><span className="font-semibold">{s.priceFromMinor !== null ? t('card.priceFrom', { price: formatMoney(s.priceFromMinor, 'UAH', intl) }) : ''}</span></div>
      </div>
    </Link>
  );
}
