import { describe, expect, it } from 'vitest';
import type { MyVendor } from '../schemas/dashboard';
import type { OutboxAction, OutboxItem } from './core';
import { applyPending } from './rebase';

const vendor: MyVendor = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Danger Dogs',
  description: '',
  categories: ['hot_dogs'],
  languages: ['en'],
  paymentMethods: ['cash'],
  priceLevel: 2,
  defaultPrecision: 'approximate',
  contactText: null,
  contactVisible: false,
  timezone: 'America/Los_Angeles',
  hidden: false,
  menu: [
    { id: 'm1', name: 'Bacon dog', description: '', priceCents: 700, soldOut: false, sortOrder: 0, clientUpdatedAt: '2026-10-18T10:00:00.000Z' },
    { id: 'm2', name: 'Elote', description: '', priceCents: 500, soldOut: false, sortOrder: 1, clientUpdatedAt: '2026-10-18T10:00:00.000Z' },
  ],
  statusPosts: [],
  upcoming: [],
  schedule: { published: false, entries: [] },
  live: { state: 'offline', location: null, startedAt: null, lastHeartbeatAt: null, expiresAt: null, endsAt: null, heartbeatIntervalSec: 60, graceSec: 300 },
};

let n = 0;
const item = (action: OutboxAction, state: OutboxItem['state'] = 'pending'): OutboxItem => ({
  id: `i${++n}`,
  action,
  queuedAt: '2026-10-18T12:00:00.000Z',
  attempts: 0,
  nextAttemptAt: 0,
  state,
});

describe('applyPending', () => {
  it('shows queued edits on top of the last copy from the server', () => {
    const v = applyPending(vendor, [
      item({ type: 'menu.soldOut', entityId: 'm1', payload: { soldOut: true, clientUpdatedAt: '2026-10-18T12:00:00.000Z' } }),
      item({ type: 'menu.put', entityId: 'm3', payload: { name: 'Churro', priceCents: 300, clientUpdatedAt: '2026-10-18T12:01:00.000Z' } }),
      item({ type: 'menu.delete', entityId: 'm2', payload: { clientUpdatedAt: '2026-10-18T12:02:00.000Z' } }),
      item({ type: 'status.put', entityId: 's1', payload: { body: 'Fresh mango', clientUpdatedAt: '2026-10-18T12:03:00.000Z' } }),
    ]);
    expect(v.menu.map((m) => [m.name, m.soldOut, m.sortOrder])).toEqual([
      ['Bacon dog', true, 0],
      ['Churro', false, 2],
    ]);
    expect(v.statusPosts.map((p) => p.body)).toEqual(['Fresh mango']);
    // The input isn't modified.
    expect(vendor.menu).toHaveLength(2);
  });

  it('leaves out issues and anything the server already has newer', () => {
    const v = applyPending(vendor, [
      item({ type: 'menu.delete', entityId: 'm1', payload: { clientUpdatedAt: '2026-10-18T12:00:00.000Z' } }, 'superseded'),
      item({ type: 'menu.put', entityId: 'm2', payload: { name: 'Old name', priceCents: 1, clientUpdatedAt: '2026-10-18T09:00:00.000Z' } }),
    ]);
    expect(v.menu.map((m) => m.name)).toEqual(['Bacon dog', 'Elote']);
  });

  it('lists queued "tomorrow" posts in time order and drops deleted ones', () => {
    const post = (id: string, startsAt: string): OutboxAction => ({
      type: 'upcoming.put',
      entityId: id,
      payload: { location: { lat: 34.05, lng: -118.25 }, startsAt, endsAt: '2026-10-25T00:00:00.000Z', clientUpdatedAt: '2026-10-18T12:00:00.000Z' },
    });
    const v = applyPending(vendor, [
      item(post('u1', '2026-10-20T20:00:00.000Z')),
      item(post('u2', '2026-10-19T20:00:00.000Z')),
      item(post('u3', '2026-10-21T20:00:00.000Z')),
      item({ type: 'upcoming.delete', entityId: 'u3', payload: { clientUpdatedAt: '2026-10-18T12:05:00.000Z' } }),
    ]);
    expect(v.upcoming.map((u) => u.id)).toEqual(['u2', 'u1']);
    expect(v.upcoming[0]!.location.precision).toBe('approximate');
  });
});
