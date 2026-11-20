import type { Prisma } from '@prisma/client';

/**
 * What the PUBLIC catalog may show. A profile is public only when it is PUBLISHED, its owner is not blocked
 * and it is covered by a live subscription: its own, or the subscription of a studio it is an ACTIVE member of
 * (studio masters are paid for through studio seats). ACTIVE / GRACE / PAST_DUE keep the profile visible
 * (grace period), CANCELLED / EXPIRED / INCOMPLETE hide it.
 */
const LIVE = ['ACTIVE', 'GRACE', 'PAST_DUE'] as const;

export const publicStudioWhere: Prisma.StudioProfileWhereInput = {
  status: 'PUBLISHED',
  owner: { status: 'ACTIVE' },
  subscriptions: { some: { status: { in: [...LIVE] } } },
};

export const publicMasterWhere: Prisma.MasterProfileWhereInput = {
  status: 'PUBLISHED',
  user: { status: 'ACTIVE' },
  OR: [
    { user: { subscriptions: { some: { status: { in: [...LIVE] } } } } },
    { memberships: { some: { status: 'ACTIVE', studio: publicStudioWhere } } },
  ],
};

/** Can a customer create NEW bookings? GRACE (unpaid) limits features: the profile stays visible but is not bookable. */
const BOOKABLE = ['ACTIVE', 'PAST_DUE'] as const;
export const bookableMasterWhere: Prisma.MasterProfileWhereInput = {
  AND: [publicMasterWhere, { OR: [
    { user: { subscriptions: { some: { status: { in: [...BOOKABLE] } } } } },
    { memberships: { some: { status: 'ACTIVE', studio: { status: 'PUBLISHED', subscriptions: { some: { status: { in: [...BOOKABLE] } } } } } } },
  ] }],
};
