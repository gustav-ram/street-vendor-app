import type { MyVendor } from '../schemas/dashboard';
import type { OutboxItem } from './core';

/**
 * What the vendor should see: the last copy from the server with every
 * change still waiting in the outbox laid on top, in order. So an edit made
 * without signal stays on screen (marked "Pending sync") instead of
 * flickering back when the app refreshes from the server.
 *
 * Only pending items are applied. Superseded or failed ones lost to what
 * the server has, and are shown on the Sync issues screen instead.
 */
export function applyPending(vendor: MyVendor, items: readonly OutboxItem[]): MyVendor {
  let v = vendor;
  for (const item of items) {
    if (item.state === 'pending') v = applyOne(v, item);
  }
  return v;
}

/** One change, the way the server will apply it. */
export function applyOne(v: MyVendor, item: OutboxItem): MyVendor {
  const a = item.action;
  const id = a.entityId;
  switch (a.type) {
    case 'menu.put': {
      const existing = v.menu.find((m) => m.id === id);
      const next = {
        id,
        name: a.payload.name,
        description: a.payload.description ?? '',
        priceCents: a.payload.priceCents,
        soldOut: a.payload.soldOut ?? false,
        sortOrder: a.payload.sortOrder ?? existing?.sortOrder ?? Math.max(-1, ...v.menu.map((m) => m.sortOrder)) + 1,
        clientUpdatedAt: a.payload.clientUpdatedAt,
      };
      if (existing && existing.clientUpdatedAt > next.clientUpdatedAt) return v;
      return { ...v, menu: existing ? v.menu.map((m) => (m.id === id ? next : m)) : [...v.menu, next] };
    }
    case 'menu.soldOut':
      return {
        ...v,
        menu: v.menu.map((m) =>
          m.id === id && m.clientUpdatedAt <= a.payload.clientUpdatedAt ? { ...m, soldOut: a.payload.soldOut, clientUpdatedAt: a.payload.clientUpdatedAt } : m,
        ),
      };
    case 'menu.delete':
      return { ...v, menu: v.menu.filter((m) => !(m.id === id && m.clientUpdatedAt <= a.payload.clientUpdatedAt)) };
    case 'status.put': {
      const post = {
        id,
        body: a.payload.body,
        // An estimate until the server answers; the screen shows "Pending sync" instead of a time.
        expiresAt: new Date(Date.parse(a.payload.clientUpdatedAt) + (a.payload.expiresInHours ?? 12) * 3_600_000).toISOString(),
        createdAt: a.payload.clientUpdatedAt,
      };
      return { ...v, statusPosts: [post, ...v.statusPosts.filter((p) => p.id !== id)] };
    }
    case 'status.delete':
      return { ...v, statusPosts: v.statusPosts.filter((p) => p.id !== id) };
    case 'upcoming.put': {
      const existing = v.upcoming.find((u) => u.id === id);
      if (existing && existing.clientUpdatedAt > a.payload.clientUpdatedAt) return v;
      const post = {
        id,
        // The spot as picked, on the vendor's own phone. Customers get the
        // approximate area once the server has it.
        location: { ...a.payload.location, precision: a.payload.precision ?? v.defaultPrecision },
        placeLabel: a.payload.placeLabel ?? null,
        note: a.payload.note ?? null,
        startsAt: a.payload.startsAt,
        endsAt: a.payload.endsAt,
        clientUpdatedAt: a.payload.clientUpdatedAt,
      };
      const upcoming = existing ? v.upcoming.map((u) => (u.id === id ? post : u)) : [...v.upcoming, post];
      return { ...v, upcoming: upcoming.sort((x, y) => x.startsAt.localeCompare(y.startsAt)) };
    }
    case 'upcoming.delete':
      return { ...v, upcoming: v.upcoming.filter((u) => !(u.id === id && u.clientUpdatedAt <= a.payload.clientUpdatedAt)) };
    case 'photo.add':
      // Photos have their own list; the photos screen shows queued ones itself.
      return v;
  }
}
