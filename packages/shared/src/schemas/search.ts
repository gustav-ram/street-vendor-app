import { z } from 'zod';
import { CATEGORIES, DEFAULT_RADIUS_M, LANGUAGES, PAYMENT_METHODS } from '../constants';
import { latLngSchema, liveInfoSchema, tagSchema, upcomingSpotSchema, vendorSummarySchema } from './vendor';

export const searchFiltersSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).optional(),
  priceLevels: z.array(z.number().int().min(1).max(3)).max(3).optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length).optional(),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

// Sent as a POST body so the customer's location never lands in a URL,
// a proxy log or browser history. Clients round it to ~100 m first.
export const searchRequestSchema = z.object({
  location: latLngSchema,
  radiusM: z.number().int().min(200).max(50_000).default(DEFAULT_RADIUS_M),
  q: z.string().trim().max(80).optional(),
  filters: searchFiltersSchema.default({}),
  /** "live" = open right now. "upcoming" adds tomorrow posts and published schedules. */
  include: z.array(z.enum(['live', 'upcoming'])).min(1).default(['live']),
  limit: z.number().int().min(1).max(100).default(60),
});
export type SearchRequest = z.input<typeof searchRequestSchema>;

export const liveResultSchema = vendorSummarySchema.extend({
  live: liveInfoSchema,
  /** Rounded to 50 m. */
  distanceM: z.number().int(),
});
export type LiveResult = z.infer<typeof liveResultSchema>;

export const upcomingResultSchema = vendorSummarySchema.extend({
  spot: upcomingSpotSchema,
  distanceM: z.number().int().nullable(),
});
export type UpcomingResult = z.infer<typeof upcomingResultSchema>;

export const searchResponseSchema = z.object({
  live: z.array(liveResultSchema),
  upcoming: z.array(upcomingResultSchema),
  /** Tags the query was understood as, e.g. "la style hot dog" -> Danger Dog, Sonoran dog... */
  matchedTags: z.array(tagSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const metaResponseSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  languages: z.array(z.enum(LANGUAGES)),
  tags: z.array(tagSchema.extend({ category: z.string().nullable() })),
  live: z.object({ heartbeatIntervalSec: z.number().int(), graceSec: z.number().int() }),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;
