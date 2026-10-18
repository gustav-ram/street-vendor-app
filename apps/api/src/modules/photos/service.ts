import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CustomerPhotoCreateInput,
  MyPhoto,
  MyPhotos,
  PhotoPublic,
  Role,
  VendorPhotoCreateInput,
  VendorPhotosPublic,
} from '@streeteats/shared';
import type { AppContext } from '../../app';
import { photos, vendorProfiles } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { processImage } from '../../lib/images';
import { takeUpload } from '../uploads/service';
import { assertNotBlocked, publicVendor } from '../community/guards';

type PhotoRow = typeof photos.$inferSelect;

const GALLERY_MAX = 30;

export function toPublicPhoto(ctx: AppContext, p: PhotoRow): PhotoPublic {
  return {
    id: p.id,
    url: `${ctx.config.publicUrl}/media/${p.storageKey}`,
    thumbUrl: `${ctx.config.publicUrl}/media/${p.thumbKey}`,
    width: p.width,
    height: p.height,
    caption: p.caption,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Re-encodes the upload (dropping every bit of metadata) and stores the two sizes. */
async function processUpload(ctx: AppContext, userId: string, uploadId: string) {
  const original = await takeUpload(ctx, userId, uploadId);
  const image = await processImage(original, ctx.config.photoMaxPixels);
  const storageKey = ctx.storage.newKey();
  const thumbKey = ctx.storage.newKey();
  await ctx.storage.savePhoto(storageKey, image.full);
  await ctx.storage.savePhoto(thumbKey, image.thumb);
  return { storageKey, thumbKey, width: image.width, height: image.height };
}

/** Deletes rows and their files. */
export async function deletePhotos(ctx: AppContext, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await ctx.db.delete(photos).where(inArray(photos.id, ids)).returning({ storageKey: photos.storageKey, thumbKey: photos.thumbKey });
  await Promise.all(rows.flatMap((r) => [ctx.storage.removePhoto(r.storageKey), ctx.storage.removePhoto(r.thumbKey)]));
}

/** Vendor photos are approved automatically; a new profile or cover photo replaces the old one. */
export async function addVendorPhoto(ctx: AppContext, vendorId: string, userId: string, input: VendorPhotoCreateInput) {
  if (input.id) {
    // A retry of a photo that already went through (the reply was lost).
    const [done] = await ctx.db.select({ vendorId: photos.vendorId, moderation: photos.moderation }).from(photos).where(eq(photos.id, input.id));
    if (done && done.vendorId !== vendorId) throw new ApiError('not_found');
    if (done) return { id: input.id, moderation: done.moderation };
  }
  if (input.kind === 'gallery') {
    const count = await ctx.db.$count(photos, and(eq(photos.vendorId, vendorId), eq(photos.kind, 'gallery')));
    if (count >= GALLERY_MAX) throw new ApiError('conflict');
  }
  const stored = await processUpload(ctx, userId, input.uploadId);
  const [photo] = await ctx.db
    .insert(photos)
    .values({
      ...(input.id ? { id: input.id } : {}),
      vendorId,
      uploaderUserId: userId,
      source: 'vendor',
      kind: input.kind,
      caption: input.caption || null,
      moderation: 'approved',
      ...stored,
    })
    .returning();

  if (input.kind === 'profile' || input.kind === 'cover') {
    const column = input.kind === 'profile' ? vendorProfiles.profilePhotoId : vendorProfiles.coverPhotoId;
    const [before] = await ctx.db.select({ old: column }).from(vendorProfiles).where(eq(vendorProfiles.id, vendorId));
    await ctx.db
      .update(vendorProfiles)
      .set(input.kind === 'profile' ? { profilePhotoId: photo!.id } : { coverPhotoId: photo!.id })
      .where(eq(vendorProfiles.id, vendorId));
    if (before?.old) await deletePhotos(ctx, [before.old]);
  }
  return { id: photo!.id, moderation: photo!.moderation };
}

/** Customer photos wait for a moderator before anyone else can see them. */
export async function addCustomerPhoto(
  ctx: AppContext,
  user: { id: string; role: Role },
  vendorId: string,
  input: CustomerPhotoCreateInput,
) {
  if (user.role !== 'customer') throw new ApiError('forbidden');
  const vendor = await publicVendor(ctx, vendorId);
  await assertNotBlocked(ctx, vendor.userId, user.id);
  const pending = await ctx.db.$count(
    photos,
    and(eq(photos.vendorId, vendorId), eq(photos.uploaderUserId, user.id), eq(photos.moderation, 'pending')),
  );
  if (pending >= 5) throw new ApiError('rate_limited');
  const stored = await processUpload(ctx, user.id, input.uploadId);
  const [photo] = await ctx.db
    .insert(photos)
    .values({
      vendorId,
      uploaderUserId: user.id,
      source: 'customer',
      kind: 'customer',
      caption: input.caption || null,
      moderation: 'pending',
      ...stored,
    })
    .returning();
  return { id: photo!.id, moderation: photo!.moderation };
}

export async function deleteVendorPhoto(ctx: AppContext, vendorId: string, photoId: string) {
  const [row] = await ctx.db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.vendorId, vendorId), eq(photos.source, 'vendor')));
  if (!row) throw new ApiError('not_found');
  await deletePhotos(ctx, [row.id]);
}

