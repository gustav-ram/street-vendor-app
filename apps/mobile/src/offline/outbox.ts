import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  applyOne,
  createOutbox,
  type MyVendor,
  type OutboxAction,
  type OutboxItem,
  type SendResult,
  uploadBlob,
  type VendorPhotoKind,
} from '@streeteats/shared';
import { connection } from '@/api/client';
import { uploadTransport } from '@/api/community';
import { vendorApi } from '@/api/vendor';
import { readPhoto } from '@/lib/photos';
import { MY_VENDOR_KEY, queryClient } from '@/lib/queryClient';

/**
 * The vendor's offline outbox on the phone (PLAN.md §6.4). Every change a
 * vendor makes (menu, sold out, updates, "where I'll be", photos) is saved
 * here first, shown at once, and sent when there's signal: right away if
 * possible, otherwise when the connection comes back, when the app returns
 * to the foreground, or on a backoff timer. The queue logic itself lives in
 * @streeteats/shared (outbox/core.ts) and is unit-tested there.
 */

const STORE_KEY = 'outbox.v1';
const SIM_KEY = 'dev.simulateOffline';
const photoDir = () => new Directory(Paths.document, 'outbox-photos');

const coded = (code: string) => Object.assign(new Error(code), { code });

async function send(item: OutboxItem, remember: (patch: Record<string, unknown>) => Promise<void>): Promise<SendResult> {
  const a = item.action;
  switch (a.type) {
    case 'menu.put':
      return (await vendorApi.menu.put(a.entityId, a.payload)).result;
    case 'menu.soldOut':
      return (await vendorApi.menu.soldOut(a.entityId, a.payload.soldOut, a.payload.clientUpdatedAt)).result;
    case 'menu.delete':
      return (await vendorApi.menu.remove(a.entityId, a.payload.clientUpdatedAt)).result;
    case 'status.put':
      return (await vendorApi.status.put(a.entityId, a.payload)).result;
    case 'status.delete':
      return (await vendorApi.status.remove(a.entityId, a.payload.clientUpdatedAt)).result;
    case 'upcoming.put':
      return (await vendorApi.upcoming.put(a.entityId, a.payload)).result;
    case 'upcoming.delete':
      return (await vendorApi.upcoming.remove(a.entityId, a.payload.clientUpdatedAt)).result;
    case 'photo.add': {
      const file = new File(a.payload.fileUri);
      if (!file.exists) throw coded('not_found');
      const blob = await readPhoto(file.uri);
      // One quick retry here; longer outages are the outbox's backoff. The
      // upload id is saved, so after a restart the upload carries on.
      const uploadId = await uploadBlob(uploadTransport, blob, a.payload.contentType, {
        retries: 1,
        uploadId: a.payload.uploadId,
        onCreated: (id) => remember({ uploadId: id }),
      });
      await vendorApi.photos.add(uploadId, a.payload.kind, a.payload.caption, a.entityId);
      removeFile(a.payload.fileUri);
      return 'applied';
    }
  }
}

function removeFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

export const outbox = createOutbox({
  load: () => {
    try {
      const raw = Storage.getItemSync(STORE_KEY);
      return raw ? (JSON.parse(raw) as OutboxItem[]) : null;
    } catch {
      return null;
    }
  },
  save: (items) => {
    try {
      Storage.setItemSync(STORE_KEY, JSON.stringify(items));
    } catch {
      // Kept in memory until the next save.
    }
  },
  newId: randomUUID,
  send,
  onSettled: (item, result) => {
    // Show the server's answer right away instead of waiting for a refetch.
    if (result === 'applied') queryClient.setQueryData<MyVendor>(MY_VENDOR_KEY, (v) => (v ? applyOne(v, item) : v));
  },
});

// ---------------------------------------------------------------- sync driver

let timer: ReturnType<typeof setTimeout> | null = null;
let lastForced = 0;

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  const at = outbox.nextAttemptAt();
  if (at === null) return;
  timer = setTimeout(() => kick(false), Math.max(500, at - Date.now()));
}

