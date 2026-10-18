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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-client': 'mobile' };
  if (init.body) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch {
    throw new ApiRequestError('network', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(body?.error?.code ?? 'internal', res.status);
  return body as T;
}

export const api = {
  // POST so the (already coarsened) location never lands in a URL.
  search: (body: SearchRequest) => request<SearchResponse>('/v1/search', { method: 'POST', body: JSON.stringify(body) }),
  vendor: (id: string) => request<VendorProfile>(`/v1/vendors/${encodeURIComponent(id)}`),
  event: (id: string, type: 'profile_view' | 'directions') =>
    request<void>(`/v1/vendors/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ type }) }),
};
