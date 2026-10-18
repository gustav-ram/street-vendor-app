"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  type AdminReport,
  type AdminVendor,
  type AuthResponse,
  type Block,
  type BlockInput,
  type Favorite,
  type GoLiveInput,
  type HeartbeatInput,
  type LatLng,
  type LiveStatus,
  type Me,
  type MenuItemInput,
  type ModerationQueue,
  type MyPhotos,
  type MyReview,
  type MyVendor,
  type QuickStartInput,
  type RegisterInput,
  type ReportInput,
  type ReportStatus,
  type ReviewInput,
  type ScheduleInput,
  type StatusPostInput,
  type StillHereResult,
  type UpcomingPostInput,
  type UploadContentType,
  type UploadState,
  type UploadTransport,
  uploadBlob,
  type VendorPhotoKind,
  type VendorProfileUpdate,
  type VendorReview,
  type VerificationDecision,
  type VerificationProgress,
  type VerificationStatus,
  type ViewerState,
  type WriteResult,
} from "@streeteats/shared";
import { API_URL, ApiRequestError } from "./api";

/**
 * Browser session: the refresh token is an httpOnly cookie the page can't
 * read; the short-lived access token lives only in memory. Every cookie
 * request carries X-Requested-With, which the API requires (CSRF guard).
 */

let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;

async function rawResponse(path: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-requested-with", "streeteats");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiRequestError("network", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiRequestError(body?.error?.code ?? "internal", res.status);
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return (await res.json().catch(() => null)) as T;
}

const raw = async <T,>(path: string, init: RequestInit = {}, token?: string | null) => parse<T>(await rawResponse(path, init, token));

function refresh(): Promise<AuthResponse | null> {
  refreshing ??= raw<AuthResponse>("/v1/auth/refresh", { method: "POST" })
    .then((r) => {
      accessToken = r.accessToken;
      return r;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function authedResponse(path: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken) await refresh();
  try {
    return await rawResponse(path, init, accessToken);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401 && (await refresh())) return rawResponse(path, init, accessToken);
    throw err;
  }
}

const authed = async <T,>(path: string, init: RequestInit = {}) => parse<T>(await authedResponse(path, init));

/** React Query key for the signed-in vendor's own business. */
export const MY_VENDOR_KEY = ["myVendor"] as const;

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// Resumable photo uploads (see @streeteats/shared uploadBlob).
const uploadTransport: UploadTransport = {
  create: (input) => authed<UploadState>("/v1/uploads", json("POST", input)),
  offset: async (id) => Number((await authedResponse(`/v1/uploads/${id}`, { method: "HEAD" })).headers.get("upload-offset") ?? 0),
  send: (id, offset, chunk) =>
    authed<UploadState>(`/v1/uploads/${id}`, {
      method: "PATCH",
      body: chunk,
      headers: { "upload-offset": String(offset), "content-type": "application/offset+octet-stream" },
    }),
};

/** A photo that isn't public (pending, or hidden by the vendor) as a temporary object URL. */
async function privatePhotoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  const res = await authedResponse(`/v1/photos/${photoId}/image?size=${size}`);
  return URL.createObjectURL(await res.blob());
}

type Ok = { ok: true };

/** A signed-in person on a vendor's page. */
export const communityApi = {
  viewer: (vendorId: string) => authed<ViewerState>(`/v1/vendors/${vendorId}/viewer`),
  favorite: (vendorId: string, notifyOnOpen: boolean) => authed<Ok>(`/v1/vendors/${vendorId}/favorite`, json("PUT", { notifyOnOpen })),
  unfavorite: (vendorId: string) => authed<Ok>(`/v1/vendors/${vendorId}/favorite`, json("DELETE")),
  favorites: () => authed<{ favorites: Favorite[] }>("/v1/me/favorites"),
  review: (vendorId: string, input: ReviewInput) => authed<MyReview>(`/v1/vendors/${vendorId}/review`, json("PUT", input)),
  deleteReview: (vendorId: string) => authed<Ok>(`/v1/vendors/${vendorId}/review`, json("DELETE")),
  // The location is checked against the vendor's public point and never stored.
  stillHere: (vendorId: string, location: LatLng) =>
    authed<StillHereResult>(`/v1/vendors/${vendorId}/still-here`, json("POST", { location })),
  report: (input: ReportInput) => authed<{ status: "received" }>("/v1/reports", json("POST", input)),
  upload: (file: Blob, type: UploadContentType, onProgress?: (f: number) => void) => uploadBlob(uploadTransport, file, type, { onProgress }),
  addPhoto: (vendorId: string, uploadId: string, caption?: string) =>
    authed<{ id: string; moderation: string }>(`/v1/vendors/${vendorId}/photos`, json("POST", { uploadId, caption })),
};

export const adminApi = {
  queue: () => authed<ModerationQueue>("/v1/admin/moderation"),
  decide: (kind: "photo" | "review", id: string, decision: "approved" | "rejected") =>
    authed<Ok>(`/v1/admin/moderation/${kind}/${id}`, json("POST", { decision })),
  reports: (status: ReportStatus = "open") => authed<{ reports: AdminReport[] }>(`/v1/admin/reports?status=${status}`),
  decideReport: (id: string, status: "dismissed" | "upheld" | "resolved", adminNote?: string) =>
    authed<Ok>(`/v1/admin/reports/${id}`, json("POST", { status, adminNote })),
  photoUrl: privatePhotoUrl,
  vendors: (q?: string, status?: VerificationStatus) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    return authed<{ vendors: AdminVendor[] }>(`/v1/admin/vendors?${params}`);
  },
  decideVerification: (vendorId: string, decision: VerificationDecision) =>
    authed<VerificationProgress>(`/v1/admin/vendors/${vendorId}/verification`, json("POST", decision)),
};

