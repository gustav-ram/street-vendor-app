import type { UploadContentType, VendorPhotoKind } from '../constants';
import type { MenuItemInput, StatusPostInput, UpcomingPostInput } from '../schemas/dashboard';

/**
 * The vendor app's offline outbox (PLAN.md §6.4). Pure TypeScript with
 * injected storage and transport, so it runs the same on the phone and in
 * unit tests.
 *
 * - Every vendor write is queued here first and sent in order. Creates use
 *   ids made on the phone and every change carries the time the vendor made
 *   it (clientUpdatedAt), so sending the same item twice is harmless.
 * - The server applies last-write-wins and answers "applied" or
 *   "superseded" (a newer change, maybe from another device, already won).
 * - No signal: the item stays queued and is retried with exponential
 *   backoff (2 s up to 5 min, with jitter). The queue keeps its order, so a
 *   later change to the same thing can't overtake an earlier one.
 * - Superseded items and items the server refuses for good become "sync
 *   issues" that the vendor can read, dismiss or send again.
 */

type Delete = { clientUpdatedAt: string };

export type OutboxAction =
  | { type: 'menu.put'; entityId: string; payload: MenuItemInput }
  | { type: 'menu.soldOut'; entityId: string; payload: { soldOut: boolean; clientUpdatedAt: string } }
  | { type: 'menu.delete'; entityId: string; payload: Delete }
  | { type: 'status.put'; entityId: string; payload: StatusPostInput }
  | { type: 'status.delete'; entityId: string; payload: Delete }
  | { type: 'upcoming.put'; entityId: string; payload: UpcomingPostInput }
  | { type: 'upcoming.delete'; entityId: string; payload: Delete }
  | {
      type: 'photo.add';
      /** Used as the photo's id on the server, so a retry can't add it twice. */
      entityId: string;
      payload: {
        /** A copy of the compressed photo in the app's own folder. */
        fileUri: string;
        contentType: UploadContentType;
        kind: VendorPhotoKind;
        caption?: string;
        /** The server-side upload, once created, so a restart resumes it. */
        uploadId?: string;
      };
    };

export type OutboxActionType = OutboxAction['type'];
export type OutboxState = 'pending' | 'superseded' | 'failed';

export interface OutboxItem {
  id: string;
  action: OutboxAction;
  queuedAt: string;
  attempts: number;
  /** Epoch ms; the item isn't sent before this (backoff). */
  nextAttemptAt: number;
  state: OutboxState;
  /** Error code for a failed item. */
  error?: string;
}

export type SendResult = 'applied' | 'superseded';

export interface OutboxDeps {
  load(): OutboxItem[] | null | Promise<OutboxItem[] | null>;
  save(items: readonly OutboxItem[]): void | Promise<void>;
  /**
   * Sends one item. Throw an error with a `code` (the API error code, or
   * "network") when it doesn't go through. `remember` stores extra payload
   * fields (an upload id) so a later attempt can resume.
   */
  send(item: OutboxItem, remember: (patch: Record<string, unknown>) => Promise<void>): Promise<SendResult>;
  newId(): string;
  now?: () => number;
  random?: () => number;
  /** After an item was applied, superseded or failed: refresh what the screen shows. */
  onSettled?: (item: OutboxItem, result: SendResult | 'failed') => void;
}

export interface FlushReport {
  applied: number;
  superseded: number;
  failed: number;
  /** Still queued (no signal, or waiting out a backoff). */
  waiting: number;
}

/** Codes worth retrying: the problem is the connection or the server, not the change. */
const RETRY = new Set(['network', 'internal', 'rate_limited', 'unauthorized']);
/** A server error that keeps happening would block the queue forever. */
const MAX_SERVER_ERRORS = 6;

export const BACKOFF_MIN_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** 2 s, 4 s, 8 s ... capped at 5 min, each ±20 % so phones don't retry in lockstep. */
export function backoffMs(attempts: number, random: () => number = Math.random) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

const codeOf = (err: unknown) => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'network';
};

const kindOf = (type: OutboxActionType) => type.split('.')[0];

