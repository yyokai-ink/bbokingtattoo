'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../db';
import { getEnv } from '../env';
import { hashPassword, verifyPassword, checkPasswordStrength } from '../auth/password';
import { createSession, destroySession, getCurrentUser } from '../auth/session';
import { consumeToken, issueToken } from '../auth/tokens';
import { clientIp, normalizeEmail, safeRedirectPath } from '../auth/utils';
import type { FormState } from '../auth/form-state';
import { createRateLimiter } from '../security/rate-limit';
import { sendEmail } from '../email/mailer';
import { createT } from '@/i18n/translate';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { localizePath } from '@/i18n/routing';

const registerLimit = createRateLimiter({ limit: 10, windowMs: 3_600_000 });
const loginIpLimit = createRateLimiter({ limit: 30, windowMs: 15 * 60_000 });
const loginEmailLimit = createRateLimiter({ limit: 8, windowMs: 15 * 60_000 });
const mailLimit = createRateLimiter({ limit: 5, windowMs: 3_600_000 });
// valid scrypt hash of a random string: lets login spend the same time for unknown e-mails (no user enumeration by timing)
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const ip = () => { const h = headers(); return clientIp(h.get('x-forwarded-for'), h.get('x-real-ip')); };
const localeOf = (fd: FormData): Locale => { const v = fd.get('locale')?.toString(); return isLocale(v) ? v : defaultLocale; };
const str = (fd: FormData, k: string) => fd.get(k)?.toString() ?? '';

const email = z.string().trim().toLowerCase().email().max(254);
const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), email,
  phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/).optional(), password: z.string().max(128),
});

async function sendVerification(userId: string, to: string, name: string, locale: Locale) {
  const token = await issueToken(userId, 'EMAIL_VERIFY');
  const t = createT(locale);
  await sendEmail({ to, subject: t('email.verify.subject'), text: t('email.verify.body', { name, link: `${getEnv().APP_URL}${localizePath(locale, '/verify')}?token=${token}` }) });
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!registerLimit.check(`reg:${ip()}`).ok) return { error: 'rateLimited' };
  const parsed = registerSchema.safeParse({ firstName: str(fd, 'firstName'), lastName: str(fd, 'lastName'), email: str(fd, 'email'), phone: str(fd, 'phone') || undefined, password: str(fd, 'password') });
  if (!parsed.success) return { error: 'invalidInput' };
  if (checkPasswordStrength(parsed.data.password).length > 0) return { error: 'weakPassword' };
  if (str(fd, 'terms') !== 'on') return { error: 'termsRequired' };

  const addr = normalizeEmail(parsed.data.email);
  if (await db.user.findUnique({ where: { email: addr }, select: { id: true } })) return { error: 'emailTaken' }; // acceptable trade-off for UX; login/reset stay non-enumerating
  const user = await db.user.create({ data: {
    email: addr, firstName: parsed.data.firstName, lastName: parsed.data.lastName, phone: parsed.data.phone || null, locale,
    passwordHash: await hashPassword(parsed.data.password), termsAcceptedAt: new Date(), roles: { create: { role: 'CLIENT' } },
  } });
  await sendVerification(user.id, addr, user.firstName, locale);
  await createSession(user.id);
  redirect(safeRedirectPath(str(fd, 'next'), localizePath(locale, '/account')));
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  const parsedEmail = email.safeParse(str(fd, 'email'));
  const password = str(fd, 'password');
  if (!parsedEmail.success || !password || password.length > 128) return { error: 'invalidCredentials' };
  if (!loginIpLimit.check(`login-ip:${ip()}`).ok || !loginEmailLimit.check(`login:${parsedEmail.data}`).ok) return { error: 'rateLimited' };

  const user = await db.user.findUnique({ where: { email: normalizeEmail(parsedEmail.data) }, include: { roles: true } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok || user.status !== 'ACTIVE') return { error: 'invalidCredentials' }; // same answer for unknown / wrong / blocked
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  const home = user.roles.some((r) => r.role === 'SUPER_ADMIN') ? '/account' : user.roles.some((r) => r.role === 'MASTER') ? '/dashboard' : '/account';
  redirect(safeRedirectPath(str(fd, 'next'), localizePath(locale, home)));
}

export async function logoutAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  await destroySession();
  redirect(localizePath(locale, '/'));
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  const parsed = email.safeParse(str(fd, 'email'));
  if (!parsed.success) return { error: 'invalidInput' };
  if (!mailLimit.check(`forgot:${ip()}`).ok || !mailLimit.check(`forgot:${parsed.data}`).ok) return { error: 'rateLimited' };
  const user = await db.user.findUnique({ where: { email: normalizeEmail(parsed.data) } });
  if (user && user.status === 'ACTIVE') {
    const token = await issueToken(user.id, 'PASSWORD_RESET');
    const t = createT(isLocale(user.locale) ? user.locale : locale);
    await sendEmail({ to: user.email, subject: t('email.reset.subject'), text: t('email.reset.body', { name: user.firstName, link: `${getEnv().APP_URL}${localizePath(locale, '/reset-password')}?token=${token}` }) });
  }
  return { ok: true, message: 'resetSent' }; // identical response whether or not the account exists
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  const password = str(fd, 'password');
  if (checkPasswordStrength(password).length > 0 || password.length > 128) return { error: 'weakPassword' };
  const userId = await consumeToken(str(fd, 'token'), 'PASSWORD_RESET');
  if (!userId) return { error: 'tokenInvalid' };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } }),
    db.session.deleteMany({ where: { userId } }), // sign out everywhere after a password change
  ]);
  redirect(`${localizePath(locale, '/login')}?reset=1`);
}

export async function verifyEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const userId = await consumeToken(str(fd, 'token'), 'EMAIL_VERIFY');
  if (!userId) return { error: 'tokenInvalid' };
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return { ok: true, message: 'verified' };
}

export async function resendVerificationAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me || me.emailVerified) return { error: 'invalidInput' };
  if (!mailLimit.check(`resend:${me.id}`).ok) return { error: 'rateLimited' };
  await sendVerification(me.id, me.email, me.firstName, localeOf(fd));
  return { ok: true, message: 'verificationSent' };
}
