import type {
  Block,
  BlockInput,
  GoLiveInput,
  HeartbeatInput,
  LiveStatus,
  MenuItemInput,
  MyPhotos,
  MyVendor,
  QuickStartInput,
  StatusPostInput,
  VendorPhotoKind,
  VendorProfileUpdate,
  VendorReview,
  WriteResult,
} from '@streeteats/shared';
import { authRequest } from '@/auth/session';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const vendorApi = {
  me: () => authRequest<MyVendor>('/v1/vendor/me'),
  quickStart: (input: QuickStartInput) => authRequest<MyVendor>('/v1/vendor/quick-start', json('POST', input)),
  update: (patch: VendorProfileUpdate) => authRequest<MyVendor>('/v1/vendor/me', json('PATCH', patch)),

  live: {
    status: () => authRequest<LiveStatus>('/v1/vendor/live'),
    // Exact device coordinates go only to our API, which fuzzes them before storing.
    start: (input: GoLiveInput) => authRequest<LiveStatus>('/v1/vendor/live', json('POST', input)),
    heartbeat: (input: HeartbeatInput) => authRequest<LiveStatus>('/v1/vendor/live/heartbeat', json('POST', input)),
    end: () => authRequest<LiveStatus>('/v1/vendor/live', json('DELETE')),
  },

  menu: {
    put: (id: string, item: MenuItemInput) => authRequest<WriteResult>(`/v1/vendor/menu/${id}`, json('PUT', item)),
    soldOut: (id: string, soldOut: boolean) =>
      authRequest<WriteResult>(`/v1/vendor/menu/${id}/sold-out`, json('PUT', { soldOut, clientUpdatedAt: new Date().toISOString() })),
    remove: (id: string) => authRequest<WriteResult>(`/v1/vendor/menu/${id}`, json('DELETE', { clientUpdatedAt: new Date().toISOString() })),
  },

  status: {
    put: (id: string, post: StatusPostInput) => authRequest<WriteResult>(`/v1/vendor/status/${id}`, json('PUT', post)),
    remove: (id: string) => authRequest<WriteResult>(`/v1/vendor/status/${id}`, json('DELETE', { clientUpdatedAt: new Date().toISOString() })),
  },

  photos: {
    list: () => authRequest<MyPhotos>('/v1/vendor/photos'),
    add: (uploadId: string, kind: VendorPhotoKind, caption?: string) =>
      authRequest<{ id: string }>('/v1/vendor/photos', json('POST', { uploadId, kind, caption })),
    remove: (id: string) => authRequest<{ ok: true }>(`/v1/vendor/photos/${id}`, json('DELETE')),
    hide: (id: string, hidden: boolean) => authRequest<{ ok: true }>(`/v1/vendor/customer-photos/${id}`, json('PATCH', { hidden })),
  },

  reviews: {
    list: () => authRequest<{ reviews: VendorReview[] }>('/v1/vendor/reviews'),
    reply: (id: string, body: string) => authRequest<{ ok: true }>(`/v1/vendor/reviews/${id}/reply`, json('PUT', { body })),
    deleteReply: (id: string) => authRequest<{ ok: true }>(`/v1/vendor/reviews/${id}/reply`, json('DELETE')),
  },

  blocks: {
    list: () => authRequest<{ blocks: Block[] }>('/v1/vendor/blocks'),
    add: (input: BlockInput) => authRequest<{ ok: true }>('/v1/vendor/blocks', json('POST', input)),
    remove: (id: string) => authRequest<{ ok: true }>(`/v1/vendor/blocks/${encodeURIComponent(id)}`, json('DELETE')),
  },
};
