import { and, eq, sql } from 'drizzle-orm';
import type { MyReview, ReviewInput, Role, VendorReview } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { reviews } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { needsReview } from '../../lib/moderation';
import { assertNotBlocked, publicVendor } from './guards';

type ReviewRow = typeof reviews.$inferSelect;

export function toMyReview(r: Pick<ReviewRow, 'rating' | 'body' | 'moderation' | 'updatedAt'>): MyReview {
  return { rating: r.rating, body: r.body, moderation: r.moderation, updatedAt: r.updatedAt.toISOString() };
}

/** One review per customer per vendor; posting again edits it. */
export async function upsertReview(ctx: AppContext, user: { id: string; role: Role }, vendorId: string, input: ReviewInput) {
  if (user.role !== 'customer') throw new ApiError('forbidden');
  const vendor = await publicVendor(ctx, vendorId);
  await assertNotBlocked(ctx, vendor.userId, user.id);
  const body = (input.body ?? '').trim();
  const moderation = ctx.config.reviewPremoderation || needsReview(body) ? 'pending' : 'approved';
  const values = { rating: input.rating, body, moderation, updatedAt: new Date() } as const;
  const [row] = await ctx.db
    .insert(reviews)
    .values({ vendorId, userId: user.id, ...values })
    .onConflictDoUpdate({ target: [reviews.vendorId, reviews.userId], set: values })
    .returning();
  return toMyReview(row!);
}

export async function deleteReview(ctx: AppContext, userId: string, vendorId: string) {
  await ctx.db.delete(reviews).where(and(eq(reviews.vendorId, vendorId), eq(reviews.userId, userId)));
}

export async function getOwnReview(ctx: AppContext, userId: string, vendorId: string) {
  const [row] = await ctx.db.select().from(reviews).where(and(eq(reviews.vendorId, vendorId), eq(reviews.userId, userId)));
  return row ? toMyReview(row) : null;
}

/** The vendor's dashboard list: approved reviews, whether they replied, and whether they blocked the author. */
export async function listVendorReviews(ctx: AppContext, vendorId: string, vendorUserId: string): Promise<VendorReview[]> {
  const rows = await ctx.db.execute<{
    id: string;
    rating: number;
    body: string;
    author: string | null;
    created_at: Date;
    vendor_reply: string | null;
    vendor_reply_at: Date | null;
    blocked: boolean;
  }>(sql`
    SELECT r.id, r.rating, r.body, u.display_name AS author, r.created_at, r.vendor_reply, r.vendor_reply_at,
      EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_user_id = ${vendorUserId} AND b.blocked_user_id = r.user_id) AS blocked
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.vendor_id = ${vendorId} AND r.moderation = 'approved'
    ORDER BY r.created_at DESC LIMIT 200`);
  return rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating),
    body: r.body,
    authorName: r.author,
    createdAt: new Date(r.created_at).toISOString(),
    vendorReply: r.vendor_reply,
    vendorReplyAt: r.vendor_reply_at ? new Date(r.vendor_reply_at).toISOString() : null,
    authorBlocked: Boolean(r.blocked),
  }));
}

export async function setReply(ctx: AppContext, vendorId: string, reviewId: string, body: string | null) {
  const updated = await ctx.db
    .update(reviews)
    .set({ vendorReply: body, vendorReplyAt: body ? new Date() : null })
    .where(and(eq(reviews.id, reviewId), eq(reviews.vendorId, vendorId), eq(reviews.moderation, 'approved')))
    .returning({ id: reviews.id });
  if (updated.length === 0) throw new ApiError('not_found');
}

