import { sql } from 'drizzle-orm';
import type { AdminVendor, VerificationDecision, VerificationProgress, VerificationStatus } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { ApiError } from '../../lib/errors';

/**
 * "Community Verified" (PLAN.md §6.6). Earned through trust signals only:
 *
 * 1. live on N distinct days (a counter, never a list of days);
 * 2. enough counted "Still here" confirmations, from enough different
 *    people, on enough different days, within the window;
 * 3. enough approved reviews with a healthy average;
 * 4. no report upheld against the vendor recently. Open reports don't
 *    count, so mass-reporting can't block the badge.
 *
 * Once all four are met the badge is earned and kept (a vendor taking a
 * month off doesn't lose it). It's lost when a report against the vendor
 * is upheld, and an admin can revoke it; a revoke holds until an admin
 * restores it. The badge never changes search ranking.
 */

interface Row {
  status: VerificationStatus;
  verified_at: string | Date | null;
  revoked_reason: string | null;
  live_days: number;
  confirmations_met_at: string | Date | null;
  confirmations: number;
  confirmers: number;
  confirmation_days: number;
  reviews: number;
  review_avg: string | null;
  upheld: number;
  [key: string]: unknown;
}

async function load(ctx: AppContext, vendorId: string): Promise<Row> {
  const c = ctx.config.badge;
  await ctx.db.execute(sql`INSERT INTO verification_progress (vendor_id) VALUES (${vendorId}) ON CONFLICT DO NOTHING`);
  const [row] = await ctx.db.execute<Row>(sql`
    SELECT vp.status, vp.verified_at, vp.revoked_reason, vp.live_days, vp.confirmations_met_at,
      sh.confirmations, sh.confirmers, sh.confirmation_days,
      rv.reviews, rv.review_avg, rp.upheld
    FROM verification_progress vp
    CROSS JOIN LATERAL (
      -- Only counted confirmations (at most one per person per 7 days). A
      -- person keeps one hash while their earlier rows exist (see still-here.ts).
      SELECT count(*)::int AS confirmations,
             count(DISTINCT confirmer_hash)::int AS confirmers,
             count(DISTINCT local_day)::int AS confirmation_days
      FROM still_here_confirmations
      WHERE vendor_id = vp.vendor_id AND counted
        AND created_at > now() - make_interval(days => ${c.confirmationWindowDays})
    ) sh
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS reviews, round(avg(rating)::numeric, 2) AS review_avg
      FROM reviews WHERE vendor_id = vp.vendor_id AND moderation = 'approved'
    ) rv
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS upheld FROM reports
      WHERE vendor_id = vp.vendor_id AND status = 'upheld'
        AND resolved_at > now() - make_interval(days => ${c.reportWindowDays})
    ) rp
    WHERE vp.vendor_id = ${vendorId}`);
  if (!row) throw new ApiError('not_found');
  return row;
}

function progressOf(ctx: AppContext, r: Row): VerificationProgress {
  const c = ctx.config.badge;
  const average = r.review_avg === null ? null : Number(r.review_avg);
  const confirmationsNow =
    r.confirmations >= c.confirmations && r.confirmers >= c.confirmationAccounts && r.confirmation_days >= c.confirmationDays;
  return {
    status: r.status,
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    revokedReason: r.status === 'revoked' ? r.revoked_reason : null,
    criteria: c,
    progress: {
      liveDays: { count: r.live_days, met: r.live_days >= c.liveDays },
      confirmations: {
        count: r.confirmations,
        accounts: r.confirmers,
        days: r.confirmation_days,
        met: confirmationsNow || r.confirmations_met_at !== null,
      },
      reviews: { count: r.reviews, average, met: r.reviews >= c.reviews && average !== null && average >= c.reviewAverage },
      reports: { upheld: r.upheld, met: r.upheld === 0 },
    },
  };
}

/**
 * Re-checks the badge after anything that can change it: a counted
 * confirmation, a new day live, an approved review, an upheld report, or
 * the vendor opening their progress. Returns the vendor's progress.
 */
export async function refreshVerification(ctx: AppContext, vendorId: string): Promise<VerificationProgress> {
  const row = await load(ctx, vendorId);
  const p = progressOf(ctx, row);
  const confirmationsReachedNow = p.progress.confirmations.met && row.confirmations_met_at === null;
  const allMet = Object.values(p.progress).every((step) => step.met);

  let status = row.status;
  if (status === 'none' && allMet) status = 'verified';
  // Trust broken: an upheld report takes the badge away (it can be earned again).
  else if (status === 'verified' && !p.progress.reports.met) status = 'none';

  if (status !== row.status || confirmationsReachedNow) {
    const [updated] = await ctx.db.execute<{ verified_at: string | Date | null }>(sql`
      UPDATE verification_progress SET
        status = ${status},
        verified_at = CASE WHEN ${status}::text = 'verified' THEN coalesce(verified_at, now()) ELSE NULL END,
        confirmations_met_at = CASE WHEN ${p.progress.confirmations.met}::boolean THEN coalesce(confirmations_met_at, now()) ELSE confirmations_met_at END,
        updated_at = now()
      WHERE vendor_id = ${vendorId} AND status = ${row.status}
      RETURNING verified_at`);
    if (updated) {
      p.status = status;
      p.verifiedAt = updated.verified_at ? new Date(updated.verified_at).toISOString() : null;
    }
  }
  return p;
}

// ---------------------------------------------------------------- admin

export async function listVendorsForAdmin(ctx: AppContext, q?: string, status?: VerificationStatus): Promise<AdminVendor[]> {
  const name = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = await ctx.db.execute<{
    id: string;
    display_name: string;
    status: VerificationStatus | null;
    verified_at: Date | null;
    revoked_at: Date | null;
    revoked_reason: string | null;
    live_days: number | null;
  }>(sql`
    SELECT v.id, v.display_name, vp.status, vp.verified_at, vp.revoked_at, vp.revoked_reason, vp.live_days
    FROM vendor_profiles v LEFT JOIN verification_progress vp ON vp.vendor_id = v.id
    WHERE ${name ? sql`v.display_name ILIKE ${name}` : sql`TRUE`}
      AND ${status ? sql`coalesce(vp.status, 'none') = ${status}` : name ? sql`TRUE` : sql`vp.status IN ('verified', 'revoked')`}
    ORDER BY v.display_name LIMIT 50`);
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    status: r.status ?? 'none',
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    revokedReason: r.revoked_reason,
    liveDays: Number(r.live_days ?? 0),
  }));
}

/** Revoke holds until an admin restores; restoring re-checks the criteria. */
export async function decideVerification(ctx: AppContext, vendorId: string, decision: VerificationDecision) {
  const [vendor] = await ctx.db.execute(sql`SELECT 1 FROM vendor_profiles WHERE id = ${vendorId}`);
  if (!vendor) throw new ApiError('not_found');
  await ctx.db.execute(sql`INSERT INTO verification_progress (vendor_id) VALUES (${vendorId}) ON CONFLICT DO NOTHING`);
  if (decision.action === 'revoke') {
    await ctx.db.execute(sql`
      UPDATE verification_progress
      SET status = 'revoked', verified_at = NULL, revoked_at = now(), revoked_reason = ${decision.reason}, updated_at = now()
      WHERE vendor_id = ${vendorId}`);
  } else {
    await ctx.db.execute(sql`
      UPDATE verification_progress
      SET status = 'none', revoked_at = NULL, revoked_reason = NULL, updated_at = now()
      WHERE vendor_id = ${vendorId} AND status = 'revoked'`);
  }
  return refreshVerification(ctx, vendorId);
}
