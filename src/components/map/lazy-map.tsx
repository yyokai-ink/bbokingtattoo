'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MapCategory } from './map-explorer';

const MapExplorer = dynamic(() => import('./map-explorer').then((m) => m.MapExplorer), { ssr: false, loading: () => <Skeleton className="h-[34rem] w-full" /> });

/** The map (Leaflet JS+CSS, tiles) is only downloaded when the section is about to scroll into view — keeps the home page light. */
export function LazyMap({ categories }: { categories: MapCategory[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || visible) return;
    if (!('IntersectionObserver' in window)) return setVisible(true);
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);
  return <div ref={ref} className="min-h-[34rem]">{visible ? <MapExplorer categories={categories} /> : <Skeleton className="h-[34rem] w-full" />}</div>;
}
