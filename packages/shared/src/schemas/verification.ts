import { z } from 'zod';
import { LIMITS, VERIFICATION_STATUSES } from '../constants';

/**
 * "Community Verified" (PLAN.md §6.6). Earned through trust signals only,
 * never documents or identity. The thresholds are set on the server and
 * sent to the apps, which show them in "How do I earn this?".
 */
export const badgeCriteriaSchema = z.object({
  /** Distinct days live. */
  liveDays: z.number().int(),
  /** Counted "Still here" confirmations... */
  confirmations: z.number().int(),
  /** ...from at least this many different people... */
  confirmationAccounts: z.number().int(),
  /** ...on at least this many different days... */
  confirmationDays: z.number().int(),
  /** ...all within this many days. */
  confirmationWindowDays: z.number().int(),
  /** Approved reviews, with at least this average. */
  reviews: z.number().int(),
  reviewAverage: z.number(),
  /** No report upheld against the vendor in this many days. */
  reportWindowDays: z.number().int(),
});
export type BadgeCriteria = z.infer<typeof badgeCriteriaSchema>;

/** The vendor's own progress. Counts only: never who confirmed or when. */
export const verificationProgressSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  verifiedAt: z.string().nullable(),
  /** Set when a moderator removed the badge. */
  revokedReason: z.string().nullable(),
  criteria: badgeCriteriaSchema,
  progress: z.object({
    liveDays: z.object({ count: z.number().int(), met: z.boolean() }),
    confirmations: z.object({
      count: z.number().int(),
      accounts: z.number().int(),
      days: z.number().int(),
      /** Once reached, this step stays done even after old confirmations expire. */
      met: z.boolean(),
    }),
    reviews: z.object({ count: z.number().int(), average: z.number().nullable(), met: z.boolean() }),
    reports: z.object({ upheld: z.number().int(), met: z.boolean() }),
  }),
});
export type VerificationProgress = z.infer<typeof verificationProgressSchema>;

export const adminVendorSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  status: z.enum(VERIFICATION_STATUSES),
  verifiedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
  liveDays: z.number().int(),
});
export type AdminVendor = z.infer<typeof adminVendorSchema>;

export const adminVendorsQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(VERIFICATION_STATUSES).optional(),
});

export const verificationDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke'), reason: z.string().trim().min(1).max(LIMITS.revokeReasonMax) }),
  /** Lifts a revoke; the badge comes back only if the criteria are still met. */
  z.object({ action: z.literal('restore') }),
]);
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;
