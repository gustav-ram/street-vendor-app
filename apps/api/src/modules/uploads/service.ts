import { and, eq, gt, sql } from 'drizzle-orm';
import type { CreateUploadInput, UploadState } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { uploads } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { sniffImage } from '../../lib/images';

/**
 * Resumable uploads (PLAN.md §6.4): create, then send chunks with
 * `Upload-Offset`; after a dropped connection, HEAD says where to resume.
 * Staged bytes are only ever read by the photo pipeline, which re-encodes
 * them; anything not turned into a photo within 24 h is deleted.
 */

const TTL_MS = 24 * 3_600_000;
const MAX_OPEN_PER_USER = 5;

export async function createUpload(ctx: AppContext, userId: string, input: CreateUploadInput): Promise<UploadState> {
  const open = await ctx.db.$count(uploads, and(eq(uploads.userId, userId), gt(uploads.expiresAt, sql`now()`)));
  if (open >= MAX_OPEN_PER_USER) throw new ApiError('rate_limited');
  const tmpKey = ctx.storage.newKey();
  await ctx.storage.createTmp(tmpKey);
  const [row] = await ctx.db
    .insert(uploads)
    .values({ userId, contentType: input.contentType, totalBytes: input.totalBytes, tmpKey, expiresAt: new Date(Date.now() + TTL_MS) })
    .returning({ id: uploads.id });
  return { id: row!.id, offset: 0, totalBytes: input.totalBytes };
}

async function findOwn(ctx: AppContext, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.userId, userId), gt(uploads.expiresAt, sql`now()`)));
  if (!row) throw new ApiError('not_found');
  return row;
}

export async function uploadState(ctx: AppContext, userId: string, id: string): Promise<UploadState> {
  const row = await findOwn(ctx, userId, id);
  return { id: row.id, offset: row.receivedBytes, totalBytes: row.totalBytes };
}

export async function writeChunk(ctx: AppContext, userId: string, id: string, offset: number, chunk: Buffer): Promise<UploadState> {
  const row = await findOwn(ctx, userId, id);
  if (offset !== row.receivedBytes) throw new ApiError('offset_mismatch');
  if (chunk.length === 0) return { id, offset, totalBytes: row.totalBytes };
  if (offset + chunk.length > row.totalBytes) throw new ApiError('payload_too_large');
  // Refuse non-images on the first chunk instead of after 10 MB.
  if (offset === 0 && !sniffImage(chunk)) throw new ApiError('unsupported_media');

  await ctx.storage.writeTmp(row.tmpKey, offset, chunk);
  const next = offset + chunk.length;
  const updated = await ctx.db
    .update(uploads)
    .set({ receivedBytes: next })
    .where(and(eq(uploads.id, id), eq(uploads.receivedBytes, offset)))
    .returning({ id: uploads.id });
  // Two copies of the same chunk raced; the other one won.
  if (updated.length === 0) throw new ApiError('offset_mismatch');
  return { id, offset: next, totalBytes: row.totalBytes };
}

/** Hands a finished upload's bytes to the photo pipeline. The staged copy is deleted either way. */
export async function takeUpload(ctx: AppContext, userId: string, id: string): Promise<Buffer> {
  const row = await findOwn(ctx, userId, id);
  if (row.receivedBytes !== row.totalBytes) throw new ApiError('upload_incomplete');
  try {
    return await ctx.storage.readTmp(row.tmpKey);
  } finally {
    await ctx.db.delete(uploads).where(eq(uploads.id, id));
    await ctx.storage.removeTmp(row.tmpKey);
  }
}
