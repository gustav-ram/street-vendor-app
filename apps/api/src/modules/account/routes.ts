import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { deleteAccountSchema } from '@streeteats/shared';
import { requireUser } from '../../app';
import { REFRESH_COOKIE } from '../auth/routes';
import { deleteAccount, exportAccount } from './service';

const STRICT = { rateLimit: { max: 5, timeWindow: '1 minute' } };

/** "Download my data" and "Delete my account", for every kind of account. */
export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.get('/me/export', { config: STRICT }, async (request, reply) => {
    const user = requireUser(request);
    const zip = await exportAccount(ctx, user.id);
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="streeteats-export-${day}.zip"`)
      .header('cache-control', 'no-store')
      .send(Buffer.from(zip));
  });

  app.delete(
    '/me',
    { schema: { body: deleteAccountSchema, response: { 204: z.null() } }, config: STRICT },
    async (request, reply) => {
      const user = requireUser(request);
      await deleteAccount(ctx, user.id, request.body.secret);
      reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
      return reply.code(204).send(null);
    },
  );
};
