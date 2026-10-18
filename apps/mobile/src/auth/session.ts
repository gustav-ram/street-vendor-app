import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import type { AuthResponse, Me, RegisterInput } from '@streeteats/shared';
import { ApiRequestError, request } from '@/api/client';

/**
 * Session handling. The refresh token lives in the iOS Keychain
 * (SecureStore); the short-lived access token only in memory. The signed-in
 * profile is cached so the vendor dashboard can open without signal.
 */

const REFRESH_KEY = 'se.refreshToken';
const ME_KEY = 'auth.me';

type Status = 'loading' | 'signedOut' | 'signedIn';
interface AuthState {
  status: Status;
  me: Me | null;
}

let state: AuthState = { status: 'loading', me: null };
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

async function adopt(res: AuthResponse) {
  accessToken = res.accessToken;
  if (res.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken);
  try {
    Storage.setItemSync(ME_KEY, JSON.stringify(res.user));
  } catch {
    // Not cached this time.
  }
  set({ status: 'signedIn', me: res.user });
}

async function clear() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  try {
    Storage.removeItemSync(ME_KEY);
  } catch {
    // Nothing cached.
  }
  set({ status: 'signedOut', me: null });
}

/** Swaps the refresh token for a new pair. One refresh at a time. */
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!token) {
      await clear();
      return false;
    }
    try {
      await adopt(await request<AuthResponse>('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: token }) }));
      return true;
    } catch (err) {
      // Offline: stay signed in with the cached profile and try again later.
      if (err instanceof ApiRequestError && err.code === 'network') return false;
      await clear();
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function initAuth() {
  const token = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
  if (!token) return set({ status: 'signedOut', me: null });
  try {
    const cached = Storage.getItemSync(ME_KEY);
    if (cached) set({ status: 'signedIn', me: JSON.parse(cached) as Me });
  } catch {
    // No cache.
  }
  await refresh();
}

export async function signIn(identifier: { email?: string; phone?: string }, secret: string) {
  await adopt(await request<AuthResponse>('/v1/auth/login', { method: 'POST', body: JSON.stringify({ ...identifier, secret }) }));
}

export async function signUp(input: RegisterInput) {
  await adopt(await request<AuthResponse>('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }));
}

export async function signOut() {
  const token = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
  if (token) await request('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) }).catch(() => {});
  await clear();
}

/** Authenticated request: refreshes once on 401 and retries. */
export async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) await refresh();
  try {
    return await request<T>(path, init, accessToken);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401 && (await refresh())) {
      return request<T>(path, init, accessToken);
    }
    throw err;
  }
}
