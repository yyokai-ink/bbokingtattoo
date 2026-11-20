import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import type { TFunction } from '@/i18n/translate';

export function Pagination({ page, pageCount, hrefFor, t }: { page: number; pageCount: number; hrefFor: (page: number) => string; t: TFunction }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
      {page > 1 ? <Link href={hrefFor(page - 1)} rel="prev" className={buttonClasses('secondary')}><ChevronLeft className="h-4 w-4" aria-hidden />{t('search.prev')}</Link> : <span />}
      <span className="text-sm text-fg-muted">{t('search.page', { page, pages: pageCount })}</span>
      {page < pageCount ? <Link href={hrefFor(page + 1)} rel="next" className={buttonClasses('secondary')}>{t('search.next')}<ChevronRight className="h-4 w-4" aria-hidden /></Link> : <span />}
    </nav>
  );
}
