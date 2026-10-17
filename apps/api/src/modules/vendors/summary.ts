import { sql } from 'drizzle-orm';
import type { Category, LanguageCode, PaymentMethod, Precision, VendorSummary } from '@streeteats/shared';

/**
 * Columns every public vendor card needs, for a query where the vendor
 * profile is aliased `v`. Only public fields: never user ids, emails or phones.
 */
export const summaryColumns = sql`
  v.id,
  v.display_name,
  v.categories,
  v.price_level,
  v.payment_methods,
  v.languages,
  (SELECT round(avg(r.rating)::numeric, 1) FROM reviews r WHERE r.vendor_id = v.id AND r.moderation = 'approved') AS rating_avg,
  (SELECT count(*)::int FROM reviews r WHERE r.vendor_id = v.id AND r.moderation = 'approved') AS rating_count,
  EXISTS (SELECT 1 FROM verification_progress vp WHERE vp.vendor_id = v.id AND vp.status = 'verified') AS verified,
  (SELECT sp.body FROM vendor_status_posts sp
     WHERE sp.vendor_id = v.id AND sp.expires_at > now()
     ORDER BY sp.created_at DESC LIMIT 1) AS status`;

export interface SummaryRow {
  id: string;
  display_name: string;
  categories: string[];
  price_level: number | null;
  payment_methods: string[];
  languages: string[];
  rating_avg: string | number | null;
  rating_count: number;
  verified: boolean;
  status: string | null;
  [key: string]: unknown;
}

export function toSummary(r: SummaryRow): VendorSummary {
  return {
    id: r.id,
    displayName: r.display_name,
    categories: r.categories as Category[],
    priceLevel: r.price_level,
    paymentMethods: r.payment_methods as PaymentMethod[],
    languages: r.languages as LanguageCode[],
    rating: { average: r.rating_avg === null ? null : Number(r.rating_avg), count: Number(r.rating_count) },
    verified: Boolean(r.verified),
    status: r.status,
  };
}

export function point(lat: unknown, lng: unknown, precision: unknown) {
  return { lat: Number(lat), lng: Number(lng), precision: precision as Precision };
}

export function iso(value: unknown): string {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

/** Floors to the minute: "last confirmed" never needs to be more precise. */
export function minuteIso(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000).toISOString();
}

/** Distances are rounded so repeated queries don't refine anything. */
export function roundDistance(meters: unknown): number {
  return Math.round(Number(meters) / 50) * 50;
}
