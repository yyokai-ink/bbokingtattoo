import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageProvider, StoredObject } from './types';

/** S3-compatible (AWS S3, Cloudflare R2, MinIO, Backblaze B2). Objects are served from STORAGE_PUBLIC_BASE_URL (CDN or bucket domain). */
export class S3Storage implements StorageProvider {
  private client: S3Client;
  constructor(private readonly bucket: string, private readonly publicBase: string) {
    this.client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto', endpoint: process.env.STORAGE_ENDPOINT || undefined, forcePathStyle: !!process.env.STORAGE_ENDPOINT,
      credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!, secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY! },
    });
  }
  async put({ key, body, mime }: { key: string; body: Uint8Array; mime: string }): Promise<StoredObject> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime, CacheControl: 'public, max-age=31536000, immutable' }));
    return { key, url: this.publicUrl(key), size: body.byteLength, mime };
  }
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
  publicUrl(key: string): string { return `${this.publicBase.replace(/\/$/, '')}/${key}`; }
}
