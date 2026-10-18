import { and, eq, sql } from 'drizzle-orm';
import type { ReportInput, ReportTarget } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { reports } from '../../db/schema';
import { ApiError } from '../../lib/errors';

const TARGET_TABLE: Record<ReportTarget, ReturnType<typeof sql.raw>> = {
  vendor: sql.raw('vendor_profiles'),
  photo: sql.raw('photos'),
  review: sql.raw('reviews'),
  status_post: sql.raw('vendor_status_posts'),
  upcoming_post: sql.raw('upcoming_spot_posts'),
};

/** Anyone signed in can report. A repeat report of the same thing by the same person is folded into the first. */
export async function createReport(ctx: AppContext, reporterUserId: string, input: ReportInput) {
  const [target] = await ctx.db.execute(sql`SELECT 1 FROM ${TARGET_TABLE[input.targetType]} WHERE id = ${input.targetId}`);
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
    });
  }
  return { status: 'received' as const };
}
