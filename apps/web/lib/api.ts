import type { ErrorCode, SearchRequest, SearchResponse, VendorProfile } from "@streeteats/shared";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    readonly status: number,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiRequestError("network", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(body?.error?.code ?? "internal", res.status);
  return body as T;
}

export const api = {
  // POST so the (already coarsened) location stays out of URLs and history.
  search: (body: SearchRequest) => request<SearchResponse>("/v1/search", { method: "POST", body: JSON.stringify(body) }),
  vendor: (id: string) => request<VendorProfile>(`/v1/vendors/${encodeURIComponent(id)}`),
  event: (id: string, type: "profile_view" | "directions") =>
    request<void>(`/v1/vendors/${encodeURIComponent(id)}/events`, { method: "POST", body: JSON.stringify({ type }) }),
};
