import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, StoredObject } from './types';

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));

/** Resolves a storage key to a file path INSIDE UPLOAD_ROOT or null (blocks ../ traversal and odd characters). */
export function safePath(key: string): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,200}$/.test(key) || key.includes('..') || key.includes('//')) return null;
  const full = path.resolve(UPLOAD_ROOT, key);
  return full.startsWith(UPLOAD_ROOT + path.sep) ? full : null;
}

/** Disk storage for development and single-server installs (mount `uploads/` as a persistent volume). Served by /media/*. */
export class LocalStorage implements StorageProvider {
  async put({ key, body, mime }: { key: string; body: Uint8Array; mime: string }): Promise<StoredObject> {
    const file = safePath(key);
    if (!file) throw new Error('invalid storage key');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key, url: this.publicUrl(key), size: body.byteLength, mime };
  }
  async delete(key: string): Promise<void> { const f = safePath(key); if (f) await rm(f, { force: true }); }
  publicUrl(key: string): string { return `/media/${key}`; }
}
