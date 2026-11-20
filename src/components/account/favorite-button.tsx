'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { localizePath } from '@/i18n/routing';
import { toggleFavoriteAction } from '@/server/actions/account';
import { cn } from '@/lib/cn';

/** Heart on cards. Signed-out users are sent to login (and come back); signed-in users toggle instantly (optimistic). */
export function FavoriteButton({ kind, id, initial, loggedIn, nextPath, className }: { kind: 'master' | 'studio'; id: string; initial: boolean; loggedIn: boolean; nextPath: string; className?: string }) {
  const { t, locale } = useI18n();
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  const base = cn('grid h-10 w-10 place-items-center rounded-full bg-surface/95 shadow-card hover:bg-surface', className);
  const icon = <Heart className={cn('h-5 w-5', on ? 'fill-accent text-accent' : 'text-fg')} aria-hidden />;
  if (!loggedIn) return <Link href={`${localizePath(locale, '/login')}?next=${encodeURIComponent(nextPath)}`} className={base} aria-label={t('favorite.add')}>{icon}</Link>;
  return (
    <button type="button" aria-pressed={on} aria-label={t(on ? 'favorite.remove' : 'favorite.add')} className={base}
      onClick={() => { const prev = on; setOn(!prev); start(async () => { const r = await toggleFavoriteAction(kind, id); if (!r.ok) setOn(prev); else if (r.favorited !== undefined) setOn(r.favorited); }); }}>
      {icon}
    </button>
  );
}
