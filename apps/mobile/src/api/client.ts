import type { ErrorCode, SearchRequest, SearchResponse, VendorProfile } from '@streeteats/shared';
import { API_URL } from '@/config';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | 'network',
    readonly status: number,
  ) {
    super(code);
  }
}

/**
 * Connection state as the app sees it. `simulateOffline` is a developer
 * switch (Settings, dev builds only) that makes every request fail as if
 * there were no signal, to try the offline mode without touching Wi-Fi.
 */
export const connection = {
  simulateOffline: false,
  /** Called after any request gets an answer from the server (so the outbox can flush). */
  onReachable: null as null | (() => void),
};

/** The raw response (for headers such as Upload-Offset); throws ApiRequestError when it isn't OK. */
export async function rawRequest(path: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  if (connection.simulateOffline) throw new ApiRequestError('network', 0);
  const headers: Record<string, string> = { 'x-client': 'mobile' };
  if (init.body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch {
    throw new ApiRequestError('network', 0);
  }
  connection.onReachable?.();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiRequestError(body?.error?.code ?? 'internal', res.status);
  }
  return res;
}

export async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await rawRequest(path, init, token);
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => null)) as T;
}

export const api = {
  // POST so the (already coarsened) location never lands in a URL.
  search: (body: SearchRequest) => request<SearchResponse>('/v1/search', { method: 'POST', body: JSON.stringify(body) }),
  vendor: (id: string) => request<VendorProfile>(`/v1/vendors/${encodeURIComponent(id)}`),
  event: (id: string, type: 'profile_view' | 'directions') =>
    request<void>(`/v1/vendors/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ type }) }),
};
