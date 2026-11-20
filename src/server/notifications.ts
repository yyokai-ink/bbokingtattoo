import { db } from './db';
import { sendEmail } from './email/mailer';
import { createT } from '@/i18n/translate';
import { isLocale, defaultLocale, localeMeta } from '@/i18n/config';
import { formatDateTime } from '@/lib/datetime';

export type NotificationType = 'booking.new' | 'booking.created' | 'booking.confirmed' | 'booking.cancelled' | 'booking.rescheduled' | 'booking.completed'
  | 'billing.activated' | 'billing.upcoming' | 'billing.due' | 'billing.grace' | 'billing.expired' | 'billing.cancelled';
/** For billing types: service = plan name, startsAt = relevant date, name = formatted amount. */
export interface NotificationParams { service: string; startsAt: string; timezone: string; name: string }

/** In-app notification + e-mail (localised to the recipient's language). Failures never break the user's action. */
export async function notify(userId: string, type: NotificationType, params: NotificationParams): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, locale: true } });
    if (!user) return;
    await db.notification.create({ data: { userId, type, channel: 'IN_APP', payload: params as unknown as object, sentAt: new Date() } });
    const locale = isLocale(user.locale) ? user.locale : defaultLocale;
    const t = createT(locale);
    const when = formatDateTime(params.startsAt, localeMeta[locale].intl, params.timezone);
    await sendEmail({ to: user.email, subject: t(`email.${type}.subject`), text: t(`email.${type}.body`, { service: params.service, when, name: params.name }) });
  } catch (err) {
    console.error('[notify] failed', type, err);
  }
}
