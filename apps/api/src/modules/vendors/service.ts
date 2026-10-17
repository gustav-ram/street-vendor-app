import { sql } from 'drizzle-orm';
import type { VendorProfile } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { ApiError } from '../../lib/errors';
import { nextOccurrence } from '../search/service';
import { iso, minuteIso, point, summaryColumns, type SummaryRow, toSummary } from './summary';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public profile. Hidden (vacation mode) vendors don't exist as far as the public is concerned. */
export async function getPublicProfile(ctx: AppContext, vendorId: string): Promise<VendorProfile> {
  if (!UUID_RE.test(vendorId)) throw new ApiError('not_found');
  const { db } = ctx;

  const [row] = await db.execute<SummaryRow>(sql`
    SELECT ${summaryColumns}, v.description, v.contact_text, v.contact_visible, v.timezone, v.last_live_at
    FROM vendor_profiles v
    WHERE v.id = ${vendorId} AND NOT v.hidden`);
  if (!row) throw new ApiError('not_found');

  const [liveRows, tagRows, menuRows, scheduleRows, upcomingRows, reviewRows] = await Promise.all([
    db.execute(sql`
      SELECT ST_Y(public_point::geometry) AS lat, ST_X(public_point::geometry) AS lng, precision,
        started_at, greatest(last_heartbeat_at, coalesce(last_confirmed_at, last_heartbeat_at)) AS confirmed_at, ends_at
      FROM vendor_live_sessions
      WHERE vendor_id = ${vendorId} AND expires_at > now() AND ends_at > now()`),
    db.execute(sql`
      SELECT t.slug, t.name_en, t.name_es FROM vendor_tags vt JOIN tags t ON t.id = vt.tag_id
      WHERE vt.vendor_id = ${vendorId} ORDER BY t.name_en`),
    db.execute(sql`
      SELECT id, name, description, price_cents, sold_out FROM menu_items
      WHERE vendor_id = ${vendorId} ORDER BY sort_order, created_at`),
    db.execute(sql`
      SELECT id, weekday, start_time, end_time, place_label, precision,
        ST_Y(public_point::geometry) AS lat, ST_X(public_point::geometry) AS lng
      FROM schedule_entries
      WHERE vendor_id = ${vendorId} AND published ORDER BY weekday, start_time`),
    db.execute(sql`
      SELECT id, starts_at, ends_at, place_label, note, precision,
        ST_Y(public_point::geometry) AS lat, ST_X(public_point::geometry) AS lng
      FROM upcoming_spot_posts
      WHERE vendor_id = ${vendorId} AND ends_at > now() ORDER BY starts_at LIMIT 10`),
    db.execute(sql`
      SELECT r.id, r.rating, r.body, r.created_at, r.vendor_reply, r.vendor_reply_at, u.display_name AS author
      FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.vendor_id = ${vendorId} AND r.moderation = 'approved'
      ORDER BY r.created_at DESC LIMIT 10`),
  ]);

  const live = liveRows[0];
  const timezone = String(row.timezone);
  const now = new Date();

  const scheduledSpots = scheduleRows.flatMap((s) => {
    if (s.lat === null) return [];
    const next = nextOccurrence(now, Number(s.weekday), String(s.start_time), String(s.end_time), timezone);
    // While they're live, a schedule slot that's already running is old news.
    if (live && next && next.start <= now) return [];
    return next
      ? [{
          id: String(s.id),
          kind: 'schedule' as const,
          startsAt: next.start.toISOString(),
          endsAt: next.end.toISOString(),
          placeLabel: (s.place_label as string | null) ?? null,
          note: null,
          location: point(s.lat, s.lng, s.precision),
        }]
      : [];
  });

  return {
    ...toSummary(row),
    description: String(row.description),
    tags: tagRows.map((t) => ({ slug: String(t.slug), nameEn: String(t.name_en), nameEs: String(t.name_es) })),
    contact: row.contact_visible ? ((row.contact_text as string | null) ?? null) : null,
    timezone,
    live: live
      ? {
          location: point(live.lat, live.lng, live.precision),
          since: minuteIso(live.started_at),
          lastConfirmedAt: minuteIso(live.confirmed_at),
          endsAt: iso(live.ends_at),
        }
      : null,
    lastActiveAt: row.last_live_at ? iso(row.last_live_at) : null,
    menu: menuRows.map((m) => ({
      id: String(m.id),
      name: String(m.name),
      description: String(m.description),
      priceCents: Number(m.price_cents),
      soldOut: Boolean(m.sold_out),
    })),
    schedule: scheduleRows.map((s) => ({
      weekday: Number(s.weekday),
      startTime: String(s.start_time),
      endTime: String(s.end_time),
      placeLabel: (s.place_label as string | null) ?? null,
      location: s.lat === null ? null : point(s.lat, s.lng, s.precision),
    })),
    upcoming: [
      ...upcomingRows.map((u) => ({
        id: String(u.id),
        kind: 'post' as const,
        startsAt: iso(u.starts_at),
        endsAt: iso(u.ends_at),
        placeLabel: (u.place_label as string | null) ?? null,
        note: (u.note as string | null) ?? null,
        location: point(u.lat, u.lng, u.precision),
      })),
      ...scheduledSpots,
    ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    reviews: reviewRows.map((r) => ({
      id: String(r.id),
      rating: Number(r.rating),
      body: String(r.body),
      authorName: (r.author as string | null) ?? null,
      createdAt: iso(r.created_at),
      vendorReply: (r.vendor_reply as string | null) ?? null,
      vendorReplyAt: r.vendor_reply_at ? iso(r.vendor_reply_at) : null,
    })),
  };
}
