import { describe, expect, it } from 'vitest';
import { BACKOFF_MAX_MS, backoffMs, createOutbox, type OutboxAction, type OutboxItem, pendingEntityIds, type SendResult } from './core';

const coded = (code: string) => Object.assign(new Error(code), { code });

/**
 * A server with the API's write rules: last-write-wins on clientUpdatedAt,
 * the same timestamp re-applies (so a retried request is harmless), and a
 * delete leaves a tombstone so an older edit can't bring the row back.
 */
function fakeServer() {
  const rows = new Map<string, { at: string; payload: unknown }>();
  const tombstones = new Map<string, string>();
  let writes = 0;
  return {
    rows,
    writes: () => writes,
    apply(action: OutboxAction): SendResult {
      const at = (action.payload as { clientUpdatedAt?: string }).clientUpdatedAt ?? '';
      const id = action.entityId;
      const dead = tombstones.get(id);
      if (action.type.endsWith('.delete')) {
        const row = rows.get(id);
        if (row && row.at > at) return 'superseded';
        rows.delete(id);
        if (!dead || dead < at) tombstones.set(id, at);
        writes++;
        return 'applied';
      }
      if (dead && dead >= at) return 'superseded';
      const row = rows.get(id);
      if (row && row.at > at) return 'superseded';
      rows.set(id, { at, payload: action.payload });
      writes++;
      return 'applied';
    },
  };
}

/** A phone: an outbox wired to a server through a network we can switch off or make lose replies. */
function phone(server: ReturnType<typeof fakeServer>, saved: OutboxItem[] | null = null) {
  let clock = Date.parse('2026-10-18T12:00:00Z');
  let n = 0;
  const net = { online: true, loseNextReply: false, sent: [] as string[] };
  let store: readonly OutboxItem[] | null = saved;
  const settled: Array<[string, string]> = [];
  const box = createOutbox({
    load: () => (store ? [...store] : null),
    save: (items) => void (store = items),
    newId: () => `item-${++n}`,
    now: () => clock,
    random: () => 0.5,
    onSettled: (item, result) => settled.push([item.action.entityId, result]),
    send: async (item) => {
      if (!net.online) throw coded('network');
      net.sent.push(item.action.entityId);
      if (item.action.entityId.startsWith('bad')) throw coded('validation_failed');
      const result = server.apply(item.action);
      if (net.loseNextReply) {
        net.loseNextReply = false;
        throw coded('network');
      }
      return result;
    },
  });
  return {
    box,
    net,
    settled,
    stored: () => store,
    at: (iso: string) => (clock = Date.parse(iso)),
    advance: (ms: number) => (clock += ms),
    time: () => new Date(clock).toISOString(),
  };
}

const menuPut = (id: string, name: string, at: string): OutboxAction => ({
  type: 'menu.put',
  entityId: id,
  payload: { name, description: '', priceCents: 500, soldOut: false, clientUpdatedAt: at },
});

