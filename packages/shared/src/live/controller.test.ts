import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoLiveInput, HeartbeatInput, LiveStatus } from '../schemas/dashboard';
import type { LatLng } from '../geo/round';
import { createLiveController } from './controller';

const CART = { lat: 34.0431, lng: -118.2668 };
const HOME = { lat: 34.1, lng: -118.33 };
const coded = (code: string) => Object.assign(new Error(code), { code });

/** Follows the API's rules: one session per stand, heartbeats name their session. */
function fakeServer() {
  let session: { startedAt: string; endsAt: string; location: LatLng } | null = null;
  let seq = 0;
  let down = false;
  const status = (): LiveStatus =>
    session && Date.now() < Date.parse(session.endsAt)
      ? {
          state: 'live',
          location: { ...session.location, precision: 'approximate' },
          startedAt: session.startedAt,
          lastHeartbeatAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          endsAt: session.endsAt,
          heartbeatIntervalSec: 30,
          graceSec: 300,
        }
      : { state: 'offline', location: null, startedAt: null, lastHeartbeatAt: null, expiresAt: null, endsAt: null, heartbeatIntervalSec: 30, graceSec: 300 };
  const reachable = () => {
    if (down) throw coded('network');
  };
  const open = (input: GoLiveInput) => {
    const hours = input.autoOffHours ?? 8;
    session = {
      startedAt: new Date(Date.now() + seq++).toISOString(),
      endsAt: input.endsAt ?? new Date(Date.now() + hours * 3_600_000).toISOString(),
      location: input.location,
    };
    return status();
  };
  return {
    api: {
      status: vi.fn(async () => (reachable(), status())),
      start: vi.fn(async (input: GoLiveInput) => (reachable(), open(input))),
      heartbeat: vi.fn(async ({ location, startedAt }: HeartbeatInput) => {
        reachable();
        if (status().state === 'offline') throw coded('not_live');
        if (session!.startedAt !== startedAt) throw coded('live_elsewhere');
        session!.location = location;
        return status();
      }),
      end: vi.fn(async () => {
        reachable();
        session = null;
        return status();
      }),
    },
    status,
    /** The grace period ran out (no heartbeats reached the server). */
    expire: () => (session = null),
    /** The vendor went live on a different phone or browser. */
    openElsewhere: (location: LatLng) => open({ location }),
    setDown: (v: boolean) => (down = v),
    get location() {
      return session?.location ?? null;
    },
  };
}

function device(server: ReturnType<typeof fakeServer>, opts: { stored?: string | null } = {}) {
  let foreground = true;
  let stored = opts.stored ?? null;
  const getPosition = vi.fn(async (): Promise<LatLng> => CART);
  const live = createLiveController({
    api: server.api,
    getPosition,
    isForeground: () => foreground,
    store: { get: () => stored, set: (v) => (stored = v) },
  });
  return {
    live,
    getPosition,
    stored: () => stored,
    hide() {
      foreground = false;
      live.setForeground(false);
    },
    show() {
      foreground = true;
      live.setForeground(true);
    },
  };
}

let server: ReturnType<typeof fakeServer>;
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-17T18:00:00Z') });
  server = fakeServer();
});
afterEach(() => vi.useRealTimers());

const phase = (d: ReturnType<typeof device>) => d.live.getState().phase;

