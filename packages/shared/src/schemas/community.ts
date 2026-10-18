import { z } from 'zod';
import {
  LIMITS,
  MODERATION_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  UPLOAD_CONTENT_TYPES,
  VENDOR_PHOTO_KINDS,
} from '../constants';
import { photoPublicSchema } from './photos';
import { latLngSchema, liveInfoSchema, upcomingSpotSchema, vendorSummarySchema } from './vendor';

// ---------------------------------------------------------------- uploads (resumable)

export const createUploadSchema = z.object({
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  totalBytes: z.number().int().min(1).max(LIMITS.photoMaxBytes),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const uploadStateSchema = z.object({
  id: z.uuid(),
  /** Bytes the server has. Send the next chunk from here. */
  offset: z.number().int(),
  totalBytes: z.number().int(),
});
export type UploadState = z.infer<typeof uploadStateSchema>;

// ---------------------------------------------------------------- photos

const caption = z.string().trim().max(LIMITS.photoCaptionMax).optional();

export const vendorPhotoCreateSchema = z.object({
  uploadId: z.uuid(),
  kind: z.enum(VENDOR_PHOTO_KINDS),
  caption,
});
export type VendorPhotoCreateInput = z.infer<typeof vendorPhotoCreateSchema>;

export const customerPhotoCreateSchema = z.object({ uploadId: z.uuid(), caption });
export type CustomerPhotoCreateInput = z.infer<typeof customerPhotoCreateSchema>;

export const photoCreatedSchema = z.object({ id: z.uuid(), moderation: z.enum(MODERATION_STATUSES) });

/** The vendor's view of photos on their page, including customer photos they hid. */
export const myPhotoSchema = photoPublicSchema.extend({
  kind: z.enum(['profile', 'cover', 'gallery', 'customer']),
  hidden: z.boolean(),
});
export type MyPhoto = z.infer<typeof myPhotoSchema>;

export const myPhotosSchema = z.object({
  profile: myPhotoSchema.nullable(),
  cover: myPhotoSchema.nullable(),
  gallery: z.array(myPhotoSchema),
  customer: z.array(myPhotoSchema),
});
export type MyPhotos = z.infer<typeof myPhotosSchema>;

export const hidePhotoSchema = z.object({ hidden: z.boolean() });

// ---------------------------------------------------------------- reviews

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(LIMITS.reviewMax).default(''),
});
export type ReviewInput = z.input<typeof reviewInputSchema>;

export const myReviewSchema = z.object({
  rating: z.number().int(),
  body: z.string(),
  /** "pending" while a moderator looks at it (links, phone numbers or flagged words). */
  moderation: z.enum(MODERATION_STATUSES),
  updatedAt: z.string(),
});
export type MyReview = z.infer<typeof myReviewSchema>;

export const reviewReplySchema = z.object({ body: z.string().trim().min(1).max(LIMITS.reviewReplyMax) });

/** A review as the vendor sees it on their dashboard. */
export const vendorReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int(),
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
  vendorReply: z.string().nullable(),
  vendorReplyAt: z.string().nullable(),
  authorBlocked: z.boolean(),
});
export type VendorReview = z.infer<typeof vendorReviewSchema>;

// ---------------------------------------------------------------- favorites

export const favoriteInputSchema = z.object({ notifyOnOpen: z.boolean().default(false) });
export type FavoriteInput = z.input<typeof favoriteInputSchema>;

export const favoriteSchema = z.object({
  vendor: vendorSummarySchema,
  notifyOnOpen: z.boolean(),
  live: liveInfoSchema.nullable(),
  upcoming: z.array(upcomingSpotSchema),
});
export type Favorite = z.infer<typeof favoriteSchema>;
export const favoritesResponseSchema = z.object({ favorites: z.array(favoriteSchema) });

// ---------------------------------------------------------------- "Still here?"

export const stillHereInputSchema = z.object({
  /** Used only to check "near the vendor". Never stored or logged. */
  location: latLngSchema,
});
export const stillHereResultSchema = z.object({ status: z.enum(['confirmed', 'already_confirmed']) });
export type StillHereResult = z.infer<typeof stillHereResultSchema>;

// ---------------------------------------------------------------- the signed-in viewer on a vendor page

export const viewerStateSchema = z.object({
  favorite: z.boolean(),
  notifyOnOpen: z.boolean(),
  review: myReviewSchema.nullable(),
  /** Already said "Yes, they're here" in the last 24 h. */
  confirmedRecently: z.boolean(),
  /** The vendor's own account looking at their page: no review, photo or confirm buttons. */
  isOwner: z.boolean(),
});
export type ViewerState = z.infer<typeof viewerStateSchema>;

// ---------------------------------------------------------------- reports & blocks

export const reportInputSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(LIMITS.reportDetailsMax).optional(),
});
export type ReportInput = z.input<typeof reportInputSchema>;
export const reportReceivedSchema = z.object({ status: z.literal('received') });

/** Block the author of a review or customer photo (their identity is never shown). */
export const blockInputSchema = z.union([z.object({ reviewId: z.uuid() }), z.object({ photoId: z.uuid() })]);
export type BlockInput = z.infer<typeof blockInputSchema>;

export const blockSchema = z.object({
  /** An opaque handle for unblocking; not the person's account id. */
  id: z.string(),
  name: z.string().nullable(),
  createdAt: z.string(),
});
export type Block = z.infer<typeof blockSchema>;
export const blocksResponseSchema = z.object({ blocks: z.array(blockSchema) });

// ---------------------------------------------------------------- admin

export const moderationPhotoSchema = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  caption: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  createdAt: z.string(),
});
export const moderationReviewSchema = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  rating: z.number().int(),
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
});
export const moderationQueueSchema = z.object({
  photos: z.array(moderationPhotoSchema),
  reviews: z.array(moderationReviewSchema),
});
export type ModerationQueue = z.infer<typeof moderationQueueSchema>;

export const moderationDecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']) });

export const adminReportSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().nullable(),
  status: z.enum(REPORT_STATUSES),
  adminNote: z.string().nullable(),
  createdAt: z.string(),
  /** What was reported, for the moderator. Null if it has since been deleted. */
  target: z
    .object({
      vendorId: z.uuid().nullable(),
      vendorName: z.string().nullable(),
      text: z.string().nullable(),
      photoId: z.uuid().nullable(),
    })
    .nullable(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;
export const adminReportsSchema = z.object({ reports: z.array(adminReportSchema) });

export const reportDecisionSchema = z.object({
  /** "upheld" also takes the reported photo, review or post down. */
  status: z.enum(['dismissed', 'upheld', 'resolved']),
  adminNote: z.string().trim().max(500).optional(),
});
