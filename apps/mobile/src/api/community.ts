import {
  type Favorite,
  type LatLng,
  type MyReview,
  type ReportInput,
  type ReviewInput,
  type StillHereResult,
  type UploadContentType,
  type UploadState,
  type UploadTransport,
  uploadBlob,
  type ViewerState,
} from '@streeteats/shared';
import { authRequest, authResponse } from '@/auth/session';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
type Ok = { ok: true };

// Resumable uploads (see @streeteats/shared uploadBlob): a dropped connection resumes from what the server has.
const uploadTransport: UploadTransport = {
  create: (input) => authRequest<UploadState>('/v1/uploads', json('POST', input)),
  offset: async (id) => Number((await authResponse(`/v1/uploads/${id}`, { method: 'HEAD' })).headers.get('upload-offset') ?? 0),
  send: (id, offset, chunk) =>
    authRequest<UploadState>(`/v1/uploads/${id}`, {
      method: 'PATCH',
      body: chunk,
      headers: { 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
    }),
};

export const uploadFile = (blob: Blob, type: UploadContentType, onProgress?: (f: number) => void) =>
  uploadBlob(uploadTransport, blob, type, { onProgress });

/** A signed-in person on a vendor's page. */
export const communityApi = {
  viewer: (vendorId: string) => authRequest<ViewerState>(`/v1/vendors/${vendorId}/viewer`),
  favorite: (vendorId: string, notifyOnOpen: boolean) => authRequest<Ok>(`/v1/vendors/${vendorId}/favorite`, json('PUT', { notifyOnOpen })),
  unfavorite: (vendorId: string) => authRequest<Ok>(`/v1/vendors/${vendorId}/favorite`, json('DELETE')),
  favorites: () => authRequest<{ favorites: Favorite[] }>('/v1/me/favorites'),
  review: (vendorId: string, input: ReviewInput) => authRequest<MyReview>(`/v1/vendors/${vendorId}/review`, json('PUT', input)),
  deleteReview: (vendorId: string) => authRequest<Ok>(`/v1/vendors/${vendorId}/review`, json('DELETE')),
  // Checked against the vendor's public point on the server, then dropped. Never stored.
  stillHere: (vendorId: string, location: LatLng) =>
    authRequest<StillHereResult>(`/v1/vendors/${vendorId}/still-here`, json('POST', { location })),
  report: (input: ReportInput) => authRequest<{ status: 'received' }>('/v1/reports', json('POST', input)),
  addPhoto: (vendorId: string, uploadId: string, caption?: string) =>
    authRequest<{ id: string; moderation: string }>(`/v1/vendors/${vendorId}/photos`, json('POST', { uploadId, caption })),
};
