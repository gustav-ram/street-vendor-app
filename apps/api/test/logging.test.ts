import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

    const output = ctx.logs.join('\n');
    expect(output).toContain('"route":"/v1/auth/register"');
    expect(output).toContain('"route":"(unmatched)"');
    for (const secret of [email, 'correct-horse-battery', '34.05123', '-118.25456', '203.0.113.9', '198.51.100.7', 'nowhere']) {
      expect(output).not.toContain(secret);
    }
  });
});
