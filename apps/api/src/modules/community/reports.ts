import { and, eq, sql } from 'drizzle-orm';
import type { ReportInput, ReportTarget } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { reports } from '../../db/schema';
import { ApiError } from '../../lib/errors';

/**
 * Finds the target, and the vendor it counts against for the badge: the
 * vendor themselves, their own posts and photos. A customer's review or
 * photo is the customer's doing, so it never counts against the vendor.
 */
const TARGET: Record<ReportTarget, (id: string) => ReturnType<typeof sql>> = {
  vendor: (id) => sql`SELECT id AS vendor_id FROM vendor_profiles WHERE id = ${id}`,
  photo: (id) => sql`SELECT CASE WHEN source = 'vendor' THEN vendor_id END AS vendor_id FROM photos WHERE id = ${id}`,
  review: (id) => sql`SELECT NULL::uuid AS vendor_id FROM reviews WHERE id = ${id}`,
  status_post: (id) => sql`SELECT vendor_id FROM vendor_status_posts WHERE id = ${id}`,
  upcoming_post: (id) => sql`SELECT vendor_id FROM upcoming_spot_posts WHERE id = ${id}`,
};

/** Anyone signed in can report. A repeat report of the same thing by the same person is folded into the first. */
export async function createReport(ctx: AppContext, reporterUserId: string, input: ReportInput) {
  const [target] = await ctx.db.execute<{ vendor_id: string | null }>(TARGET[input.targetType](input.targetId));
  if (!target) throw new ApiError('not_found');
  const [open] = await ctx.db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterUserId, reporterUserId),
        eq(reports.targetType, input.targetType),
        eq(reports.targetId, input.targetId),
        eq(reports.status, 'open'),
      ),
    );
  if (!open) {
    await ctx.db.insert(reports).values({
      reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details?.trim() || null,
      vendorId: target.vendor_id,
    });
  }
  return { status: 'received' as const };
}
