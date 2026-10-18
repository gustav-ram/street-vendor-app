import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../scripts/seed';
import { deletedEntities } from '../src/db/schema';
import { clearSynonymCache } from '../src/modules/search/query';
import { createTestContext, onboardedVendor, resetDb, signUp } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.db);
  clearSynonymCache();
  await seedTags(ctx.db);
});

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

describe('quick start', () => {
  it('creates the business with menu, payment types and category tags', async () => {
    const v = await onboardedVendor(ctx, {
      displayName: 'Flores Lupe',
      categories: ['flowers'],
      menu: [
        { id: crypto.randomUUID(), name: 'Docena de rosas', priceCents: 2500 },
        { id: crypto.randomUUID(), name: 'Girasoles', priceCents: 1500 },
      ],
      paymentMethods: ['cash', 'zelle'],
      languages: ['es'],
    });
    const me = (await ctx.app.inject({ method: 'GET', url: '/v1/vendor/me', headers: v.headers })).json();
    expect(me).toMatchObject({ displayName: 'Flores Lupe', paymentMethods: ['cash', 'zelle'], defaultPrecision: 'approximate', priceLevel: 3, hidden: false, contactVisible: false });
    expect(me.menu.map((m: { name: string }) => m.name)).toEqual(['Docena de rosas', 'Girasoles']);

    // The category's base tag makes "flores" find them once they go live.
    await ctx.app.inject({ method: 'POST', url: '/v1/vendor/live', headers: v.headers, payload: { location: { lat: 34.04, lng: -118.25 } } });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/search', payload: { location: { lat: 34.04, lng: -118.25 }, q: 'flores' } });
    expect(res.json().live.map((r: { id: string }) => r.id)).toEqual([v.vendorId]);
  });

  it('can only run once, and only for vendor accounts', async () => {
    const v = await onboardedVendor(ctx);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/v1/vendor/quick-start',
      headers: v.headers,
      payload: { displayName: 'Again', categories: ['tacos'], menu: [{ id: crypto.randomUUID(), name: 'Taco', priceCents: 250 }] },
    });
    expect(again.json().error.code).toBe('already_onboarded');

    const customer = await signUp(ctx, 'customer');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/vendor/quick-start',
      headers: { authorization: customer.authorization },
      payload: { displayName: 'Nope', categories: ['tacos'], menu: [{ id: crypto.randomUUID(), name: 'Taco', priceCents: 250 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('has no field for payment handles or account numbers', async () => {
    const v = await onboardedVendor(ctx);
    const res = await ctx.app.inject({ method: 'PATCH', url: '/v1/vendor/me', headers: v.headers, payload: { paymentMethods: ['venmo'], venmoHandle: '@someone' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('@someone');
  });
});

describe('menu edits (last write wins)', () => {
  async function put(v: { headers: Record<string, string> }, id: string, body: Record<string, unknown>) {
    return (await ctx.app.inject({ method: 'PUT', url: `/v1/vendor/menu/${id}`, headers: v.headers, payload: body })).json().result;
  }
  const menu = async (v: { headers: Record<string, string> }) =>
    (await ctx.app.inject({ method: 'GET', url: '/v1/vendor/me', headers: v.headers })).json().menu as Array<{ id: string; name: string; priceCents: number; soldOut: boolean }>;

  it('creates idempotently, applies newer edits and ignores older ones', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    const create = { name: 'Elote', priceCents: 400, clientUpdatedAt: at(10) };
    expect(await put(v, id, create)).toBe('applied');
    expect(await put(v, id, create)).toBe('applied'); // outbox retry
    expect(await put(v, id, { name: 'Elote grande', priceCents: 600, clientUpdatedAt: at(5) })).toBe('applied');
    expect(await put(v, id, { name: 'Stale edit', priceCents: 1, clientUpdatedAt: at(8) })).toBe('superseded');
    const item = (await menu(v)).find((m) => m.id === id)!;
    expect(item).toMatchObject({ name: 'Elote grande', priceCents: 600 });
  });

  it('one-tap sold out', async () => {
    const v = await onboardedVendor(ctx);
    const [item] = await menu(v);
    const res = await ctx.app.inject({ method: 'PUT', url: `/v1/vendor/menu/${item!.id}/sold-out`, headers: v.headers, payload: { soldOut: true, clientUpdatedAt: at(0) } });
    expect(res.json().result).toBe('applied');
    expect((await menu(v))[0]!.soldOut).toBe(true);
    const profile = await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v.vendorId}` });
    expect(profile.json().menu[0].soldOut).toBe(true);
  });

  it('a delete beats older offline edits, but a newer edit brings the item back', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    await put(v, id, { name: 'Churro', priceCents: 300, clientUpdatedAt: at(20) });
    const del = await ctx.app.inject({ method: 'DELETE', url: `/v1/vendor/menu/${id}`, headers: v.headers, payload: { clientUpdatedAt: at(10) } });
    expect(del.json().result).toBe('applied');
    expect(await ctx.db.$count(deletedEntities, eq(deletedEntities.id, id))).toBe(1);

    // An edit made offline before the delete arrives late: it loses.
    expect(await put(v, id, { name: 'Churro relleno', priceCents: 350, clientUpdatedAt: at(15) })).toBe('superseded');
    expect((await menu(v)).some((m) => m.id === id)).toBe(false);
    // An edit made after the delete wins.
    expect(await put(v, id, { name: 'Churro relleno', priceCents: 350, clientUpdatedAt: at(1) })).toBe('applied');
    expect((await menu(v)).some((m) => m.id === id)).toBe(true);
  });

  it('cannot touch another vendor\'s items', async () => {
    const a = await onboardedVendor(ctx);
    const b = await onboardedVendor(ctx);
    const [item] = await menu(a);
    const res = await ctx.app.inject({ method: 'PUT', url: `/v1/vendor/menu/${item!.id}`, headers: b.headers, payload: { name: 'Hijack', priceCents: 1, clientUpdatedAt: at(0) } });
    expect(res.statusCode).toBe(404);
    expect((await menu(a))[0]!.name).not.toBe('Hijack');
  });

  it('rejects changes stamped in the future', async () => {
    const v = await onboardedVendor(ctx);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await ctx.app.inject({ method: 'PUT', url: `/v1/vendor/menu/${crypto.randomUUID()}`, headers: v.headers, payload: { name: 'x', priceCents: 1, clientUpdatedAt: future } });
    expect(res.statusCode).toBe(400);
  });

  it('keeps the price level in sync with the menu', async () => {
    const v = await onboardedVendor(ctx);
    for (const price of [1500, 1800]) await put(v, crypto.randomUUID(), { name: `Combo ${price}`, priceCents: price, clientUpdatedAt: at(0) });
    const me = (await ctx.app.inject({ method: 'GET', url: '/v1/vendor/me', headers: v.headers })).json();
    expect(me.priceLevel).toBe(3);
  });
});

describe('status posts', () => {
  it('shows the latest post on the public profile until it expires or is removed', async () => {
    const v = await onboardedVendor(ctx);
    const id = crypto.randomUUID();
    const res = await ctx.app.inject({ method: 'PUT', url: `/v1/vendor/status/${id}`, headers: v.headers, payload: { body: 'Fresh strawberries today', expiresInHours: 4, clientUpdatedAt: at(0) } });
    expect(res.json().result).toBe('applied');
    const profile = (await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v.vendorId}` })).json();
    expect(profile.status).toBe('Fresh strawberries today');

    await ctx.app.inject({ method: 'DELETE', url: `/v1/vendor/status/${id}`, headers: v.headers, payload: { clientUpdatedAt: at(0) } });
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/vendors/${v.vendorId}` })).json().status).toBeNull();
  });
});