describe('Go Live on a device', () => {
  it('sends a heartbeat naming its session every interval while on screen', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    expect(phase(phone)).toBe('live');
    const { startedAt } = phone.live.getState().status!;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(server.api.heartbeat).toHaveBeenCalledTimes(2);
    expect(server.api.heartbeat).toHaveBeenLastCalledWith({ location: CART, startedAt });
  });

  it('stops reading location the moment the screen is hidden, and never restarts on its own', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    phone.hide();
    phone.getPosition.mockClear();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(phone.getPosition).not.toHaveBeenCalled();
    expect(server.api.heartbeat).not.toHaveBeenCalled();

    server.expire();
    phone.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(phone.live.getState()).toMatchObject({ phase: 'offline', notice: 'autoOffline' });
    expect(server.api.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(phone.getPosition).not.toHaveBeenCalled();
  });

  it('coming back on weak signal after the session expired does not restart it', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    phone.hide();
    server.expire();
    server.setDown(true);
    phone.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(phase(phone)).toBe('reconnecting');
    server.setDown(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(phone.live.getState()).toMatchObject({ phase: 'offline', notice: 'autoOffline' });
    expect(server.api.start).toHaveBeenCalledTimes(1);
  });

  it('coming back within the grace period carries on with the same session', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    phone.hide();
    await vi.advanceTimersByTimeAsync(60_000);
    phone.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(phase(phone)).toBe('live');
    expect(server.api.heartbeat).toHaveBeenCalledTimes(1);
    expect(server.api.start).toHaveBeenCalledTimes(1);
  });

  it('lost signal on screen: reconnecting, then resumes keeping the original closing time', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', 2);
    const { endsAt } = phone.live.getState().status!;
    server.setDown(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(phase(phone)).toBe('reconnecting');

    server.expire();
    server.setDown(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(phase(phone)).toBe('live');
    expect(server.api.start).toHaveBeenLastCalledWith(expect.objectContaining({ endsAt }));
  });

  it('never runs past the closing time the vendor chose', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', 2);
    await vi.advanceTimersByTimeAsync(2 * 3_600_000 + 60_000);
    expect(phone.live.getState()).toMatchObject({ phase: 'offline', notice: 'timerEnded' });
    expect(server.api.start).toHaveBeenCalledTimes(1);
  });

  it('closing while a heartbeat is in flight stays closed', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    phone.getPosition.mockImplementation(() => new Promise((r) => setTimeout(() => r(CART), 2_000)));
    await vi.advanceTimersByTimeAsync(30_000);
    await phone.live.goOffline();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(phase(phone)).toBe('offline');
    expect(server.location).toBeNull();
  });

  it('a heartbeat reply that arrives after closing does not put the vendor back on', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    const reply = server.api.heartbeat.getMockImplementation()!;
    server.api.heartbeat.mockImplementation(async (input) => {
      const status = await reply(input); // the server accepted it...
      await new Promise((r) => setTimeout(r, 2_000)); // ...but the answer is slow
      return status;
    });
    await vi.advanceTimersByTimeAsync(30_500);
    await phone.live.goOffline();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(phase(phone)).toBe('offline');
    expect(server.api.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('turning location off mid-session closes the stand instead of leaving a stale pin', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    phone.getPosition.mockRejectedValue(coded('location_denied'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(phone.live.getState()).toMatchObject({ phase: 'offline', notice: 'locationDenied' });
    expect(server.location).toBeNull();
  });

  it('closing with no signal keeps trying until the server hears it', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    server.setDown(true);
    await phone.live.goOffline();
    expect(phone.live.getState().notice).toBe('offlinePending');
    server.setDown(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.location).toBeNull();
    expect(phone.live.getState().notice).toBeNull();
  });
});

describe('one device at a time', () => {
  it('a session opened on another device is shown, but this device never reads its location', async () => {
    server.openElsewhere(CART);
    const laptop = device(server);
    laptop.live.sync(server.status());
    expect(phase(laptop)).toBe('elsewhere');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(laptop.getPosition).not.toHaveBeenCalled();
    expect(server.api.heartbeat).not.toHaveBeenCalled();
    expect(server.location).toEqual(CART);
  });

  it('moving the session here is explicit, and keeps its closing time', async () => {
    const other = server.openElsewhere(CART);
    const laptop = device(server);
    laptop.live.sync(server.status());
    laptop.getPosition.mockResolvedValue(HOME);
    await laptop.live.takeOver('approximate');
    expect(phase(laptop)).toBe('live');
    expect(server.api.start).toHaveBeenLastCalledWith(expect.objectContaining({ location: HOME, endsAt: other.endsAt }));
  });

  it('when another device takes over, this one stops sending its location', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    server.openElsewhere(HOME);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(phase(phone)).toBe('elsewhere');
    phone.getPosition.mockClear();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(phone.getPosition).not.toHaveBeenCalled();
    expect(server.location).toEqual(HOME);
  });

  it('notices when the other device closes', async () => {
    server.openElsewhere(CART);
    const laptop = device(server);
    laptop.live.sync(server.status());
    server.expire();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(phase(laptop)).toBe('offline');
  });

  it('after a reload, picks up only the session it started itself', async () => {
    const tab = device(server);
    await tab.live.goLive('approximate', null);

    const reloaded = device(server, { stored: tab.stored() });
    reloaded.live.sync(server.status());
    await vi.advanceTimersByTimeAsync(0);
    expect(phase(reloaded)).toBe('live');
    expect(reloaded.getPosition).toHaveBeenCalledTimes(1);

    const otherTab = device(server);
    otherTab.live.sync(server.status());
    expect(phase(otherTab)).toBe('elsewhere');
    expect(otherTab.getPosition).not.toHaveBeenCalled();
  });

  it('re-checks a stale dashboard status instead of trusting it', async () => {
    const phone = device(server);
    await phone.live.goLive('approximate', null);
    // A dashboard load that started before going live arrives late.
    phone.live.sync({ ...server.status(), state: 'offline', startedAt: null, location: null, endsAt: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(phase(phone)).toBe('live');
  });
});
