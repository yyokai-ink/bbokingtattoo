import { getCategories, getCities } from './reference';
import type { Locale } from '@/i18n/config';

export async function findCity(slug: string, locale: Locale) {
  return (await getCities(locale)).find((c) => c.slug === slug) ?? null;
}
export async function findCategory(slug: string, locale: Locale) {
  return (await getCategories(locale)).find((c) => c.slug === slug) ?? null;
}
