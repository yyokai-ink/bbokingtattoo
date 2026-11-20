'use client';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';
import { markNotificationsReadAction } from '@/server/actions/account';

export function MarkRead() {
  const t = useT();
  return <Button variant="ghost" className="min-h-9" onClick={() => void markNotificationsReadAction()}>{t('account.markRead')}</Button>;
}
