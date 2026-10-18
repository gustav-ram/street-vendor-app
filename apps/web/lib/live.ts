"use client";

import { useSyncExternalStore } from "react";
import { createLiveController, type LatLng, type LiveState, type Precision } from "@streeteats/shared";
import { vendorApi } from "./auth";

/**
 * Go Live in the browser. The rules live in @streeteats/shared
 * (createLiveController); this file plugs in the browser's location, page
 * visibility and storage. Like the phone app, location is only read while
 * the page is on screen: switch tabs or close it and heartbeats stop.
 */

const SESSION_KEY = "se.liveSession";
const SERVER_STATE: LiveState = { phase: "unknown", status: null, lastOkAt: null, notice: null };

const coded = (code: string) => Object.assign(new Error(code), { code });

function position(precision: Precision): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject(coded("location_unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(coded(err.code === err.PERMISSION_DENIED ? "location_denied" : "location_unavailable")),
      { enableHighAccuracy: precision === "exact", timeout: 20_000, maximumAge: 15_000 },
    );
  });
}

// Keep a phone's screen on while live (where the browser supports it).
let wakeLock: WakeLockSentinel | null = null;
let wantAwake = false;
async function keepAwake(on: boolean) {
  wantAwake = on;
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // Not supported or not allowed: the vendor keeps the screen on themselves.
  }
}

const controller = createLiveController({
  api: vendorApi.live,
  getPosition: position,
  isForeground: () => typeof document !== "undefined" && document.visibilityState === "visible",
  // Per tab: a reload resumes; another tab or browser counts as another device.
  store: {
    get: () => {
      try {
        return sessionStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    },
    set: (startedAt) => {
      try {
        if (startedAt) sessionStorage.setItem(SESSION_KEY, startedAt);
        else sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // Storage blocked: a reload will show the session as another device's.
      }
    },
  },
  onActiveChange: (active) => void keepAwake(active),
});

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const visible = document.visibilityState === "visible";
    controller.setForeground(visible);
    // The browser drops the wake lock when the page is hidden.
    if (visible && wantAwake) void keepAwake(true);
  });
}

export function useLive(): LiveState {
  return useSyncExternalStore(controller.subscribe, controller.getState, () => SERVER_STATE);
}

export const syncLive = controller.sync;
export const goLive = controller.goLive;
export const takeOver = controller.takeOver;
export const goOffline = controller.goOffline;
export const dismissNotice = controller.dismissNotice;
export const isLiveHere = () => {
  const { phase } = controller.getState();
  return phase === "live" || phase === "reconnecting";
};
