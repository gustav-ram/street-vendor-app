import { z } from 'zod';
import { CATEGORIES, LANGUAGES, PAYMENT_METHODS, PRECISIONS } from '../constants';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const publicPointSchema = latLngSchema.extend({ precision: z.enum(PRECISIONS) });
export type PublicPoint = z.infer<typeof publicPointSchema>;

export const ratingSchema = z.object({
  average: z.number().nullable(),
  count: z.number().int(),
});

export const tagSchema = z.object({ slug: z.string(), nameEn: z.string(), nameEs: z.string() });
export type Tag = z.infer<typeof tagSchema>;

/** What a map pin / list row needs. Never includes account data. */
export const vendorSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  categories: z.array(z.enum(CATEGORIES)),
  priceLevel: z.number().int().min(1).max(3).nullable(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  languages: z.array(z.enum(LANGUAGES)),
  rating: ratingSchema,
  verified: z.boolean(),
  status: z.string().nullable(),
});
export type VendorSummary = z.infer<typeof vendorSummarySchema>;

export const liveInfoSchema = z.object({
  location: publicPointSchema,
  since: z.string(),
  /** Last heartbeat or customer "still here", rounded down to the minute. */
  lastConfirmedAt: z.string(),
  endsAt: z.string(),
});
export type LiveInfo = z.infer<typeof liveInfoSchema>;

export const upcomingSpotSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['post', 'schedule']),
  startsAt: z.string(),
  endsAt: z.string(),
  placeLabel: z.string().nullable(),
  note: z.string().nullable(),
  location: publicPointSchema.nullable(),
});
export type UpcomingSpot = z.infer<typeof upcomingSpotSchema>;

export const menuItemPublicSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  soldOut: z.boolean(),
});

export const scheduleEntryPublicSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  placeLabel: z.string().nullable(),
  location: publicPointSchema.nullable(),
});

export const reviewPublicSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
  vendorReply: z.string().nullable(),
  vendorReplyAt: z.string().nullable(),
});
export type ReviewPublic = z.infer<typeof reviewPublicSchema>;

export const vendorProfileSchema = vendorSummarySchema.extend({
  description: z.string(),
  tags: z.array(tagSchema),
  contact: z.string().nullable(),
  timezone: z.string(),
  live: liveInfoSchema.nullable(),
  /** Coarse "last active" time (hour precision), only a timestamp, never a place. */
  lastActiveAt: z.string().nullable(),
  menu: z.array(menuItemPublicSchema),
  schedule: z.array(scheduleEntryPublicSchema),
  upcoming: z.array(upcomingSpotSchema),
  reviews: z.array(reviewPublicSchema),
});
export type VendorProfile = z.infer<typeof vendorProfileSchema>;

export const vendorEventSchema = z.object({ type: z.enum(['profile_view', 'directions']) });
