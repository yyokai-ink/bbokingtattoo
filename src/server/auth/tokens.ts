import { db } from '../db';
import { newToken, sha256 } from './utils';

export type TokenKind = 'EMAIL_VERIFY' | 'PASSWORD_RESET';
const TTL_MS: Record<TokenKind, number> = { EMAIL_VERIFY: 48 * 3_600_000, PASSWORD_RESET: 60 * 60_000 };

/** Invalidates older unused tokens of the same kind, stores only the hash, returns the raw token (for the e-mail link). */
export async function issueToken(userId: string, type: TokenKind): Promise<string> {
  const raw = newToken();
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type, consumedAt: null }, data: { consumedAt: new Date() } }),
    db.authToken.create({ data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TTL_MS[type]) } }),
  ]);
  return raw;
}

/** Single-use: the conditional UPDATE makes two concurrent requests race safely (only one wins). */
export async function consumeToken(raw: string, type: TokenKind): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const hash = sha256(raw);
  const row = await db.authToken.findUnique({ where: { tokenHash: hash } });
  if (!row || row.type !== type || row.consumedAt || row.expiresAt < new Date()) return null;
  const { count } = await db.authToken.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return count === 1 ? row.userId : null;
}