/** Sends what's due (or everything queued, when `force`), then refreshes what the screens show. */
function kick(force: boolean) {
  if (force) lastForced = Date.now();
  void outbox.flush({ force }).then((r) => {
    if (r.applied + r.superseded + r.failed > 0) {
      void queryClient.invalidateQueries({ queryKey: MY_VENDOR_KEY });
      void queryClient.invalidateQueries({ queryKey: ['myPhotos'] });
      void queryClient.invalidateQueries({ queryKey: ['verification'] });
    }
    scheduleNext();
  });
}

export const syncNow = () => kick(true);

/** Starts syncing: on reconnect, on returning to the app, after any request reaches the server, and on a timer. */
export function startSync() {
  try {
    connection.simulateOffline = __DEV__ && Storage.getItemSync(SIM_KEY) === 'true';
  } catch {
    // Off.
  }
  const net = NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) kick(true);
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') kick(true);
  });
  // Something reached the server, so the signal is back. Throttled so a
  // server error can't turn into a tight retry loop.
  connection.onReachable = () => {
    if (outbox.nextAttemptAt() !== null && Date.now() - lastForced > 15_000) kick(true);
  };
  void outbox.ready().then(() => kick(false));
  return () => {
    net();
    app.remove();
    connection.onReachable = null;
    if (timer) clearTimeout(timer);
  };
}

// ---------------------------------------------------------------- actions for screens

/** Queues a change and tries to send it straight away. */
export async function enqueue(action: OutboxAction) {
  await outbox.enqueue(action);
  kick(false);
}

/**
 * Keeps a copy of the (already compressed) photo in the app's own folder,
 * where iOS won't clear it, and queues the upload.
 */
export async function queuePhoto(uri: string, kind: VendorPhotoKind, caption?: string) {
  const id = randomUUID();
  const dir = photoDir();
  dir.create({ intermediates: true, idempotent: true });
  const copy = new File(dir, `${id}.jpg`);
  await new File(uri).copy(copy);
  await enqueue({ type: 'photo.add', entityId: id, payload: { fileUri: copy.uri, contentType: 'image/jpeg', kind, caption: caption || undefined } });
}

export async function dismissIssue(item: OutboxItem) {
  if (item.action.type === 'photo.add') removeFile(item.action.payload.fileUri);
  await outbox.dismiss(item.id);
}

export async function retryIssue(id: string) {
  await outbox.retry(id);
  kick(true);
}

/** Signing out on a shared phone: drop queued changes and the photos waiting with them. */
export async function clearOutbox() {
  await outbox.clear();
  try {
    const dir = photoDir();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to delete.
  }
}

// ---------------------------------------------------------------- hooks

export function useOutboxItems() {
  return useSyncExternalStore(outbox.subscribe, outbox.items);
}

export function useSyncSummary() {
  const items = useOutboxItems();
  return {
    pending: items.filter((i) => i.state === 'pending').length,
    issues: items.filter((i) => i.state !== 'pending').length,
  };
}

// The developer "no signal" switch, as a tiny store so screens update when it flips.
const simListeners = new Set<() => void>();
export function setSimulateOffline(on: boolean) {
  connection.simulateOffline = on;
  try {
    Storage.setItemSync(SIM_KEY, String(on));
  } catch {
    // In memory only.
  }
  simListeners.forEach((l) => l());
  if (!on) kick(true);
}
export function useSimulateOffline() {
  return useSyncExternalStore(
    (l) => {
      simListeners.add(l);
      return () => simListeners.delete(l);
    },
    () => connection.simulateOffline,
  );
}

/** False when the phone has no connection (or "Simulate no signal" is on). */
export function useOnline() {
  const net = useNetInfo();
  const simulated = useSimulateOffline();
  return !simulated && net.isConnected !== false && net.isInternetReachable !== false;
}
