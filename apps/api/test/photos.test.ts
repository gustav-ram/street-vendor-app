import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import exifReader from 'exif-reader';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { photos, uploads } from '../src/db/schema';
import { runSweep } from '../src/jobs/sweeper';
import { clearSynonymCache } from '../src/modules/search/query';
import { createTestContext, onboardedVendor, resetDb, signUp, signUpAdmin, uploadBytes } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  clearSynonymCache();
  await seedTags(ctx.db);
});

/** A phone photo: rotated via EXIF, with the camera model and where it was taken. */
async function phonePhoto(width = 300, height = 200) {
  return sharp({ create: { width, height, channels: 3, background: '#d94f2b' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'Pro Max 99' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '34/1 3/1 2580/100', GPSLongitudeRef: 'W', GPSLongitude: '118/1 15/1 300/100' },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

const path = (url: string) => new URL(url).pathname;
const get = (url: string, headers: Record<string, string> = {}) => ctx.app.inject({ method: 'GET', url, headers });

async function addVendorPhoto(headers: Record<string, string>, data: Buffer, kind = 'gallery') {
  const uploadId = await uploadBytes(ctx, headers, data);
  return ctx.app.inject({ method: 'POST', url: '/v1/vendor/photos', headers, payload: { uploadId, kind, caption: 'Bacon dogs' } });
}

async function profile(vendorId: string) {
  return (await get(`/v1/vendors/${vendorId}`)).json();
}

describe('photo pipeline', () => {
  it('strips EXIF and GPS, re-encodes to WebP and keeps the photo upright', async () => {
    const original = await phonePhoto();
    // The test input really carries the data we promise to remove.
    const before = await sharp(original).metadata();
    expect(exifReader(before.exif!).GPSInfo?.GPSLatitude).toEqual([34, 3, 25.8]);
    expect(before.orientation).toBe(6);

    const v = await onboardedVendor(ctx);
    const res = await addVendorPhoto(v.headers, original);
    expect(res.statusCode).toBe(201);
    expect(res.json().moderation).toBe('approved');

    const { gallery } = (await profile(v.vendorId)).photos;
    expect(gallery).toHaveLength(1);
    for (const url of [gallery[0].url, gallery[0].thumbUrl]) {
      const file = await get(path(url));
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toBe('image/webp');
      const meta = await sharp(file.rawPayload).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(file.rawPayload.includes(Buffer.from('TestPhone'))).toBe(false);
    }
    // Rotated by its EXIF orientation before the EXIF was dropped: 300x200 became 200x300.
    expect([gallery[0].width, gallery[0].height]).toEqual([200, 300]);
  });

  it('never keeps the original file or its name', async () => {
    const v = await onboardedVendor(ctx);
    await addVendorPhoto(v.headers, await phonePhoto());
    const [row] = await ctx.db.select().from(photos);
    expect(row!.storageKey).toMatch(/^[a-f0-9]{32}$/);
    expect(await ctx.db.$count(uploads)).toBe(0);
    const staged = await ctx.db.execute(sql`SELECT count(*)::int AS n FROM uploads`);
    expect(staged[0]!.n).toBe(0);
  });

  it('refuses files that are not images, even when they say they are', async () => {
    const v = await onboardedVendor(ctx);
    const fake = Buffer.from('#!/bin/sh\necho "definitely a jpeg"\n'.repeat(20));
    await expect(uploadBytes(ctx, v.headers, fake)).rejects.toMatchObject({ res: { statusCode: 415 } });
  });

  it('refuses huge images ("decompression bombs") before decoding them', async () => {
    const v = await onboardedVendor(ctx);
    const saved = ctx.config.photoMaxPixels;
    ctx.config.photoMaxPixels = 1_000_000;
    try {
      // Tiny file, big canvas.
      const bomb = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: '#fff' } }).png().toBuffer();
      const res = await addVendorPhoto(v.headers, bomb);
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('image_too_large');
      expect(await ctx.db.$count(photos)).toBe(0);
    } finally {
      ctx.config.photoMaxPixels = saved;
    }
  });

  it('resumes an interrupted upload from where the server says it stopped', async () => {
    const v = await onboardedVendor(ctx);
    const data = await phonePhoto(800, 600);
    const created = await ctx.app.inject({ method: 'POST', url: '/v1/uploads', headers: v.headers, payload: { contentType: 'image/jpeg', totalBytes: data.length } });
    const id = created.json().id;
    const patch = (offset: number, chunk: Buffer) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/v1/uploads/${id}`,
        headers: { ...v.headers, 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
        payload: chunk,
      });
    const half = Math.floor(data.length / 2);
    expect((await patch(0, data.subarray(0, half))).statusCode).toBe(200);
    // The phone lost signal and isn't sure the chunk arrived; it tries a later offset.
    expect((await patch(half + 100, data.subarray(half + 100))).json().error.code).toBe('offset_mismatch');
    const head = await ctx.app.inject({ method: 'HEAD', url: `/v1/uploads/${id}`, headers: v.headers });
    expect(Number(head.headers['upload-offset'])).toBe(half);
    expect((await patch(half, data.subarray(half))).json().offset).toBe(data.length);
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/vendor/photos', headers: v.headers, payload: { uploadId: id, kind: 'gallery' } });
    expect(res.statusCode).toBe(201);
  });

  it('a queued photo sent twice (the reply was lost) is added once', async () => {
    const v = await onboardedVendor(ctx);
    const uploadId = await uploadBytes(ctx, v.headers, await phonePhoto());
    const id = crypto.randomUUID();
    const send = () => ctx.app.inject({ method: 'POST', url: '/v1/vendor/photos', headers: v.headers, payload: { id, uploadId, kind: 'gallery' } });
    expect((await send()).json()).toMatchObject({ id, moderation: 'approved' });
    expect((await send()).json()).toMatchObject({ id, moderation: 'approved' });
    expect((await get('/v1/vendor/photos', v.headers)).json().gallery).toHaveLength(1);
    // Someone else can't claim that id.
    const other = await onboardedVendor(ctx);
    const theirs = await uploadBytes(ctx, other.headers, await phonePhoto());
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/vendor/photos', headers: other.headers, payload: { id, uploadId: theirs, kind: 'gallery' } });
    expect(res.statusCode).toBe(404);
  });

  it("uploads belong to whoever started them", async () => {
    const v = await onboardedVendor(ctx);
    const other = await onboardedVendor(ctx);
    const uploadId = await uploadBytes(ctx, v.headers, await phonePhoto());
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/vendor/photos', headers: other.headers, payload: { uploadId, kind: 'gallery' } });
    expect(res.statusCode).toBe(404);
  });

  it('deletes unfinished uploads and their bytes after 24 hours', async () => {
    const v = await onboardedVendor(ctx);
    const created = await ctx.app.inject({ method: 'POST', url: '/v1/uploads', headers: v.headers, payload: { contentType: 'image/jpeg', totalBytes: 5000 } });
    const [row] = await ctx.db.select().from(uploads).where(eq(uploads.id, created.json().id));
    const file = join(ctx.config.uploadDir, 'tmp', row!.tmpKey);
    expect(existsSync(file)).toBe(true);
    await ctx.db.update(uploads).set({ expiresAt: new Date(Date.now() - 1000) });
    await runSweep(ctx.db, ctx.app.ctx.storage);
    expect(existsSync(file)).toBe(false);
    expect(await ctx.db.$count(uploads)).toBe(0);
  });
});

describe('who sees which photo', () => {
  async function customerPhoto(vendorId: string) {
    const customer = await signUp(ctx, 'customer');
    const headers = { authorization: customer.authorization };
    const uploadId = await uploadBytes(ctx, headers, await phonePhoto());
    const res = await ctx.app.inject({ method: 'POST', url: `/v1/vendors/${vendorId}/photos`, headers, payload: { uploadId, caption: 'Elote!' } });
    expect(res.statusCode).toBe(201);
    const [row] = await ctx.db.select().from(photos).where(eq(photos.id, res.json().id));
    return { id: row!.id, key: row!.storageKey, headers, customer };
  }

  it('customer photos stay private until a moderator approves them', async () => {
    const v = await onboardedVendor(ctx);
    const admin = await signUpAdmin(ctx);
    const photo = await customerPhoto(v.vendorId);

    expect((await profile(v.vendorId)).photos.customer).toEqual([]);
    expect((await get(`/media/${photo.key}`)).statusCode).toBe(404);
    // Another customer can't peek; the uploader and moderators can.
    const stranger = await signUp(ctx, 'customer');
    expect((await get(`/v1/photos/${photo.id}/image`, { authorization: stranger.authorization })).statusCode).toBe(404);
    expect((await get(`/v1/photos/${photo.id}/image`, photo.headers)).statusCode).toBe(200);
    expect((await get(`/v1/photos/${photo.id}/image`, admin.headers)).statusCode).toBe(200);

    const queue = (await get('/v1/admin/moderation', admin.headers)).json();
    expect(queue.photos.map((p: { id: string }) => p.id)).toEqual([photo.id]);
    await ctx.app.inject({ method: 'POST', url: `/v1/admin/moderation/photo/${photo.id}`, headers: admin.headers, payload: { decision: 'approved' } });

    const shown = (await profile(v.vendorId)).photos.customer;
    expect(shown).toHaveLength(1);
    expect((await get(path(shown[0].url))).statusCode).toBe(200);
    // Nothing about who took it.
    const body = JSON.stringify(await profile(v.vendorId));
    expect(body).not.toContain(photo.customer.userId);
    expect(body).not.toContain(photo.customer.email);
  });

  it('vendors can hide (not delete) customer photos, and still see them to change their mind', async () => {
    const v = await onboardedVendor(ctx);
    const admin = await signUpAdmin(ctx);
    const photo = await customerPhoto(v.vendorId);
    await ctx.app.inject({ method: 'POST', url: `/v1/admin/moderation/photo/${photo.id}`, headers: admin.headers, payload: { decision: 'approved' } });

    const hide = await ctx.app.inject({ method: 'PATCH', url: `/v1/vendor/customer-photos/${photo.id}`, headers: v.headers, payload: { hidden: true } });
    expect(hide.statusCode).toBe(200);
    expect((await profile(v.vendorId)).photos.customer).toEqual([]);
    expect((await get(`/media/${photo.key}`)).statusCode).toBe(404);
    expect(await ctx.db.$count(photos)).toBe(1);
    const mine = (await get('/v1/vendor/photos', v.headers)).json();
    expect(mine.customer[0]).toMatchObject({ id: photo.id, hidden: true });
    expect((await get(`/v1/photos/${photo.id}/image`, v.headers)).statusCode).toBe(200);
    // Vendors can't delete customer photos.
    expect((await ctx.app.inject({ method: 'DELETE', url: `/v1/vendor/photos/${photo.id}`, headers: v.headers })).statusCode).toBe(404);
  });

  it('rejected photos are deleted along with their files', async () => {
    const v = await onboardedVendor(ctx);
    const admin = await signUpAdmin(ctx);
    const photo = await customerPhoto(v.vendorId);
    const file = join(ctx.config.uploadDir, 'photos', `${photo.key}.webp`);
    expect(existsSync(file)).toBe(true);
    await ctx.app.inject({ method: 'POST', url: `/v1/admin/moderation/photo/${photo.id}`, headers: admin.headers, payload: { decision: 'rejected' } });
    expect(await ctx.db.$count(photos)).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it('a new profile photo replaces the old one, files included', async () => {
    const v = await onboardedVendor(ctx);
    await addVendorPhoto(v.headers, await phonePhoto(), 'profile');
    const [first] = await ctx.db.select().from(photos);
    await addVendorPhoto(v.headers, await phonePhoto(), 'profile');
    expect(await ctx.db.$count(photos)).toBe(1);
    expect(existsSync(join(ctx.config.uploadDir, 'photos', `${first!.storageKey}.webp`))).toBe(false);
    expect((await profile(v.vendorId)).photos.profile).not.toBeNull();
  });

  it('vacation mode hides every photo of the vendor', async () => {
    const v = await onboardedVendor(ctx);
    await addVendorPhoto(v.headers, await phonePhoto());
    const [row] = await ctx.db.select().from(photos);
    expect((await get(`/media/${row!.storageKey}`)).statusCode).toBe(200);
    await ctx.app.inject({ method: 'PATCH', url: '/v1/vendor/me', headers: v.headers, payload: { hidden: true } });
    expect((await get(`/media/${row!.storageKey}`)).statusCode).toBe(404);
  });

  it('only customers add photos to vendor pages, and only signed in', async () => {
    const v = await onboardedVendor(ctx);
    const otherVendor = await onboardedVendor(ctx);
    const uploadId = await uploadBytes(ctx, otherVendor.headers, await phonePhoto());
    const asVendor = await ctx.app.inject({ method: 'POST', url: `/v1/vendors/${v.vendorId}/photos`, headers: otherVendor.headers, payload: { uploadId } });
    expect(asVendor.statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/uploads', payload: { contentType: 'image/jpeg', totalBytes: 10 } })).statusCode).toBe(401);
  });
});
