import type { LatLng } from '../geo/round';
import type { GoLiveInput, HeartbeatInput, LiveStatus } from '../schemas/dashboard';
import type { Precision } from '../constants';

/**
 * Go Live on a vendor's device (PLAN.md §6.2), shared by the iOS app and the
 * website. Each platform supplies location, visibility and storage.
 *
 * - Foreground only. Heartbeats stop the moment the app or page is hidden;
 *   the server then expires the session after its grace period and deletes
 *   the location. Coming back after that never restarts on its own.
 * - Weak signal: a failed heartbeat shows "Reconnecting…". Customers keep
 *   seeing the vendor until the grace period ends. If the session expired
 *   while the screen stayed on, it resumes when signal returns, keeping the
 *   original end time.
 * - One device at a time. A device only heartbeats the session it started
 *   (remembered across reloads). A session opened on another device is shown
 *   but never touched: this device doesn't even read its own location unless
 *   the vendor explicitly moves the session here.
 * - Closing with no signal: the vendor disappears within the grace period
 *   anyway; the close is retried until it reaches the server.
 */

export type LivePhase = 'unknown' | 'offline' | 'starting' | 'live' | 'reconnecting' | 'stopping' | 'elsewhere';
export type LiveNotice =
  | 'autoOffline'
  | 'timerEnded'
  | 'offlinePending'
  | 'locationDenied'
  | 'locationUnavailable'
  | 'vacation'
  | 'error'
  | null;

export interface LiveState {
  phase: LivePhase;
  /** Exactly what customers see, from the server. */
  status: LiveStatus | null;
  /** When the server last confirmed this device's session (ms epoch). */
  lastOkAt: number | null;
  notice: LiveNotice;
}

export type AutoOffHours = 2 | 4 | 8 | null;

export interface LiveControllerDeps {
  api: {
    status(): Promise<LiveStatus>;
    start(input: GoLiveInput): Promise<LiveStatus>;
    heartbeat(input: HeartbeatInput): Promise<LiveStatus>;
    end(): Promise<unknown>;
  };
  /**
   * Current position. Throw an error with `code: 'location_denied'` or
   * `'location_unavailable'` when it can't be read.
   */
  getPosition(precision: Precision): Promise<LatLng>;
  isForeground(): boolean;
  /** Remembers the startedAt of the session this device opened. */
  store: { get(): string | null; set(startedAt: string | null): void };
  /** Live or reconnecting: keep the screen on. */
  onActiveChange?(active: boolean): void;
  retryMs?: number;
  /** How often to re-check a session that's live on another device. */
  elsewhereCheckMs?: number;
}

export interface LiveController {
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  /** Feed the status the dashboard loaded. It may be stale; conflicts are re-checked. */
  sync(status: LiveStatus): void;
  goLive(precision: Precision, autoOffHours: AutoOffHours): Promise<void>;
  /** Move a session that's live on another device to this one (asks for location). */
  takeOver(precision: Precision): Promise<void>;
  goOffline(): Promise<void>;
  /** Call when the app or page is shown or hidden. */
  setForeground(active: boolean): void;
  dismissNotice(): void;
}

const INITIAL: LiveState = { phase: 'unknown', status: null, lastOkAt: null, notice: null };

export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'network';
}

