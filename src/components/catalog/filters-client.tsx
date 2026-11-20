'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { LocateFixed, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import { useToast } from '@/components/ui/toast';

/** Collapsible on phones, always open on desktop (lg ≥ 1024px). */
export function FilterDisclosure({ children }: { children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => { if (ref.current) ref.current.open = mq.matches; };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return (
    <details ref={ref} className="group rounded-lg border bg-surface shadow-card">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-4 font-semibold lg:hidden">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />{t('search.filters')}
      </summary>
      <div className="border-t p-4 lg:border-t-0">{children}</div>
    </details>
  );
}

/** Asks the browser for coordinates and re-submits the enclosing form sorted by distance. Nothing is stored. */
export function NearMeButton() {
  const t = useT();
  const toast = useToast();
  return (
    <Button
      variant="secondary" className="w-full"
      onClick={(e) => {
        const form = (e.currentTarget as HTMLButtonElement).closest('form');
        if (!form || !('geolocation' in navigator)) return toast(t('search.nearMeDenied'), 'error');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const set = (name: string, value: string) => {
              let input = form.elements.namedItem(name) as HTMLInputElement | null;
              if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = name; form.appendChild(input); }
              input.value = value;
            };
            set('lat', pos.coords.latitude.toFixed(5)); set('lng', pos.coords.longitude.toFixed(5)); set('sort', 'distance'); set('page', '1');
            form.requestSubmit();
          },
          () => toast(t('search.nearMeDenied'), 'error'),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
        );
      }}
    >
      <LocateFixed className="h-4 w-4" aria-hidden />{t('search.nearMe')}
    </Button>
  );
}
