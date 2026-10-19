import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { inviteCheckSchema } from '@streeteats/shared';
import { checkInvite } from './service';

/** The join page asks whether a code from a flyer still works. Nothing else is revealed. */
export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/invites/:code',
    {
      schema: { params: z.object({ code: z.string().max(32) }), response: { 200: inviteCheckSchema } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => checkInvite(app.ctx, request.params.code),
  );
};
