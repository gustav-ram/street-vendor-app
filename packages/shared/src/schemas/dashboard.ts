import { z } from 'zod';
import { CATEGORIES, LANGUAGES, LIMITS, PAYMENT_METHODS, PRECISIONS } from '../constants';
import { latLngSchema, publicPointSchema } from './vendor';

// Vendor-only endpoints (/v1/vendor/...). Every write that can be made
// offline carries a client-generated id and the time the vendor made the
// change (clientUpdatedAt), so retries are harmless and the newest edit wins.

/** When the vendor made the change, on their device. */
export const clientTimeSchema = z.iso.datetime({ offset: true });

export const menuItemInputSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.menuItemNameMax),
  description: z.string().trim().max(LIMITS.menuItemDescriptionMax).default(''),
  priceCents: z.number().int().min(0).max(LIMITS.priceCentsMax),
  soldOut: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  clientUpdatedAt: clientTimeSchema,
});
export type MenuItemInput = z.input<typeof menuItemInputSchema>;

export const soldOutInputSchema = z.object({ soldOut: z.boolean(), clientUpdatedAt: clientTimeSchema });
export const deleteInputSchema = z.object({ clientUpdatedAt: clientTimeSchema });

export const quickStartSchema = z.object({
  displayName: z.string().trim().min(2).max(LIMITS.displayNameMax),
  categories: z.array(z.enum(CATEGORIES)).min(1).max(3),
  menu: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(LIMITS.menuItemNameMax),
        priceCents: z.number().int().min(0).max(LIMITS.priceCentsMax),
      }),
    )
    .min(1)
    .max(20),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).default(['cash']),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).default([]),
  defaultPrecision: z.enum(PRECISIONS).default('approximate'),
  timezone: z.string().max(64).optional(),
});
export type QuickStartInput = z.input<typeof quickStartSchema>;

export const vendorProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(LIMITS.displayNameMax).optional(),
  description: z.string().trim().max(LIMITS.descriptionMax).optional(),
  categories: z.array(z.enum(CATEGORIES)).min(1).max(3).optional(),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).optional(),
  // Types only. There is deliberately no field for handles or account numbers.
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).optional(),
  defaultPrecision: z.enum(PRECISIONS).optional(),
  contactText: z.string().trim().max(120).nullable().optional(),
  contactVisible: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  /** Vacation mode: hidden everywhere, and going live is blocked. */
  hidden: z.boolean().optional(),
});
export type VendorProfileUpdate = z.infer<typeof vendorProfileUpdateSchema>;

export const goLiveSchema = z.object({
  location: latLngSchema,
  precision: z.enum(PRECISIONS).optional(),
  /** 2, 4 or 8 hours; null/absent = until the end of the street day. */
  autoOffHours: z.union([z.literal(2), z.literal(4), z.literal(8)]).nullable().optional(),
  /** Resuming after lost signal: keep the original end time (the server still caps it). */
  endsAt: z.iso.datetime({ offset: true }).optional(),
});
export type GoLiveInput = z.input<typeof goLiveSchema>;

export const heartbeatSchema = z.object({ location: latLngSchema });

export const liveStatusSchema = z.object({
  state: z.enum(['live', 'offline']),
  /** Exactly what customers see (the fuzzed point in approximate mode). */
  location: publicPointSchema.nullable(),
  startedAt: z.string().nullable(),
  lastHeartbeatAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  heartbeatIntervalSec: z.number().int(),
  graceSec: z.number().int(),
});
export type LiveStatus = z.infer<typeof liveStatusSchema>;

export const statusPostInputSchema = z.object({
  body: z.string().trim().min(1).max(LIMITS.statusPostMax),
  /** Default: until the end of the vendor's street day. */
  expiresInHours: z.number().int().min(1).max(24).optional(),
  clientUpdatedAt: clientTimeSchema,
});
export type StatusPostInput = z.input<typeof statusPostInputSchema>;

export const writeResultSchema = z.object({
  /** "superseded": a newer change (or a delete) already won; nothing was written. */
  result: z.enum(['applied', 'superseded']),
});
export type WriteResult = z.infer<typeof writeResultSchema>;

export const myMenuItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  soldOut: z.boolean(),
  sortOrder: z.number().int(),
  clientUpdatedAt: z.string(),
});
export type MyMenuItem = z.infer<typeof myMenuItemSchema>;

export const myStatusPostSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type MyStatusPost = z.infer<typeof myStatusPostSchema>;

/** The signed-in vendor's own business, including private settings. */
export const myVendorSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  description: z.string(),
  categories: z.array(z.enum(CATEGORIES)),
  languages: z.array(z.enum(LANGUAGES)),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  priceLevel: z.number().int().nullable(),
  defaultPrecision: z.enum(PRECISIONS),
  contactText: z.string().nullable(),
  contactVisible: z.boolean(),
  timezone: z.string(),
  hidden: z.boolean(),
  menu: z.array(myMenuItemSchema),
  statusPosts: z.array(myStatusPostSchema),
  live: liveStatusSchema,
});
export type MyVendor = z.infer<typeof myVendorSchema>;