/** Vendors can hide customer photos of their business (not delete them; they can also report them). */
export async function setCustomerPhotoHidden(ctx: AppContext, vendorId: string, photoId: string, hidden: boolean) {
  const updated = await ctx.db
    .update(photos)
    .set({ hiddenByVendor: hidden })
    .where(and(eq(photos.id, photoId), eq(photos.vendorId, vendorId), eq(photos.source, 'customer'), eq(photos.moderation, 'approved')))
    .returning({ id: photos.id });
  if (updated.length === 0) throw new ApiError('not_found');
}

async function vendorPhotoRows(ctx: AppContext, vendorId: string) {
  const [refs] = await ctx.db
    .select({ profile: vendorProfiles.profilePhotoId, cover: vendorProfiles.coverPhotoId })
    .from(vendorProfiles)
    .where(eq(vendorProfiles.id, vendorId));
  const rows = await ctx.db
    .select()
    .from(photos)
    .where(and(eq(photos.vendorId, vendorId), eq(photos.moderation, 'approved')))
    .orderBy(desc(photos.createdAt))
    .limit(200);
  return { refs, rows };
}

export async function getPublicPhotos(ctx: AppContext, vendorId: string): Promise<VendorPhotosPublic> {
  const { refs, rows } = await vendorPhotoRows(ctx, vendorId);
  const byId = (id: string | null | undefined) => rows.find((r) => r.id === id);
  const profile = byId(refs?.profile);
  const cover = byId(refs?.cover);
  return {
    profile: profile ? toPublicPhoto(ctx, profile) : null,
    cover: cover ? toPublicPhoto(ctx, cover) : null,
    gallery: rows.filter((r) => r.kind === 'gallery').slice(0, GALLERY_MAX).map((r) => toPublicPhoto(ctx, r)),
    customer: rows
      .filter((r) => r.source === 'customer' && !r.hiddenByVendor)
      .slice(0, GALLERY_MAX)
      .map((r) => toPublicPhoto(ctx, r)),
  };
}

export async function getMyPhotos(ctx: AppContext, vendorId: string): Promise<MyPhotos> {
  const { refs, rows } = await vendorPhotoRows(ctx, vendorId);
  const mine = (p: PhotoRow): MyPhoto => ({ ...toPublicPhoto(ctx, p), kind: p.kind, hidden: p.hiddenByVendor });
  const byId = (id: string | null | undefined) => rows.find((r) => r.id === id);
  const profile = byId(refs?.profile);
  const cover = byId(refs?.cover);
  return {
    profile: profile ? mine(profile) : null,
    cover: cover ? mine(cover) : null,
    gallery: rows.filter((r) => r.kind === 'gallery').map(mine),
    customer: rows.filter((r) => r.source === 'customer').map(mine),
  };
}

/**
 * Public files: only approved photos, not hidden by the vendor, of vendors
 * not in vacation mode. A rejected or hidden photo stops loading at once.
 */
export async function findServablePhoto(ctx: AppContext, key: string) {
  const [row] = await ctx.db.execute<{ id: string }>(sql`
    SELECT p.id FROM photos p JOIN vendor_profiles v ON v.id = p.vendor_id
    WHERE (p.storage_key = ${key} OR p.thumb_key = ${key})
      AND p.moderation = 'approved' AND NOT p.hidden_by_vendor AND NOT v.hidden`);
  return Boolean(row);
}

/**
 * Any photo, for people allowed to see it before (or after) it's public:
 * moderators, the person who uploaded it, and the vendor whose page it's on
 * (approved customer photos only, so they can decide whether to hide one).
 */
export async function readPhotoForViewer(
  ctx: AppContext,
  viewer: { id: string; role: Role },
  photoId: string,
  size: 'thumb' | 'full',
) {
  const [row] = await ctx.db.execute<{ storage_key: string; thumb_key: string; uploader_user_id: string | null; owner: string; moderation: string }>(sql`
    SELECT p.storage_key, p.thumb_key, p.uploader_user_id, v.user_id AS owner, p.moderation
    FROM photos p JOIN vendor_profiles v ON v.id = p.vendor_id WHERE p.id = ${photoId}`);
  if (!row) throw new ApiError('not_found');
  const allowed =
    viewer.role === 'admin' || row.uploader_user_id === viewer.id || (row.owner === viewer.id && row.moderation === 'approved');
  if (!allowed) throw new ApiError('not_found');
  return ctx.storage.readPhoto(size === 'thumb' ? row.thumb_key : row.storage_key);
}