export function createLiveController(deps: LiveControllerDeps): LiveController {
  const retryMs = deps.retryMs ?? 15_000;
  const elsewhereCheckMs = deps.elsewhereCheckMs ?? 60_000;
  let state: LiveState = INITIAL;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The session this device runs: what the vendor asked for, so a lost one resumes as it was. */
  let mine: { precision: Precision; endsAt: string; startedAt: string } | null = null;
  /** Set when the app leaves the foreground: then an expired session stays expired. */
  let leftForeground = false;
  let pendingEnd = false;
  /** Bumped by every start/close, so a late reply from an older request is ignored. */
  let generation = 0;
  let wasActive = false;

  function set(patch: Partial<LiveState>) {
    state = { ...state, ...patch };
    const active = state.phase === 'live' || state.phase === 'reconnecting';
    if (active !== wasActive) {
      wasActive = active;
      deps.onActiveChange?.(active);
    }
    listeners.forEach((l) => l());
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number, fn: () => void) {
    clearTimer();
    timer = setTimeout(fn, ms);
  }

  function claim(status: LiveStatus, precision: Precision) {
    mine = { precision, endsAt: status.endsAt!, startedAt: status.startedAt! };
    deps.store.set(status.startedAt);
  }

  function release() {
    mine = null;
    deps.store.set(null);
  }

  function isMine(status: LiveStatus) {
    return status.startedAt !== null && status.startedAt === (mine?.startedAt ?? deps.store.get());
  }

  function becameLive(status: LiveStatus) {
    set({ phase: 'live', status, lastOkAt: Date.now(), notice: null });
    schedule(status.heartbeatIntervalSec * 1000, () => void tick());
  }

  function wentOffline(notice: LiveNotice) {
    clearTimer();
    release();
    set({ phase: 'offline', status: null, notice });
  }

  function elsewhere(status: LiveStatus) {
    clearTimer();
    release();
    set({ phase: 'elsewhere', status });
    if (deps.isForeground()) schedule(elsewhereCheckMs, () => void refresh());
  }

  const timeUp = () => mine !== null && new Date(mine.endsAt).getTime() <= Date.now();

  /** Applies a fresh status from the server. */
  function apply(status: LiveStatus) {
    if (status.state === 'live') {
      if (!isMine(status)) return elsewhere(status);
      const resumed = !mine;
      mine ??= { precision: status.location?.precision ?? 'approximate', endsAt: status.endsAt!, startedAt: status.startedAt! };
      if (state.phase !== 'live' && state.phase !== 'reconnecting') becameLive(status);
      // Reloaded or reopened while live on this device: refresh the pin now.
      if (resumed && deps.isForeground()) void tick();
      return;
    }
    if (state.phase === 'live' || state.phase === 'reconnecting') return wentOffline(timeUp() ? 'timerEnded' : 'autoOffline');
    clearTimer();
    release();
    set({ phase: 'offline', status: null });
  }

  async function refresh() {
    const gen = generation;
    try {
      const status = await deps.api.status();
      if (gen === generation) apply(status);
    } catch {
      if (gen !== generation) return;
      if (state.phase === 'live' || state.phase === 'reconnecting') {
        set({ phase: 'reconnecting' });
        schedule(retryMs, () => void tick());
      } else if (state.phase === 'elsewhere') {
        if (deps.isForeground()) schedule(elsewhereCheckMs, () => void refresh());
      } else if (state.phase === 'unknown') {
        set({ phase: 'offline', notice: 'error' });
      }
    }
  }

  async function start(precision: Precision, autoOffHours: AutoOffHours, resumeEndsAt?: string) {
    const gen = ++generation;
    const before = state;
    clearTimer();
    set({ phase: 'starting', notice: null });
    try {
      const location = await deps.getPosition(precision);
      const status = await deps.api.start({ location, precision, autoOffHours, endsAt: resumeEndsAt });
      if (gen !== generation) return;
      claim(status, precision);
      leftForeground = false;
      pendingEnd = false;
      becameLive(status);
    } catch (err) {
      if (gen !== generation) return;
      const code = errorCode(err);
      const notice: LiveNotice =
        code === 'location_denied'
          ? 'locationDenied'
          : code === 'location_unavailable'
            ? 'locationUnavailable'
            : code === 'vacation_mode'
              ? 'vacation'
              : 'error';
      if (before.phase === 'elsewhere') {
        set({ phase: 'elsewhere', status: before.status, notice });
        if (deps.isForeground()) schedule(elsewhereCheckMs, () => void refresh());
      } else {
        release();
        set({ phase: 'offline', status: null, notice });
      }
    }
  }

  async function tick() {
    const session = mine;
    if (!session || !deps.isForeground()) return;
    const gen = generation;
    try {
      const location = await deps.getPosition(session.precision);
      const status = await deps.api.heartbeat({ location, startedAt: session.startedAt });
      if (gen !== generation || mine !== session) return;
      // A heartbeat that crossed paths with leaving the screen: keep it, but don't schedule more.
      if (!deps.isForeground()) return set({ phase: 'live', status, lastOkAt: Date.now() });
      becameLive(status);
    } catch (err) {
      if (gen !== generation || mine !== session) return;
      const code = errorCode(err);
      if (code === 'not_live') {
        // Expired. Resume only if the screen never went away and the end time hasn't passed.
        if (!leftForeground && !timeUp()) return start(session.precision, null, session.endsAt);
        return wentOffline(timeUp() ? 'timerEnded' : 'autoOffline');
      }
      if (code === 'live_elsewhere') {
        // Another device went live for this stand: stop here and show theirs.
        elsewhere(state.status!);
        return void refresh();
      }
      if (code === 'location_denied') {
        // Location was turned off mid-session: close rather than leave a stale pin up.
        await close();
        return set({ notice: 'locationDenied' });
      }
      if (code === 'network' || code === 'internal' || code === 'rate_limited' || code === 'location_unavailable') {
        set({ phase: 'reconnecting' });
        return schedule(retryMs, () => void tick());
      }
      wentOffline('error');
    }
  }

  async function close() {
    generation++;
    clearTimer();
    release();
    set({ phase: 'stopping' });
    try {
      await deps.api.end();
      pendingEnd = false;
      set({ phase: 'offline', status: null, notice: null });
    } catch {
      // No signal: the server drops us after the grace period anyway, but keep trying so it happens sooner.
      pendingEnd = true;
      set({ phase: 'offline', status: null, notice: 'offlinePending' });
      retryEnd();
    }
  }

  function retryEnd() {
    setTimeout(() => {
      if (!pendingEnd || mine) return;
      deps.api
        .end()
        .then(() => {
          pendingEnd = false;
          if (state.notice === 'offlinePending') set({ notice: null });
        })
        .catch(retryEnd);
    }, retryMs);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync(status) {
      if (state.phase === 'starting' || state.phase === 'stopping') return;
      if (state.phase === 'unknown') return apply(status);
      const live = state.phase === 'live' || state.phase === 'reconnecting';
      const agrees =
        status.state === 'live'
          ? live
            ? status.startedAt === mine?.startedAt
            : state.phase === 'elsewhere' && status.startedAt === state.status?.startedAt
          : !live && state.phase !== 'elsewhere';
      if (!agrees) void refresh();
    },
    goLive: (precision, autoOffHours) => start(precision, autoOffHours),
    takeOver: (precision) => start(precision, null, state.status?.endsAt ?? undefined),
    goOffline: close,
    setForeground(active) {
      if (!active) {
        if (mine) leftForeground = true;
        clearTimer();
        return;
      }
      if (state.phase === 'elsewhere') return void refresh();
      if (!mine) return;
      // Back on screen: ask the server whether we're still live.
      const gen = generation;
      const session = mine;
      deps.api
        .status()
        .then((status) => {
          if (gen !== generation || mine !== session) return;
          if (status.state === 'live' && status.startedAt === session.startedAt) {
            leftForeground = false;
            becameLive(status);
            void tick();
          } else {
            apply(status);
          }
        })
        .catch(() => {
          if (gen !== generation) return;
          set({ phase: 'reconnecting' });
          schedule(retryMs, () => void tick());
        });
    },
    dismissNotice: () => set({ notice: null }),
  };
}
