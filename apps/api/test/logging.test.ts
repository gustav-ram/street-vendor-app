import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeError } from '../src/lib/logging';
import { createTestContext, MOBILE, resetDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext({ captureLogs: true });
  await resetDb(ctx.db);
});
afterAll(async () => ctx.close());

describe('request logging', () => {
  it('records the route pattern only: no URLs, query strings, bodies, IPs or identifiers', async () => {
    const email = 'private-person@example.test';
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { ...MOBILE, 'x-forwarded-for': '203.0.113.9' },
      payload: { email, role: 'customer', credential: { kind: 'password', secret: 'correct-horse-battery' } },
    });
    await ctx.app.inject({ method: 'GET', url: '/v1/nowhere?lat=34.05123&lng=-118.25456', remoteAddress: '198.51.100.7' });
    await ctx.app.inject({ method: 'POST', url: '/v1/search', payload: { location: { lat: 34.06789, lng: -118.29876 }, q: 'secret tamales' } });

    const output = ctx.logs.join('\n');
    expect(output).toContain('"route":"/v1/auth/register"');
    expect(output).toContain('"route":"(unmatched)"');
    expect(output).toContain('"route":"/v1/search"');
    for (const secret of [email, 'correct-horse-battery', '34.05123', '-118.25456', '203.0.113.9', '198.51.100.7', 'nowhere', '34.067', '118.298', 'secret tamales']) {
      expect(output).not.toContain(secret);
    }
  });
});

describe('error logging', () => {
  it('reduces database errors to their SQLSTATE code, dropping query parameters', () => {
    const cause = Object.assign(new Error('invalid input syntax for type double precision: "34.0512"'), { code: '22P02' });
    const err = Object.assign(new Error('Failed query: update vendor_live_sessions set ...\nparams: 34.0512,-118.2534'), {
      name: 'DrizzleQueryError',
      cause,
    });
    const logged = JSON.stringify(safeError(err));
    expect(logged).toContain('22P02');
    expect(logged).not.toContain('34.0512');
    expect(logged).not.toContain('118.2534');
    expect(logged).not.toContain('vendor_live_sessions');
  });

  it('keeps ordinary errors readable', () => {
    expect(safeError(new TypeError('boom'))).toMatchObject({ type: 'TypeError', message: 'boom' });
  });
});
