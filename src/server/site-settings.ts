import { cache } from 'react';
import { db } from './db';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from './appearance';

export { APPEARANCE_KEY, DEFAULT_APPEARANCE, normalizeAppearance };
export type { Appearance };

export const getAppearance = cache(async (): Promise<Appearance> => {
  try { return normalizeAppearance((await db.siteSetting.findUnique({ where: { key: APPEARANCE_KEY } }))?.value); } catch { return DEFAULT_APPEARANCE; }
});
