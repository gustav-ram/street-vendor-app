import { LIMITS, type UploadContentType } from '../constants';
import type { CreateUploadInput, UploadState } from '../schemas/community';

/**
 * Resumable photo upload, shared by the iOS app and the website. Each app
 * supplies the three HTTP calls (with its own auth). A chunk that fails is
 * retried with backoff after asking the server how much it already has, so
 * a dropped connection resumes instead of starting over.
 */

export interface UploadTransport {
  create(input: CreateUploadInput): Promise<UploadState>;
  /** HEAD: how many bytes the server has. */
  offset(id: string): Promise<number>;
  /** PATCH: send bytes starting at `offset`. */
  send(id: string, offset: number, chunk: Blob): Promise<UploadState>;
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  /** Consecutive failures allowed before giving up. */
  retries?: number;
  chunkBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  /** An upload started earlier (say, before the app was closed) to carry on with. */
  uploadId?: string;
  /** Called with the upload's id once it exists, so the caller can save it and resume later. */
  onCreated?: (id: string) => void | Promise<void>;
}

// Errors where retrying can't help.
const FINAL = new Set(['unsupported_media', 'payload_too_large', 'image_too_large', 'unauthorized', 'forbidden', 'rate_limited', 'validation_failed']);
const codeOf = (err: unknown) => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'network';
};

export async function uploadBlob(t: UploadTransport, blob: Blob, contentType: UploadContentType, opts: UploadOptions = {}) {
  const { onProgress, retries = 6, chunkBytes = LIMITS.uploadChunkBytes } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let id = '';
  let offset = 0;
  if (opts.uploadId) {
    // Unfinished uploads are kept for a day; an expired one starts over.
    try {
      offset = await t.offset(opts.uploadId);
      id = opts.uploadId;
    } catch (err) {
      if (codeOf(err) !== 'not_found') throw err;
    }
  }
  if (!id) {
    ({ id } = await t.create({ contentType, totalBytes: blob.size }));
    offset = 0;
    await opts.onCreated?.(id);
  }
  let failures = 0;
  onProgress?.(offset / blob.size);
  while (offset < blob.size) {
    try {
      const state = await t.send(id, offset, blob.slice(offset, offset + chunkBytes, 'application/offset+octet-stream'));
      offset = state.offset;
      failures = 0;
      onProgress?.(offset / blob.size);
    } catch (err) {
      if (FINAL.has(codeOf(err)) || ++failures > retries) throw err;
      // 1 s, 2 s, 4 s... up to 30 s, with a little jitter.
      await sleep(Math.min(30_000, 1000 * 2 ** (failures - 1)) * (0.8 + Math.random() * 0.4));
      offset = await t.offset(id).catch(() => offset);
    }
  }
  return id;
}

/** Photo types the API accepts, from a file's MIME type (null if it isn't one). */
export function uploadTypeOf(mime: string | null | undefined): UploadContentType | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  return null;
}