export function createOutbox(deps: OutboxDeps) {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  let items: readonly OutboxItem[] = [];
  let inFlight: string | null = null;
  let running: Promise<FlushReport> | null = null;
  const listeners = new Set<() => void>();
  const ready = Promise.resolve(deps.load()).then((loaded) => {
    // Anything queued while loading goes after what was already saved.
    items = [...(loaded ?? []), ...items];
  });

  async function commit(next: readonly OutboxItem[]) {
    items = next;
    listeners.forEach((l) => l());
    await deps.save(items);
  }

  const update = (id: string, patch: Partial<OutboxItem>) => commit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const touchable = (i: OutboxItem, entityId: string) => i.state === 'pending' && i.id !== inFlight && i.action.entityId === entityId;

  /**
   * Queues a change. Earlier queued changes to the same thing that this one
   * makes pointless are dropped (a newer full edit or a delete), and a
   * sold-out toggle is folded into a queued edit of the same item.
   */
  async function enqueue(action: OutboxAction): Promise<string> {
    await ready;
    let next = [...items];
    const { type, entityId } = action;
    if (type === 'menu.soldOut') {
      const put = next.find((i) => touchable(i, entityId) && i.action.type === 'menu.put');
      if (put && put.action.type === 'menu.put') {
        const merged: OutboxItem = { ...put, action: { ...put.action, payload: { ...put.action.payload, ...action.payload } } };
        await commit(next.map((i) => (i.id === put.id ? merged : i)));
        return put.id;
      }
      next = next.filter((i) => !(touchable(i, entityId) && i.action.type === 'menu.soldOut'));
    } else if (type.endsWith('.put') || type.endsWith('.delete')) {
      // A full edit or a delete replaces everything still queued for that thing.
      next = next.filter((i) => !(touchable(i, entityId) && kindOf(i.action.type) === kindOf(type)));
    }
    const item: OutboxItem = { id: deps.newId(), action, queuedAt: new Date(now()).toISOString(), attempts: 0, nextAttemptAt: 0, state: 'pending' };
    await commit([...next, item]);
    return item.id;
  }

  /** Sends queued items in order until the queue is empty or the connection fails. */
  function flush(opts: { force?: boolean } = {}): Promise<FlushReport> {
    running ??= (async () => {
      await ready;
      const report: FlushReport = { applied: 0, superseded: 0, failed: 0, waiting: 0 };
      let force = opts.force ?? false;
      for (;;) {
        const item = items.find((i) => i.state === 'pending');
        if (!item || (!force && item.nextAttemptAt > now())) break;
        force = false;
        inFlight = item.id;
        try {
          const remember = async (patch: Record<string, unknown>) => {
            const current = items.find((i) => i.id === item.id);
            if (current) await update(item.id, { action: { ...current.action, payload: { ...current.action.payload, ...patch } } as OutboxAction });
          };
          const result = await deps.send(item, remember);
          inFlight = null;
          if (result === 'applied') {
            await commit(items.filter((i) => i.id !== item.id));
            report.applied++;
          } else {
            await update(item.id, { state: 'superseded' });
            report.superseded++;
          }
          deps.onSettled?.(item, result);
        } catch (err) {
          inFlight = null;
          const code = codeOf(err);
          const attempts = item.attempts + 1;
          if (RETRY.has(code) && !(code === 'internal' && attempts >= MAX_SERVER_ERRORS)) {
            await update(item.id, { attempts, nextAttemptAt: now() + backoffMs(attempts, random) });
            break;
          }
          await update(item.id, { attempts, state: 'failed', error: code });
          report.failed++;
          deps.onSettled?.(item, 'failed');
        }
      }
      report.waiting = items.filter((i) => i.state === 'pending').length;
      return report;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    ready: () => ready,
    enqueue,
    flush,
    /** The current list (a new array after every change, for React). */
    items: () => items,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** When the next queued item may be sent (epoch ms), or null if nothing is waiting. */
    nextAttemptAt(): number | null {
      const head = items.find((i) => i.state === 'pending');
      return head ? head.nextAttemptAt : null;
    },
    /** Removes a sync issue after the vendor has read it. */
    async dismiss(id: string) {
      await commit(items.filter((i) => !(i.id === id && i.state !== 'pending')));
    },
    /**
     * Queues a sync issue again. For a superseded change this means "use my
     * version": it gets a fresh time, so it wins over the newer one.
     */
    async retry(id: string) {
      const item = items.find((i) => i.id === id && i.state !== 'pending');
      if (!item) return;
      const action = (
        item.state === 'superseded' && 'clientUpdatedAt' in item.action.payload
          ? { ...item.action, payload: { ...item.action.payload, clientUpdatedAt: new Date(now()).toISOString() } }
          : item.action
      ) as OutboxAction;
      const again: OutboxItem = { ...item, action, attempts: 0, nextAttemptAt: 0, state: 'pending', error: undefined };
      await commit([...items.filter((i) => i.id !== id), again]);
    },
    /** Forgets everything (signing out on a shared phone). */
    async clear() {
      await ready;
      await commit([]);
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

/** Ids of things with a change still waiting to be sent, for "Pending sync" chips. */
export function pendingEntityIds(items: readonly OutboxItem[]): Set<string> {
  return new Set(items.filter((i) => i.state === 'pending').map((i) => i.action.entityId));
}
