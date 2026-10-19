import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AnalyticsRange, VendorAnalytics } from '@streeteats/shared';
import { authRequest, mediaHeaders } from '@/auth/session';
import { API_URL } from '@/config';

/**
 * "Download my data": the export zip is saved to the app's cache, handed to
 * the iOS share sheet (Save to Files, AirDrop...), then deleted from the
 * cache so no copy stays inside the app.
 */
export async function shareMyData() {
  const file = new File(Paths.cache, `streeteats-export-${new Date().toISOString().slice(0, 10)}.zip`);
  const download = async () => File.downloadFileAsync(`${API_URL}/v1/me/export`, file, { headers: await mediaHeaders(), idempotent: true });
  let saved: File;
  try {
    saved = await download();
  } catch {
    // Most likely an expired session: this request refreshes it, then try once more.
    await authRequest('/v1/me');
    saved = await download();
  }
  try {
    await Sharing.shareAsync(saved.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } finally {
    if (saved.exists) saved.delete();
  }
}

/** Deletes the account for good; the caller then signs out locally. */
export const deleteMyAccount = (secret: string) =>
  authRequest<void>('/v1/me', { method: 'DELETE', body: JSON.stringify({ secret }) });

export const vendorStats = (range: AnalyticsRange) => authRequest<VendorAnalytics>(`/v1/vendor/analytics?range=${range}`);
