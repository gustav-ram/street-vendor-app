import { z } from 'zod';

// ---------------------------------------------------------------- photos

/** A photo as the public sees it. Re-encoded, with no metadata, and no uploader identity. */
export const photoPublicSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  thumbUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  caption: z.string().nullable(),
  createdAt: z.string(),
});
export type PhotoPublic = z.infer<typeof photoPublicSchema>;

export const vendorPhotosPublicSchema = z.object({
  profile: photoPublicSchema.nullable(),
  cover: photoPublicSchema.nullable(),
  gallery: z.array(photoPublicSchema),
  /** From customers: approved by a moderator and not hidden by the vendor. */
  customer: z.array(photoPublicSchema),
});
export type VendorPhotosPublic = z.infer<typeof vendorPhotosPublicSchema>;
