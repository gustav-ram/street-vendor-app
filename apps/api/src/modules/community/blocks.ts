import { createHmac } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Block, BlockInput } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { userBlocks } from '../../db/schema';
import { ApiError } from '../../lib/errors';

/**
 * Vendors block the *author* of a review or customer photo without ever
 * learning who that is: blocks are listed by display name with an opaque
 * handle, never an account id.
 */
function handle(ctx: AppContext, blocker: string, blocked: string) {
  return createHmac('sha256', ctx.config.jwtSecret).update(`block|${blocker}|${blocked}`).digest('base64url').slice(0, 24);
}

export async function blockAuthor(ctx: AppContext, vendorId: string, vendorUserId: string, input: BlockInput) {
  const [row] =
    'reviewId' in input
      ? await ctx.db.execute<{ user_id: string }>(sql`SELECT user_id FROM reviews WHERE id = ${input.reviewId} AND vendor_id = ${vendorId}`)
      : await ctx.db.execute<{ user_id: string }>(sql`
          SELECT uploader_user_id AS user_id FROM photos
          WHERE id = ${input.photoId} AND vendor_id = ${vendorId} AND source = 'customer'`);
  if (!row?.user_id) throw new ApiError('not_found');
  if (row.user_id === vendorUserId) throw new ApiError('forbidden');
  await ctx.db.insert(userBlocks).values({ blockerUserId: vendorUserId, blockedUserId: row.user_id }).onConflictDoNothing();
}

export async function listBlocks(ctx: AppContext, vendorUserId: string): Promise<Block[]> {
  const rows = await ctx.db.execute<{ blocked_user_id: string; display_name: string | null; created_at: Date }>(sql`
    SELECT b.blocked_user_id, u.display_name, b.created_at
    FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id
    WHERE b.blocker_user_id = ${vendorUserId} ORDER BY b.created_at DESC`);
  return rows.map((r) => ({
    id: handle(ctx, vendorUserId, r.blocked_user_id),
    name: r.display_name,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function unblock(ctx: AppContext, vendorUserId: string, blockId: string) {
  const rows = await ctx.db
    .select({ blocked: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, vendorUserId));
  const match = rows.find((r) => handle(ctx, vendorUserId, r.blocked) === blockId);
  if (!match) throw new ApiError('not_found');
  await ctx.db.delete(userBlocks).where(and(eq(userBlocks.blockerUserId, vendorUserId), eq(userBlocks.blockedUserId, match.blocked)));
}
