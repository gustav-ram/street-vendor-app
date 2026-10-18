import type {
  GoLiveInput,
  LiveStatus,
  MenuItemInput,
  MyVendor,
  QuickStartInput,
  StatusPostInput,
  VendorProfileUpdate,
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
    heartbeat: (location: { lat: number; lng: number }) => authRequest<LiveStatus>('/v1/vendor/live/heartbeat', json('POST', { location })),
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
};
