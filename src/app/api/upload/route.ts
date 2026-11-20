import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { can } from '@/server/auth/permissions';
import { validateUpload } from '@/server/security/upload';
import { createRateLimiter } from '@/server/security/rate-limit';
import { getStorage } from '@/server/storage';
import { buildObjectKey } from '@/server/storage/types';

export const dynamic = 'force-dynamic';
const limiter = createRateLimiter({ limit: 40, windowMs: 10 * 60_000 });
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const MAX_REQUEST = 105 * 1024 * 1024;

type Purpose = 'avatar' | 'cover' | 'portfolio' | 'site' | 'studio';
const PURPOSES: Record<Purpose, { scope: 'avatars' | 'covers' | 'portfolio' | 'site' | 'studios'; video: boolean }> = {
  avatar: { scope: 'avatars', video: false }, cover: { scope: 'covers', video: false }, portfolio: { scope: 'portfolio', video: true }, studio: { scope: 'studios', video: false }, site: { scope: 'site', video: true },
};

/** Authenticated, permission-checked, size-limited, content-sniffed upload. The key is generated here — never from client input. */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!limiter.check(`up:${me.id}`).ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_REQUEST) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const purpose = form?.get('purpose')?.toString() as Purpose | undefined;
  if (!(file instanceof File) || !purpose || !(purpose in PURPOSES)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const allowed = purpose === 'site' ? can(me.actor, 'admin:content:manage') : purpose === 'studio' ? me.emailVerified : can(me.actor, 'master:profile:edit', { masterUserId: me.id });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const check = validateUpload({ declaredMime: file.type, size: file.size, head });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
  if (check.kind === 'video' && !PURPOSES[purpose].video) return NextResponse.json({ error: 'unsupported_type' }, { status: 400 });

  const ext = EXT[check.mime]!;
  const key = buildObjectKey(PURPOSES[purpose].scope, purpose === 'site' ? 'media' : me.id, randomUUID(), ext);
  const stored = await getStorage().put({ key, body: new Uint8Array(await file.arrayBuffer()), mime: check.mime });
  return NextResponse.json({ key: stored.key, url: stored.url, kind: check.kind });
}
