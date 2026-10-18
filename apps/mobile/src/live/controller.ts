import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { createLiveController, type LiveState, type Precision } from '@streeteats/shared';
import { vendorApi } from '@/api/vendor';

/**
 * Go Live on the phone. The rules live in @streeteats/shared (createLiveController);
 * this file only plugs in the phone's location, app state and storage.
 * Foreground location only: there is no background tracking.
 */

const KEEP_AWAKE_TAG = 'go-live';
const SESSION_KEY = 'se.liveSession';

const coded = (code: string) => Object.assign(new Error(code), { code });

async function position(precision: Precision) {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.status !== 'granted') throw coded('location_denied');
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: precision === 'exact' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    throw coded('location_unavailable');
  }
}

const controller = createLiveController({
  api: vendorApi.live,
  getPosition: position,
  isForeground: () => AppState.currentState === 'active',
  store: {
    get: () => {
      try {
        return Storage.getItemSync(SESSION_KEY);
      } catch {
        return null;
      }
    },
    set: (startedAt) => {
      try {
        if (startedAt) Storage.setItemSync(SESSION_KEY, startedAt);
        else Storage.removeItemSync(SESSION_KEY);
      } catch {
        // Storage unavailable: worst case this phone treats its session as another device's.
      }
    },
  },
  onActiveChange: (active) => {
    if (active) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  },
});

AppState.addEventListener('change', (next) => controller.setForeground(next === 'active'));

export function useLive(): LiveState {
  return useSyncExternalStore(controller.subscribe, controller.getState);
}

export const syncLive = controller.sync;
export const goLive = controller.goLive;
export const takeOver = controller.takeOver;
export const goOffline = controller.goOffline;
export const dismissNotice = controller.dismissNotice;
export const isLiveHere = () => {
  const { phase } = controller.getState();
  return phase === 'live' || phase === 'reconnecting';
};
