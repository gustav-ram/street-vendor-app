import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../../app';
import { userBlocks, vendorProfiles } from '../../db/schema';
import { ApiError } from '../../lib/errors';

/** A vendor the public can see (vacation-mode vendors don't exist, as far as the public knows). */
export async function publicVendor(ctx: AppContext, vendorId: string) {
  const [v] = await ctx.db
    .select({ id: vendorProfiles.id, userId: vendorProfiles.userId, timezone: vendorProfiles.timezone })
    .from(vendorProfiles)
    .where(and(eq(vendorProfiles.id, vendorId), eq(vendorProfiles.hidden, false)));
  if (!v) throw new ApiError('not_found');
  return v;
}

export async function isBlocked(ctx: AppContext, vendorUserId: string, userId: string) {
  const [row] = await ctx.db
    .select({ x: userBlocks.blockerUserId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerUserId, vendorUserId), eq(userBlocks.blockedUserId, userId)));
  return Boolean(row);
}

/** Blocked people can't review, add photos to, or confirm that vendor. They're told only "forbidden". */
export async function assertNotBlocked(ctx: AppContext, vendorUserId: string, userId: string) {
  if (await isBlocked(ctx, vendorUserId, userId)) throw new ApiError('forbidden');
}
