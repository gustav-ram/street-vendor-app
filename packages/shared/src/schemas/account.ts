import { z } from 'zod';
import { LIMITS } from '../constants';

// ---------------------------------------------------------------- account controls

/** Deleting an account asks for the password (or PIN) again. */
export const deleteAccountSchema = z.object({ secret: z.string().min(1).max(LIMITS.passwordMax) });
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// ---------------------------------------------------------------- invite codes

/**
 * Invite codes for flyers. Only aggregate numbers are kept: how many times a
 * code was used, never who used it.
 */
export const adminInviteSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  /** The campaign, e.g. "Boyle Heights flyers, October". Only admins see it. */
  label: z.string(),
  maxRedemptions: z.number().int().nullable(),
  redemptionCount: z.number().int(),
  expiresAt: z.string().nullable(),
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type AdminInvite = z.infer<typeof adminInviteSchema>;

export const createInviteSchema = z.object({
  label: z.string().trim().min(1).max(80),
  maxRedemptions: z.number().int().min(1).max(10_000).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const updateInviteSchema = z.object({ disabled: z.boolean() });

/** What the public join page learns about a code: whether it can be used. Nothing else. */
export const inviteCheckSchema = z.object({ valid: z.boolean() });

export const inviteStatsSchema = z.object({
  codes: z.number().int(),
  redemptions: z.number().int(),
});

// ---------------------------------------------------------------- vendor analytics

export const ANALYTICS_RANGES = ['7d', '30d'] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const analyticsDaySchema = z.object({
  /** YYYY-MM-DD in the vendor's time zone. */
  day: z.string(),
  profileViews: z.number().int(),
  mapImpressions: z.number().int(),
  directionsTaps: z.number().int(),
  favoritesAdded: z.number().int(),
  favoritesRemoved: z.number().int(),
  confirmations: z.number().int(),
});
export type AnalyticsDay = z.infer<typeof analyticsDaySchema>;

/** Daily totals only. There is no per-customer data to show, because none is kept. */
export const vendorAnalyticsSchema = z.object({
  range: z.enum(ANALYTICS_RANGES),
  days: z.array(analyticsDaySchema),
  totals: analyticsDaySchema.omit({ day: true }),
  /** People who have the vendor saved right now. */
  favoritesNow: z.number().int(),
});
export type VendorAnalytics = z.infer<typeof vendorAnalyticsSchema>;
