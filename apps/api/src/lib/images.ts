import sharp, { type Metadata } from 'sharp';
import { ApiError } from './errors';

/**
 * The photo pipeline (PLAN.md §6.5). Every upload is decoded and re-encoded
 * from pixels, so nothing from the original file survives: no EXIF (GPS,
 * camera serial, time taken), no XMP, no ICC profile, no embedded thumbnail.
 */

const FULL_PX = 1600;
const THUMB_PX = 400;

/** Checks the first bytes, so a renamed file is caught on the first chunk. */
export function sniffImage(head: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    return 'webp';
  }
  return null;
}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

export async function processImage(input: Buffer, maxPixels: number): Promise<ProcessedImage> {
  if (!sniffImage(input)) throw new ApiError('unsupported_media');
  // Read the header first: a small file can still claim a huge canvas ("decompression bomb").
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw new ApiError('unsupported_media');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new ApiError('unsupported_media');
  if (!meta.width || !meta.height) throw new ApiError('unsupported_media');
  if (meta.width * meta.height > maxPixels) throw new ApiError('image_too_large');

  // rotate() with no angle applies the EXIF orientation before the EXIF is dropped.
  const decode = () => sharp(input, { limitInputPixels: maxPixels, failOn: 'error' }).rotate();
  try {
    const full = await decode()
      .resize({ width: FULL_PX, height: FULL_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await decode()
      .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 75 })
      .toBuffer();
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw new ApiError('unsupported_media');
  }
}
