import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { normalizeAppearance, DEFAULT_APPEARANCE } from '@/server/appearance';
import { safePath, UPLOAD_ROOT } from '@/server/storage/local';
import { buildObjectKey } from '@/server/storage/types';

describe('site appearance settings', () => {
  it('accepts own /media files and https URLs, rejects javascript:/data:/http URLs', () => {
    expect(normalizeAppearance({ heroKind: 'video', heroUrl: '/media/site/media/a.mp4' }).heroKind).toBe('video');
    expect(normalizeAppearance({ heroKind: 'image', heroUrl: 'https://cdn.example.com/a.jpg' }).heroUrl).toBe('https://cdn.example.com/a.jpg');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://insecure.example.com/a.jpg', '//evil.com/a.jpg']) {
      const a = normalizeAppearance({ heroKind: 'image', heroUrl: bad });
      expect(a.heroUrl).toBe(null);
      expect(a.heroKind).toBe('none');
    }
  });
  it('clamps overlay, keeps only 2-letter locale keys and falls back to defaults', () => {
    expect(normalizeAppearance({ heroOverlay: 500 }).heroOverlay).toBe(80);
    expect(normalizeAppearance({ heroOverlay: -5 }).heroOverlay).toBe(0);
    expect(normalizeAppearance({ heroTitle: { uk: 'Привіт', '../x': 'bad', en: 5 } }).heroTitle).toEqual({ uk: 'Привіт' });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance('garbage')).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('local storage paths', () => {
  it('stays inside the upload root (no traversal)', () => {
    expect(safePath('portfolio/u1/a.jpg')).toBe(path.join(UPLOAD_ROOT, 'portfolio/u1/a.jpg'));
    for (const bad of ['../etc/passwd', 'a/../../b', '/abs/path', 'a//b', 'a/b c.jpg', 'a\\b.jpg', '', '.hidden/x']) expect(safePath(bad)).toBe(null);
  });
  it('builds server-side object keys with a sanitised extension', () => {
    expect(buildObjectKey('portfolio', 'u1', 'id1', 'JPG')).toBe('portfolio/u1/id1.jpg');
    expect(buildObjectKey('site', 'media', 'id', 'mp4/../x')).toBe('site/media/id.mp4x');
  });
});
