import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState, type AppStateStatus } from 'react-native';
import { useSyncExternalStore } from 'react';
import type { LiveStatus, Precision } from '@streeteats/shared';
import { ApiRequestError } from '@/api/client';
import { vendorApi } from '@/api/vendor';

/**
 * Go Live on the phone (PLAN.md §6.2).
 *
 * - Foreground only. Heartbeats stop the moment the app leaves the screen;
 *   the server then expires the session after its grace period and deletes
 *   the location. There is no background location tracking.
 * - Weak signal: a failed heartbeat shows "Reconnecting…". Customers keep
 *   seeing the vendor until the grace period ends. If the session expired
 *   while the app stayed open, it resumes on its own when signal returns,
 *   keeping the original end time.
 * - Closing with no signal: the vendor disappears within the grace period
 *   anyway; the close is retried until it reaches the server.
 */

export type Phase = 'unknown' | 'offline' | 'starting' | 'live' | 'reconnecting' | 'stopping';
export type Notice = 'autoOffline' | 'timerEnded' | 'offlinePending' | 'locationDenied' | 'vacation' | 'error' | null;

interface LiveState {
  phase: Phase;
  status: LiveStatus | null;
  lastOkAt: number | null;
  notice: Notice;
}

const RETRY_MS = 15_000;
const KEEP_AWAKE_TAG = 'go-live';

let state: LiveState = { phase: 'unknown', status: null, lastOkAt: null, notice: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** What the vendor asked for; kept so a lost session can resume as it was. */
let intent: { precision: Precision; endsAt: string } | null = null;
/** Set when the app leaves the foreground: then an expired session stays expired. */
let leftForeground = false;
let pendingEnd = false;

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (state.phase === 'live' || state.phase === 'reconnecting') void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  else void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(ms: number) {
  clearTimer();
  timer = setTimeout(() => void tick(), ms);
}

async function position(precision: Precision) {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.status !== 'granted') throw new Error('location_denied');
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: precision === 'exact' ? Location.Accuracy.High : Location.Accuracy.Balanced,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

function becameLive(status: LiveStatus) {
  set({ phase: 'live', status, lastOkAt: Date.now(), notice: null });
  schedule(status.heartbeatIntervalSec * 1000);
}

function wentOffline(notice: Notice) {
  clearTimer();
  intent = null;
  set({ phase: 'offline', status: null, notice });
}

/** Called when the dashboard loads the vendor's state from the server. */
export function syncLive(status: LiveStatus) {
  if (state.phase === 'starting' || state.phase === 'stopping') return;
  if (status.state === 'live') {
    intent ??= { precision: status.location?.precision ?? 'approximate', endsAt: status.endsAt! };
    if (state.phase !== 'live' && state.phase !== 'reconnecting') becameLive(status);
  } else if (state.phase === 'live' || state.phase === 'reconnecting') {
    wentOffline('autoOffline');
  } else {
    set({ phase: 'offline', status: null });
  }
}

export async function goLive(precision: Precision, autoOffHours: 2 | 4 | 8 | null, resumeEndsAt?: string) {
  clearTimer();
  set({ phase: 'starting', notice: null });
  try {
    const location = await position(precision);
    const status = await vendorApi.live.start({ location, precision, autoOffHours, endsAt: resumeEndsAt });
    intent = { precision, endsAt: status.endsAt! };
    leftForeground = false;
    becameLive(status);
  } catch (err) {
    intent = null;
    const code = err instanceof ApiRequestError ? err.code : err instanceof Error ? err.message : 'error';
    set({
      phase: 'offline',
      status: null,
      notice: code === 'location_denied' ? 'locationDenied' : code === 'vacation_mode' ? 'vacation' : 'error',
    });
  }
}

async function tick() {
  if (AppState.currentState !== 'active' || !intent) return;
  try {
    const location = await position(intent.precision);
    const status = await vendorApi.live.heartbeat(location);
    becameLive(status);
  } catch (err) {
    const code = err instanceof ApiRequestError ? err.code : 'network';
    if (code === 'not_live') {
      // The session expired. Resume only if the app never left the screen
      // and the vendor's chosen end time hasn't passed.
      const canResume = intent && !leftForeground && new Date(intent.endsAt).getTime() > Date.now();
      if (canResume) return goLive(intent!.precision, null, intent!.endsAt);
      const timerUp = intent && new Date(intent.endsAt).getTime() <= Date.now();
      return wentOffline(timerUp ? 'timerEnded' : 'autoOffline');
    }
    if (code === 'network' || code === 'internal') {
      set({ phase: 'reconnecting' });
      return schedule(RETRY_MS);
    }
    wentOffline('error');
  }
}

export async function goOffline() {
  clearTimer();
  intent = null;
  set({ phase: 'stopping' });
  try {
    await vendorApi.live.end();
    pendingEnd = false;
    set({ phase: 'offline', status: null, notice: null });
  } catch {
    // No signal: the server drops us after the grace period anyway, but
    // keep trying so it happens sooner.
    pendingEnd = true;
    set({ phase: 'offline', status: null, notice: 'offlinePending' });
    retryEnd();
  }
}

function retryEnd() {
  setTimeout(() => {
    if (!pendingEnd || intent) return;
    vendorApi.live
      .end()
      .then(() => {
        pendingEnd = false;
        if (state.notice === 'offlinePending') set({ notice: null });
      })
      .catch(retryEnd);
  }, RETRY_MS);
}

function onAppState(next: AppStateStatus) {
  if (next !== 'active') {
    // No background location: stop sending. The server expires us on its own.
    if (intent) leftForeground = true;
    clearTimer();
    return;
  }
  if (!intent) return;
  // Back on screen: ask the server whether we're still live.
  vendorApi.live
    .status()
    .then((status) => {
      if (status.state === 'live') {
        leftForeground = false;
        becameLive(status);
        void tick();
      } else {
        wentOffline('autoOffline');
      }
    })
    .catch(() => {
      set({ phase: 'reconnecting' });
      schedule(RETRY_MS);
    });
}

AppState.addEventListener('change', onAppState);

export function dismissNotice() {
  set({ notice: null });
}
