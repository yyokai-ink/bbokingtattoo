import { db } from '../db';

/** Rating = average of PUBLISHED reviews. Called by the moderation flow (Stage 4) whenever a review's status changes. */
export async function recomputeRatings(masterId: string, studioId?: string | null): Promise<void> {
  const m = await db.review.aggregate({ where: { masterId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: true });
  await db.masterProfile.update({ where: { id: masterId }, data: { ratingAvg: m._avg.rating ?? 0, ratingCount: m._count } });
  if (studioId) {
    const s = await db.review.aggregate({ where: { studioId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: true });
    await db.studioProfile.update({ where: { id: studioId }, data: { ratingAvg: s._avg.rating ?? 0, ratingCount: s._count } });
  }
}
