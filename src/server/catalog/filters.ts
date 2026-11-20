import type { Prisma } from '@prisma/client';
import type { SearchFilters } from './params';
import { publicMasterWhere, publicStudioWhere } from './visibility';

/** Service-level conditions shared by master filters, price lookups and slot lookups. */
export function serviceWhere(f: Pick<SearchFilters, 'category' | 'sub' | 'priceMin' | 'priceMax'>, withPrice = true): Prisma.ServiceWhereInput {
  const priceRange: Prisma.IntFilter = {};
  if (f.priceMin !== undefined) priceRange.gte = f.priceMin * 100;
  if (f.priceMax !== undefined) priceRange.lte = f.priceMax * 100;
  const hasRange = Object.keys(priceRange).length > 0;
  return {
    isActive: true,
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.sub ? { subcategory: { slug: f.sub } } : {}),
    ...(withPrice ? { prices: { some: { currency: 'UAH', ...(hasRange ? { amountMinor: priceRange } : {}) } } } : {}),
  };
}

export function buildMasterWhere(f: SearchFilters, now = new Date()): Prisma.MasterProfileWhereInput {
  const and: Prisma.MasterProfileWhereInput[] = [publicMasterWhere];
  if (f.city) and.push({ city: { slug: f.city, ...(f.country ? { country: { slug: f.country } } : {}) } });
  else if (f.country) and.push({ city: { country: { slug: f.country } } });
  if (f.district) {
    // own address (independent masters) OR the address of an active studio they work in
    and.push({ OR: [
      { address: { district: { slug: f.district } } },
      { memberships: { some: { status: 'ACTIVE', studio: { address: { district: { slug: f.district } } } } } },
    ] });
  }
  if (f.category) and.push({ categories: { some: { category: { slug: f.category } } } });
  const needsService = f.sub || f.priceMin !== undefined || f.priceMax !== undefined || f.category;
  if (needsService) and.push({ services: { some: serviceWhere(f) } });
  if (f.rating) and.push({ ratingAvg: { gte: f.rating } });
  if (f.experience) and.push({ experienceSince: { lte: now.getUTCFullYear() - f.experience } });
  if (f.gender) and.push({ showGender: true, gender: f.gender }); // only masters who chose to show gender
  return { AND: and };
}

export function buildStudioWhere(f: SearchFilters): Prisma.StudioProfileWhereInput {
  const and: Prisma.StudioProfileWhereInput[] = [publicStudioWhere];
  if (f.city) and.push({ city: { slug: f.city, ...(f.country ? { country: { slug: f.country } } : {}) } });
  else if (f.country) and.push({ city: { country: { slug: f.country } } });
  if (f.district) and.push({ address: { district: { slug: f.district } } });
  if (f.category) and.push({ categories: { some: { category: { slug: f.category } } } });
  if (f.sub || f.priceMin !== undefined || f.priceMax !== undefined) {
    and.push({ members: { some: { status: 'ACTIVE', master: { is: { services: { some: serviceWhere(f) } } } } } });
  }
  if (f.rating) and.push({ ratingAvg: { gte: f.rating } });
  return { AND: and };
}
