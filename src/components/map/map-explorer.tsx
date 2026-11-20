'use client';

import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LocateFixed, Loader2, Star } from 'lucide-react';
import type { Map as LMap, LayerGroup, Marker } from 'leaflet';
import { useI18n } from '@/i18n/client';
import { localizePath } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { distanceKm } from '@/lib/geo';
import { formatMoney } from '@/lib/money';
import type { MapMaster, MapPoint } from '@/server/catalog/map';

export interface MapCategory { slug: string; name: string; subs: { slug: string; name: string }[] }
const UKRAINE: [number, number] = [49.0, 31.4];

/**
 * Pick a category (and a style/subcategory — e.g. for tattoo) → matching masters appear on the map (OpenStreetMap, no API key).
 * "Near me" asks for the browser location and sorts the list by distance. All popup text is inserted with textContent (no HTML injection).
 */
export function MapExplorer({ categories, className }: { categories: MapCategory[]; className?: string }) {
  const { t, locale, intl } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState('');
  const [sub, setSub] = useState('');
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const active = categories.find((c) => c.slug === category);

  // 1) create the map once (Leaflet touches `window`, so it is imported lazily on the client)
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !el.current || map.current) return;
      leaflet.current = L;
      const m = L.map(el.current, { scrollWheelZoom: false, worldCopyJump: true }).setView(UKRAINE, 6); // wheel zoom off: the page must still scroll
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    })();
    return () => { disposed = true; map.current?.remove(); map.current = null; setReady(false); };
  }, []);

  // 2) load masters whenever the filters change
  useEffect(() => {
    const ctrl = new AbortController();
    setState('loading');
    const qs = new URLSearchParams({ locale, ...(category ? { category } : {}), ...(category && sub ? { sub } : {}) });
    fetch(`/api/map?${qs}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j: { points: MapPoint[] }) => { setPoints(j.points); setState('ok'); })
      .catch((e) => { if ((e as Error)?.name !== 'AbortError') setState('error'); });
    return () => ctrl.abort();
  }, [category, sub, locale]);

  const popup = useCallback((p: MapPoint) => {
    const box = document.createElement('div'); box.style.minWidth = '12rem';
    const h = document.createElement('p'); h.style.cssText = 'margin:0 0 .4rem;font-weight:700'; h.textContent = p.place; box.appendChild(h);
    for (const m of p.masters.slice(0, 6)) {
      const a = document.createElement('a'); a.href = localizePath(locale, `/master/${m.slug}`); a.style.cssText = 'display:block;padding:.2rem 0';
      a.textContent = `${m.name} — ${m.ratingCount > 0 ? `★ ${m.ratingAvg.toFixed(1)}` : m.categories[0] ?? ''}`; box.appendChild(a);
    }
    if (p.masters.length > 6) { const more = document.createElement('p'); more.style.cssText = 'margin:.3rem 0 0;color:#666'; more.textContent = `+${p.masters.length - 6}`; box.appendChild(more); }
    return box;
  }, [locale]);

  // 3) draw markers (one per location, number = masters there)
  useEffect(() => {
    const L = leaflet.current, m = map.current, g = layer.current;
    if (!ready || !L || !m || !g) return;
    g.clearLayers(); markers.current.clear();
    for (const p of points) {
      const icon = L.divIcon({ className: '', html: `<span class="lumera-marker">${p.masters.length}</span>`, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] });
      const mk = L.marker([p.lat, p.lng], { icon, title: p.place, keyboard: true }).bindPopup(popup(p)).addTo(g);
      markers.current.set(p.key, mk);
    }
    if (points.length > 0 && !me) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ready, popup]);

  // 4) "near me"
  const locate = () => {
    if (!('geolocation' in navigator)) return setGeoError(true);
    setGeoBusy(true); setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(c); setGeoBusy(false);
        const L = leaflet.current, m = map.current;
        if (L && m) {
          meMarker.current?.remove();
          meMarker.current = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: '<span class="lumera-marker lumera-marker--me"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }), keyboard: false, interactive: false }).addTo(m);
          m.flyTo([c.lat, c.lng], 12);
        }
      },
      () => { setGeoBusy(false); setGeoError(true); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }, // location stays in the browser; nothing is sent to our server
    );
  };

  const list = useMemo(() => {
    const rows = points.flatMap((p) => p.masters.map((m) => ({ m, p, km: me ? distanceKm(me, { lat: p.lat, lng: p.lng }) : null })));
    return rows.sort((a, b) => (me ? (a.km ?? 0) - (b.km ?? 0) : b.m.ratingAvg - a.m.ratingAvg || b.m.ratingCount - a.m.ratingCount)).slice(0, 40);
  }, [points, me]);
  const total = points.reduce((s, p) => s + p.masters.length, 0);

  const focus = (p: MapPoint) => { map.current?.flyTo([p.lat, p.lng], 15); markers.current.get(p.key)?.openPopup(); el.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const chip = (on: boolean) => cn('chip shrink-0', on ? 'chip-active' : 'chip-idle');
  const price = (m: MapMaster) => (m.priceFromMinor !== null ? t('card.priceFrom', { price: formatMoney(m.priceFromMinor, 'UAH', intl) }) : '');

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-3">
        <div role="group" aria-label={t('search.category')} className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" className={chip(category === '')} aria-pressed={category === ''} onClick={() => { setCategory(''); setSub(''); }}>{t('map.allCategories')}</button>
          {categories.map((c) => <button key={c.slug} type="button" className={chip(category === c.slug)} aria-pressed={category === c.slug} onClick={() => { setCategory(c.slug); setSub(''); }}>{c.name}</button>)}
        </div>
        {active && active.subs.length > 0 && (
          <div role="group" aria-label={active.slug === 'tattoo' ? t('map.style') : t('search.sub')} className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-sm font-semibold text-fg-muted">{active.slug === 'tattoo' ? t('map.style') : t('search.sub')}:</span>
            <button type="button" className={chip(sub === '')} aria-pressed={sub === ''} onClick={() => setSub('')}>{t('map.allStyles')}</button>
            {active.subs.map((s) => <button key={s.slug} type="button" className={chip(sub === s.slug)} aria-pressed={sub === s.slug} onClick={() => setSub(s.slug)}>{s.name}</button>)}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="relative overflow-hidden rounded-xl border shadow-card">
          <div ref={el} role="region" aria-label={t('map.title')} className="h-[55vh] min-h-[22rem] w-full bg-muted lg:h-[34rem]" />
          <button type="button" onClick={locate} disabled={geoBusy} className="absolute right-3 top-3 z-[500] inline-flex min-h-touch items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-pop hover:bg-muted disabled:opacity-60">
            {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}{t('map.nearMe')}
          </button>
          {state === 'loading' && <div className="absolute inset-x-0 bottom-3 z-[500] mx-auto w-fit rounded-full bg-surface px-4 py-1.5 text-sm shadow-pop" role="status">{t('common.loading')}</div>}
        </div>

        <aside className="flex min-h-0 flex-col" aria-live="polite">
          <p className="mb-2 text-sm font-semibold">{state === 'error' ? t('map.error') : t('map.found', { count: total })}{me ? ` · ${t('map.sortedByDistance')}` : ''}</p>
          {geoError && <p role="alert" className="mb-2 text-sm text-danger">{t('search.nearMeDenied')}</p>}
          {state === 'ok' && total === 0 ? <p className="rounded-lg border bg-surface p-4 text-sm text-fg-muted">{t('map.none')}</p> : (
            <ul className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {list.map(({ m, p, km }) => (
                <li key={`${p.key}-${m.id}`} className="flex items-center gap-3 rounded-lg border bg-surface p-2.5">
                  {m.avatarUrl ? <img src={m.avatarUrl} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-full bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <Link href={localizePath(locale, `/master/${m.slug}`)} className="block truncate font-semibold hover:underline">{m.name}</Link>
                    <p className="truncate text-xs text-fg-muted">{m.categories.join(' · ')}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs"><span className="inline-flex items-center gap-0.5">{m.ratingCount > 0 && <><Star className="h-3 w-3 fill-warning text-warning" aria-hidden />{m.ratingAvg.toFixed(1)}</>}</span><span className="font-semibold">{price(m)}</span>{km !== null && <span className="text-fg-muted">{t('search.kmAway', { km: km.toFixed(km < 10 ? 1 : 0) })}</span>}</p>
                  </div>
                  <button type="button" onClick={() => focus(p)} className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">{t('map.show')}</button>
                </li>
              ))}
            </ul>)}
        </aside>
      </div>
    </div>
  );
}
