import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LIMITS } from '@streeteats/shared';

/**
 * Picks a photo from the library and shrinks it on the phone (≤1600 px,
 * JPEG ~0.7) so it uploads quickly on a weak signal. EXIF isn't requested
 * from the picker, and the server strips any metadata that's left anyway.
 */
export async function pickPhoto(): Promise<{ uri: string; width: number; height: number } | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > 1600) context.resize(asset.width >= asset.height ? { width: 1600, height: null } : { width: null, height: 1600 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** The file's bytes as a Blob, for the chunked upload. */
export async function readPhoto(uri: string): Promise<Blob> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > LIMITS.photoMaxBytes) throw Object.assign(new Error('payload_too_large'), { code: 'payload_too_large' });
  return blob;
}
