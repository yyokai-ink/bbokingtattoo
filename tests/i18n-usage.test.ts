import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dictionaries, type Messages } from '@/i18n/dictionaries';
import { locales } from '@/i18n/config';

const ROOT = path.join(__dirname, '../src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const has = (d: Messages, key: string) => { let n: string | Messages | undefined = d; for (const k of key.split('.')) { if (typeof n !== 'object' || n === null) return false; n = n[k]; } return n !== undefined; };

describe('translation keys used in code exist in every catalog', () => {
  const used = new Set<string>();
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
  }
  it('finds keys', () => expect(used.size).toBeGreaterThan(50));
  for (const l of locales) {
    it(`${l}: no missing keys`, () => {
      const plural = (k: string) => ['one', 'few', 'many', 'other'].some((s) => has(dictionaries[l], `${k}.${s}`));
      expect([...used].filter((k) => !has(dictionaries[l], k) && !plural(k)).sort()).toEqual([]);
    });
  }
});