export const vendorApi = {
  me: () => authed<MyVendor>("/v1/vendor/me"),
  quickStart: (input: QuickStartInput) => authed<MyVendor>("/v1/vendor/quick-start", json("POST", input)),
  update: (patch: VendorProfileUpdate) => authed<MyVendor>("/v1/vendor/me", json("PATCH", patch)),
  live: {
    status: () => authed<LiveStatus>("/v1/vendor/live"),
    // Exact coordinates go only to our API, which fuzzes them before storing.
    start: (input: GoLiveInput) => authed<LiveStatus>("/v1/vendor/live", json("POST", input)),
    heartbeat: (input: HeartbeatInput) => authed<LiveStatus>("/v1/vendor/live/heartbeat", json("POST", input)),
    end: () => authed<LiveStatus>("/v1/vendor/live", json("DELETE")),
  },
  menu: {
    put: (id: string, item: MenuItemInput) => authed<WriteResult>(`/v1/vendor/menu/${id}`, json("PUT", item)),
    soldOut: (id: string, soldOut: boolean) =>
      authed<WriteResult>(`/v1/vendor/menu/${id}/sold-out`, json("PUT", { soldOut, clientUpdatedAt: new Date().toISOString() })),
    remove: (id: string) => authed<WriteResult>(`/v1/vendor/menu/${id}`, json("DELETE", { clientUpdatedAt: new Date().toISOString() })),
  },
  status: {
    put: (id: string, post: StatusPostInput) => authed<WriteResult>(`/v1/vendor/status/${id}`, json("PUT", post)),
    remove: (id: string) => authed<WriteResult>(`/v1/vendor/status/${id}`, json("DELETE", { clientUpdatedAt: new Date().toISOString() })),
  },
  upcoming: {
    // The spot goes only to our API, which fuzzes it before storing (unless the vendor picked "exact").
    put: (id: string, post: UpcomingPostInput) => authed<WriteResult>(`/v1/vendor/upcoming/${id}`, json("PUT", post)),
    remove: (id: string) => authed<WriteResult>(`/v1/vendor/upcoming/${id}`, json("DELETE", { clientUpdatedAt: new Date().toISOString() })),
  },
  schedule: (input: ScheduleInput) => authed<MyVendor>("/v1/vendor/schedule", json("PUT", input)),
  verification: () => authed<VerificationProgress>("/v1/vendor/verification"),
  photos: {
    list: () => authed<MyPhotos>("/v1/vendor/photos"),
    add: (uploadId: string, kind: VendorPhotoKind, caption?: string) =>
      authed<{ id: string }>("/v1/vendor/photos", json("POST", { uploadId, kind, caption })),
    remove: (id: string) => authed<Ok>(`/v1/vendor/photos/${id}`, json("DELETE")),
    hide: (id: string, hidden: boolean) => authed<Ok>(`/v1/vendor/customer-photos/${id}`, json("PATCH", { hidden })),
    privateUrl: privatePhotoUrl,
  },
  reviews: {
    list: () => authed<{ reviews: VendorReview[] }>("/v1/vendor/reviews"),
    reply: (id: string, body: string) => authed<Ok>(`/v1/vendor/reviews/${id}/reply`, json("PUT", { body })),
    deleteReply: (id: string) => authed<Ok>(`/v1/vendor/reviews/${id}/reply`, json("DELETE")),
  },
  blocks: {
    list: () => authed<{ blocks: Block[] }>("/v1/vendor/blocks"),
    add: (input: BlockInput) => authed<Ok>("/v1/vendor/blocks", json("POST", input)),
    remove: (id: string) => authed<Ok>(`/v1/vendor/blocks/${encodeURIComponent(id)}`, json("DELETE")),
  },
};

interface AuthValue {
  status: "loading" | "signedIn" | "signedOut";
  me: Me | null;
  signIn: (identifier: { email?: string; phone?: string }, secret: string) => Promise<Me>;
  signUp: (input: RegisterInput) => Promise<Me>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthValue["status"]>("loading");

  useEffect(() => {
    void refresh().then((r) => {
      setMe(r?.user ?? null);
      setStatus(r ? "signedIn" : "signedOut");
    });
  }, []);

  const adopt = useCallback(
    (r: AuthResponse) => {
      queryClient.removeQueries({ queryKey: MY_VENDOR_KEY });
      accessToken = r.accessToken;
      setMe(r.user);
      setStatus("signedIn");
      return r.user;
    },
    [queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      signIn: async (identifier, secret) =>
        adopt(await raw<AuthResponse>("/v1/auth/login", json("POST", { ...identifier, secret }))),
      signUp: async (input) => adopt(await raw<AuthResponse>("/v1/auth/register", json("POST", input))),
      signOut: async () => {
        await raw("/v1/auth/logout", { method: "POST" }).catch(() => {});
        accessToken = null;
        queryClient.removeQueries({ queryKey: MY_VENDOR_KEY });
        setMe(null);
        setStatus("signedOut");
      },
    }),
    [status, me, adopt, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
