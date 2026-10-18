import { and, desc, eq, sql } from 'drizzle-orm';
import type { AdminReport, ModerationQueue, ReportStatus, ReportTarget } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { photos, reports, reviews, upcomingSpotPosts, vendorStatusPosts } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { deletePhotos } from '../photos/service';

const iso = (d: unknown) => new Date(d as string).toISOString();

export async function moderationQueue(ctx: AppContext): Promise<ModerationQueue> {
  const [photoRows, reviewRows] = await Promise.all([
    ctx.db.execute<{ id: string; vendor_id: string; vendor_name: string; caption: string | null; width: number; height: number; created_at: Date }>(sql`
      SELECT p.id, p.vendor_id, v.display_name AS vendor_name, p.caption, p.width, p.height, p.created_at
      FROM photos p JOIN vendor_profiles v ON v.id = p.vendor_id
      WHERE p.moderation = 'pending' ORDER BY p.created_at LIMIT 100`),
    ctx.db.execute<{ id: string; vendor_id: string; vendor_name: string; rating: number; body: string; author: string | null; created_at: Date }>(sql`
      SELECT r.id, r.vendor_id, v.display_name AS vendor_name, r.rating, r.body, u.display_name AS author, r.created_at
      FROM reviews r JOIN vendor_profiles v ON v.id = r.vendor_id JOIN users u ON u.id = r.user_id
      WHERE r.moderation = 'pending' ORDER BY r.created_at LIMIT 100`),
  ]);
  return {
    photos: photoRows.map((p) => ({
      id: p.id,
      vendorId: p.vendor_id,
      vendorName: p.vendor_name,
      caption: p.caption,
      width: Number(p.width),
      height: Number(p.height),
      createdAt: iso(p.created_at),
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      rating: Number(r.rating),
      body: r.body,
      authorName: r.author,
      createdAt: iso(r.created_at),
    })),
  };
}

/** Rejected photos are deleted outright (they may show faces or plates); rejected reviews stay, unseen, for their author. */
export async function decide(ctx: AppContext, kind: 'photo' | 'review', id: string, decision: 'approved' | 'rejected') {
  if (kind === 'photo') {
    const [row] = await ctx.db.select({ id: photos.id }).from(photos).where(eq(photos.id, id));
    if (!row) throw new ApiError('not_found');
    if (decision === 'rejected') return deletePhotos(ctx, [id]);
    await ctx.db.update(photos).set({ moderation: 'approved' }).where(eq(photos.id, id));
    return;
  }
  const updated = await ctx.db.update(reviews).set({ moderation: decision }).where(eq(reviews.id, id)).returning({ id: reviews.id });
  if (updated.length === 0) throw new ApiError('not_found');
}

async function targetPreview(ctx: AppContext, type: ReportTarget, id: string): Promise<AdminReport['target']> {
  const one = async (q: ReturnType<typeof sql>) => (await ctx.db.execute<Record<string, unknown>>(q))[0];
  const row =
    type === 'vendor'
      ? await one(sql`SELECT v.id AS vendor_id, v.display_name AS vendor_name, v.description AS text, NULL AS photo_id FROM vendor_profiles v WHERE v.id = ${id}`)
      : type === 'photo'
        ? await one(sql`SELECT p.vendor_id, v.display_name AS vendor_name, p.caption AS text, p.id AS photo_id
            FROM photos p JOIN vendor_profiles v ON v.id = p.vendor_id WHERE p.id = ${id}`)
        : type === 'review'
          ? await one(sql`SELECT r.vendor_id, v.display_name AS vendor_name, r.rating || '★ ' || r.body AS text, NULL AS photo_id
              FROM reviews r JOIN vendor_profiles v ON v.id = r.vendor_id WHERE r.id = ${id}`)
          : type === 'status_post'
            ? await one(sql`SELECT s.vendor_id, v.display_name AS vendor_name, s.body AS text, NULL AS photo_id
                FROM vendor_status_posts s JOIN vendor_profiles v ON v.id = s.vendor_id WHERE s.id = ${id}`)
            : await one(sql`SELECT u.vendor_id, v.display_name AS vendor_name, concat_ws(' · ', u.place_label, u.note) AS text, NULL AS photo_id
                FROM upcoming_spot_posts u JOIN vendor_profiles v ON v.id = u.vendor_id WHERE u.id = ${id}`);
  if (!row) return null;
  return {
    vendorId: (row.vendor_id as string | null) ?? null,
    vendorName: (row.vendor_name as string | null) ?? null,
    text: (row.text as string | null) ?? null,
    photoId: (row.photo_id as string | null) ?? null,
  };
}

/** Reports for moderators. The reporter is never shown. */
export async function listReports(ctx: AppContext, status: ReportStatus): Promise<AdminReport[]> {
  const rows = await ctx.db.select().from(reports).where(eq(reports.status, status)).orderBy(desc(reports.createdAt)).limit(100);
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      target: await targetPreview(ctx, r.targetType, r.targetId),
    })),
  );
}

/**
 * Upholding a report takes the reported photo, review or post down, and
 * closes every other open report about the same thing.
 */
export async function decideReport(ctx: AppContext, id: string, status: 'dismissed' | 'upheld' | 'resolved', adminNote?: string) {
  const [report] = await ctx.db.select().from(reports).where(eq(reports.id, id));
  if (!report) throw new ApiError('not_found');
  const sameTarget = and(eq(reports.targetType, report.targetType), eq(reports.targetId, report.targetId), eq(reports.status, 'open'));
  await ctx.db
    .update(reports)
    .set({ status, adminNote: adminNote || null, resolvedAt: new Date() })
    .where(status === 'upheld' ? sql`${reports.id} = ${id} OR (${sameTarget})` : eq(reports.id, id));

  if (status !== 'upheld') return;
  const target = report.targetId;
  switch (report.targetType) {
    case 'photo':
      await deletePhotos(ctx, [target]);
      break;
    case 'review':
      await ctx.db.update(reviews).set({ moderation: 'rejected' }).where(eq(reviews.id, target));
      break;
    case 'status_post':
      await ctx.db.delete(vendorStatusPosts).where(eq(vendorStatusPosts.id, target));
      break;
    case 'upcoming_post':
      await ctx.db.delete(upcomingSpotPosts).where(eq(upcomingSpotPosts.id, target));
      break;
    case 'vendor':
      // Recorded only: an upheld vendor report blocks the badge for 90 days (M5).
      break;
  }
}

