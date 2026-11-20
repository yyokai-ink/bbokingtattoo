import { Star } from 'lucide-react';
import type { TFunction } from '@/i18n/translate';

export function Rating({ value, count, t }: { value: number; count: number; t: TFunction }) {
  if (count === 0) return <span className="text-sm text-fg-muted">{t('card.noReviews')}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" aria-label={t('card.rating', { value: value.toFixed(1) })}>
      <Star className="h-4 w-4 fill-warning text-warning" aria-hidden />
      <span className="font-bold">{value.toFixed(1)}</span>
      <span className="text-fg-muted">· {t('card.reviews', { count })}</span>
    </span>
  );
}
