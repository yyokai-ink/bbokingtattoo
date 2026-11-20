import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageProvider } from './types';

let cached: StorageProvider | undefined;

/** S3 when STORAGE_BUCKET + keys + STORAGE_PUBLIC_BASE_URL are set, otherwise local disk (`uploads/`). */
export function getStorage(): StorageProvider {
  if (cached) return cached;
  const { STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_PUBLIC_BASE_URL } = process.env;
  cached = STORAGE_BUCKET && STORAGE_ACCESS_KEY_ID && STORAGE_SECRET_ACCESS_KEY && STORAGE_PUBLIC_BASE_URL
    ? new S3Storage(STORAGE_BUCKET, STORAGE_PUBLIC_BASE_URL) : new LocalStorage();
  return cached;
}
