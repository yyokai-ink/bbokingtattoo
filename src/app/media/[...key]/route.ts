import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { safePath } from '@/server/storage/local';

export const dynamic = 'force-dynamic';
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm' };

/** Serves locally stored uploads with Range support (required by Safari/iOS for <video>). Only whitelisted types, never directory listings. */
export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  const file = safePath(params.key.join('/'));
  const type = TYPES[file?.split('.').pop()?.toLowerCase() ?? ''];
  if (!file || !type) return new Response('Not found', { status: 404 });
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(info.size) } });
}
