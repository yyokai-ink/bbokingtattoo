'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '@/i18n/client';

export interface GalleryItem { id: string; url: string; caption: string | null }

/** Responsive portfolio grid with a full-size viewer: Esc closes, ←/→ navigate, swipe on touch, focus returns on close. */
export function Gallery({ items, label }: { items: GalleryItem[]; label: string }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((delta: number) => setOpen((i) => (i === null ? i : (i + delta + items.length) % items.length)), [items.length]);
  const close = useCallback(() => { setOpen(null); opener.current?.focus(); }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, close, go]);

  const current = open !== null ? items[open] : null;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label={label}>
        {items.map((it, i) => (
          <li key={it.id}>
            <button type="button" aria-label={`${t('profile.openImage')} ${i + 1}/${items.length}`} onClick={(e) => { opener.current = e.currentTarget; setOpen(i); }}
              className="block aspect-[4/5] w-full overflow-hidden rounded-md bg-muted">
              <img src={it.url} alt={it.caption ?? ''} loading="lazy" decoding="async" width={400} height={500} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex flex-col bg-black/90 pt-safe pb-safe"
          onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touchX.current !== null && x !== undefined && Math.abs(x - touchX.current) > 50) go(x < touchX.current ? 1 : -1); touchX.current = null; }}>
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">{open! + 1} / {items.length}</span>
            <button ref={closeBtn} type="button" onClick={close} aria-label={t('profile.closeImage')} className="min-h-touch min-w-touch rounded-md hover:bg-white/10"><X className="mx-auto h-6 w-6" /></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <img src={current.url} alt={current.caption ?? ''} className="max-h-full max-w-full object-contain" />
            {items.length > 1 && (<>
              <button type="button" onClick={() => go(-1)} aria-label={t('profile.prevImage')} className="absolute left-2 min-h-touch min-w-touch rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronLeft className="mx-auto h-6 w-6" /></button>
              <button type="button" onClick={() => go(1)} aria-label={t('profile.nextImage')} className="absolute right-2 min-h-touch min-w-touch rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronRight className="mx-auto h-6 w-6" /></button>
            </>)}
          </div>
          {current.caption && <p className="p-3 text-center text-sm text-white/80">{current.caption}</p>}
        </div>
      )}
    </>
  );
}
