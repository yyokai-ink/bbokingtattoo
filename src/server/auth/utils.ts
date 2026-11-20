import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** 256-bit URL-safe random token. Only its sha256 is stored in the DB. */
export const newToken = () => randomBytes(32).toString('base64url');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Open-redirect guard: only same-site relative paths ("/uk/account"), never "//evil.com" or "https://…". */
export function safeRedirectPath(input: string | null | undefined, fallback: string): string {
  if (!input || !input.startsWith('/') || input.startsWith('//') || input.includes('\\') || /[\r\n]/.test(input)) return fallback;
  return input;
}

/** First hop of X-Forwarded-For (set by YOUR reverse proxy) or a fixed bucket. */
export function clientIp(forwardedFor: string | null, realIp: string | null): string {
  return forwardedFor?.split(',')[0]?.trim() || realIp?.trim() || 'unknown';
}

/** Placeholder e-mail for a deleted account: unique, never deliverable (.invalid is reserved by RFC 2606). */
export const anonymizedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;
