'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container py-24 text-center">
      <h1 className="h-section sm:text-3xl">{t('errors.unexpected')}</h1>
      {error.digest && <p className="mt-2 text-xs text-fg-muted">ID: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>{t('common.retry')}</Button>
    </div>
  );
}