describe('outbox', () => {
  it('sends queued changes in order and forgets them once applied', async () => {
    const server = fakeServer();
    const p = phone(server);
    await p.box.enqueue(menuPut('m1', 'Bacon dog', p.time()));
    await p.box.enqueue({ type: 'status.put', entityId: 's1', payload: { body: 'Fresh mango', clientUpdatedAt: p.time() } });
    const report = await p.box.flush();
    expect(report).toEqual({ applied: 2, superseded: 0, failed: 0, waiting: 0 });
    expect(p.net.sent).toEqual(['m1', 's1']);
    expect(p.box.items()).toEqual([]);
    expect(p.stored()).toEqual([]);
  });

  it('keeps changes made without signal and backs off: 2 s, 4 s, 8 s ... up to 5 min', async () => {
    const p = phone(fakeServer());
    p.net.online = false;
    await p.box.enqueue(menuPut('m1', 'Bacon dog', p.time()));
    await p.box.enqueue(menuPut('m2', 'Elote', p.time()));

    const waits: number[] = [];
    for (let i = 0; i < 12; i++) {
      const before = Date.parse(p.time());
      expect((await p.box.flush({ force: true })).waiting).toBe(2);
      waits.push(p.box.nextAttemptAt()! - before);
    }
    expect(waits.slice(0, 4)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(Math.max(...waits)).toBe(BACKOFF_MAX_MS);
    // Only the first change was tried: the second waits its turn, so order is kept.
    expect(p.box.items().map((i) => [i.action.entityId, i.attempts])).toEqual([
      ['m1', 12],
      ['m2', 0],
    ]);

    // Not due yet: nothing is sent until the backoff passes (or a reconnect forces it).
    p.net.online = true;
    expect((await p.box.flush()).applied).toBe(0);
    p.advance(BACKOFF_MAX_MS * 1.2);
    expect(await p.box.flush()).toMatchObject({ applied: 2, waiting: 0 });
  });

  it('adds jitter of at most ±20 %', () => {
    expect(backoffMs(1, () => 0)).toBe(1_600);
    expect(backoffMs(1, () => 1)).toBe(2_400);
    expect(backoffMs(30, () => 1)).toBe(BACKOFF_MAX_MS * 1.2);
  });

  it('is idempotent: a change the server got but whose reply was lost is sent again harmlessly', async () => {
    const server = fakeServer();
    const p = phone(server);
    await p.box.enqueue(menuPut('m1', 'Bacon dog', p.time()));
    p.net.loseNextReply = true;
    expect((await p.box.flush()).waiting).toBe(1);
    expect(server.rows.size).toBe(1);

    expect(await p.box.flush({ force: true })).toMatchObject({ applied: 1, waiting: 0 });
    // Same id, same time: re-applied in place, not duplicated.
    expect(server.rows.size).toBe(1);
    expect(p.net.sent).toEqual(['m1', 'm1']);
  });

  it('resolves conflicts by clientUpdatedAt: the newest change wins, and the loser becomes a sync issue', async () => {
    const server = fakeServer();
    const cart = phone(server);
    const home = phone(server);

    // 12:00 at the cart, no signal: "Bacon dog" marked sold out.
    cart.at('2026-10-18T12:00:00Z');
    cart.net.online = false;
    await cart.box.enqueue({ type: 'menu.soldOut', entityId: 'm1', payload: { soldOut: true, clientUpdatedAt: cart.time() } });
    server.apply(menuPut('m1', 'Bacon dog', '2026-10-18T11:00:00Z'));

    // 12:05 at home, online: renamed. This is newer, so it wins.
    home.at('2026-10-18T12:05:00Z');
    await home.box.enqueue(menuPut('m1', 'Bacon-wrapped dog', home.time()));
    await home.box.flush();

    // 12:30 the cart gets signal back. Its older change is superseded.
    cart.at('2026-10-18T12:30:00Z');
    cart.net.online = true;
    expect(await cart.box.flush({ force: true })).toMatchObject({ applied: 0, superseded: 1, waiting: 0 });
    expect(server.rows.get('m1')!.payload).toMatchObject({ name: 'Bacon-wrapped dog' });
    expect(cart.box.items()).toMatchObject([{ state: 'superseded', action: { type: 'menu.soldOut', entityId: 'm1' } }]);
    expect(cart.settled).toEqual([['m1', 'superseded']]);

    // "Use my version": sent again with a fresh time, so it wins now.
    await cart.box.retry(cart.box.items()[0]!.id);
    expect(await cart.box.flush()).toMatchObject({ applied: 1 });
    expect(server.rows.get('m1')!.payload).toMatchObject({ soldOut: true, clientUpdatedAt: '2026-10-18T12:30:00.000Z' });
    expect(cart.box.items()).toEqual([]);
  });

  it('never lets an old queued edit bring back something deleted later', async () => {
    const server = fakeServer();
    const cart = phone(server);
    const home = phone(server);
    cart.at('2026-10-18T12:00:00Z');
    cart.net.online = false;
    await cart.box.enqueue({ type: 'upcoming.put', entityId: 'u1', payload: upcoming(cart.time()) });
    home.at('2026-10-18T12:10:00Z');
    await home.box.enqueue({ type: 'upcoming.delete', entityId: 'u1', payload: { clientUpdatedAt: home.time() } });
    await home.box.flush();

    cart.net.online = true;
    expect(await cart.box.flush({ force: true })).toMatchObject({ superseded: 1 });
    expect(server.rows.has('u1')).toBe(false);
  });

  it('turns a change the server refuses for good into a sync issue and keeps going', async () => {
    const p = phone(fakeServer());
    await p.box.enqueue(menuPut('bad-1', 'x'.repeat(5), p.time()));
    await p.box.enqueue(menuPut('m2', 'Elote', p.time()));
    expect(await p.box.flush()).toMatchObject({ applied: 1, failed: 1, waiting: 0 });
    expect(p.box.items()).toMatchObject([{ state: 'failed', error: 'validation_failed', action: { entityId: 'bad-1' } }]);
    expect(pendingEntityIds(p.box.items()).size).toBe(0);

    await p.box.dismiss(p.box.items()[0]!.id);
    expect(p.box.items()).toEqual([]);
  });

  it('gives up on a server error after a few tries instead of blocking the queue forever', async () => {
    let calls = 0;
    const box = createOutbox({
      load: () => null,
      save: () => {},
      newId: () => `i${calls}`,
      send: async () => {
        calls++;
        throw coded('internal');
      },
    });
    await box.enqueue(menuPut('m1', 'Bacon dog', new Date().toISOString()));
    for (let i = 0; i < 5; i++) expect((await box.flush({ force: true })).waiting).toBe(1);
    expect(await box.flush({ force: true })).toMatchObject({ failed: 1, waiting: 0 });
    expect(calls).toBe(6);
  });

  it('folds and replaces queued changes to the same thing, but never the one being sent', async () => {
    const p = phone(fakeServer());
    p.net.online = false;
    await p.box.enqueue(menuPut('m1', 'Bacon dog', '2026-10-18T12:00:00.000Z'));
    await p.box.enqueue({ type: 'menu.soldOut', entityId: 'm1', payload: { soldOut: true, clientUpdatedAt: '2026-10-18T12:01:00.000Z' } });
    expect(p.box.items()).toHaveLength(1);
    expect(p.box.items()[0]!.action.payload).toMatchObject({ name: 'Bacon dog', soldOut: true, clientUpdatedAt: '2026-10-18T12:01:00.000Z' });

    await p.box.enqueue({ type: 'status.put', entityId: 's1', payload: { body: 'Here till 9', clientUpdatedAt: p.time() } });
    await p.box.enqueue({ type: 'menu.delete', entityId: 'm1', payload: { clientUpdatedAt: '2026-10-18T12:02:00.000Z' } });
    expect(p.box.items().map((i) => i.action.type)).toEqual(['status.put', 'menu.delete']);

    // An item already on its way isn't changed; a later edit queues behind it.
    let release!: () => void;
    const server = fakeServer();
    const slow = createOutbox({
      load: () => null,
      save: () => {},
      newId: (() => {
        let k = 0;
        return () => `s${++k}`;
      })(),
      send: (item) =>
        item.action.entityId === 'm9' && item.action.type === 'menu.put'
          ? new Promise((resolve) => (release = () => resolve(server.apply(item.action))))
          : Promise.resolve(server.apply(item.action)),
    });
    await slow.enqueue(menuPut('m9', 'Churro', '2026-10-18T12:00:00.000Z'));
    const sending = slow.flush();
    await new Promise((r) => setTimeout(r, 0));
    await slow.enqueue({ type: 'menu.soldOut', entityId: 'm9', payload: { soldOut: true, clientUpdatedAt: '2026-10-18T12:03:00.000Z' } });
    expect(slow.items()).toHaveLength(2);
    release();
    expect(await sending).toMatchObject({ applied: 2 });
    expect(server.rows.get('m9')!.payload).toMatchObject({ soldOut: true, clientUpdatedAt: '2026-10-18T12:03:00.000Z' });
  });

  it('survives an app restart, including how far a photo upload got', async () => {
    const server = fakeServer();
    const first = phone(server);
    first.net.online = false;
    await first.box.enqueue({
      type: 'photo.add',
      entityId: 'p1',
      payload: { fileUri: 'file:///outbox/p1.jpg', contentType: 'image/jpeg', kind: 'gallery' },
    });
    // The phone remembers the upload id it got before the signal dropped.
    const box = createOutbox({
      load: () => [...(first.stored() ?? [])],
      save: () => {},
      newId: () => 'x',
      send: async (_item, remember) => {
        await remember({ uploadId: 'up-123' });
        throw coded('network');
      },
    });
    await box.flush();
    const saved = box.items();
    expect(saved[0]!.action.payload).toMatchObject({ uploadId: 'up-123', fileUri: 'file:///outbox/p1.jpg' });

    const restarted = phone(server, [...saved]);
    await restarted.box.ready();
    expect(restarted.box.items()).toHaveLength(1);
    expect(await restarted.box.flush({ force: true })).toMatchObject({ applied: 1 });
  });

  it('can be cleared when the vendor signs out', async () => {
    const p = phone(fakeServer());
    p.net.online = false;
    await p.box.enqueue(menuPut('m1', 'Bacon dog', p.time()));
    await p.box.clear();
    expect(p.box.items()).toEqual([]);
    expect(p.stored()).toEqual([]);
  });
});

function upcoming(at: string) {
  return {
    location: { lat: 34.05, lng: -118.25 },
    startsAt: '2026-10-19T23:00:00.000Z',
    endsAt: '2026-10-20T04:00:00.000Z',
    placeLabel: 'Near 5th & Main',
    clientUpdatedAt: at,
  };
}
