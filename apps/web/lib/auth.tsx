"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  AuthResponse,
  GoLiveInput,
  LiveStatus,
  Me,
  MenuItemInput,
  MyVendor,
  QuickStartInput,
  RegisterInput,
  StatusPostInput,
  VendorProfileUpdate,
  WriteResult,
} from "@streeteats/shared";
import { API_URL, ApiRequestError } from "./api";

/**
 * Browser session: the refresh token is an httpOnly cookie the page can't
 * read; the short-lived access token lives only in memory. Every cookie
 * request carries X-Requested-With, which the API requires (CSRF guard).
 */

let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;

async function raw<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-requested-with", "streeteats");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
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

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) await refresh();
  try {
    return await raw<T>(path, init, accessToken);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401 && (await refresh())) return raw<T>(path, init, accessToken);
    throw err;
  }
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const vendorApi = {
  me: () => authed<MyVendor>("/v1/vendor/me"),
  quickStart: (input: QuickStartInput) => authed<MyVendor>("/v1/vendor/quick-start", json("POST", input)),
  update: (patch: VendorProfileUpdate) => authed<MyVendor>("/v1/vendor/me", json("PATCH", patch)),
  live: {
    status: () => authed<LiveStatus>("/v1/vendor/live"),
    // Exact coordinates go only to our API, which fuzzes them before storing.
    start: (input: GoLiveInput) => authed<LiveStatus>("/v1/vendor/live", json("POST", input)),
    heartbeat: (location: { lat: number; lng: number }) => authed<LiveStatus>("/v1/vendor/live/heartbeat", json("POST", { location })),
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
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthValue["status"]>("loading");

  useEffect(() => {
    void refresh().then((r) => {
      setMe(r?.user ?? null);
      setStatus(r ? "signedIn" : "signedOut");
    });
  }, []);

  const adopt = useCallback((r: AuthResponse) => {
    accessToken = r.accessToken;
    setMe(r.user);
    setStatus("signedIn");
    return r.user;
  }, []);

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
        setMe(null);
        setStatus("signedOut");
      },
    }),
    [status, me, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
