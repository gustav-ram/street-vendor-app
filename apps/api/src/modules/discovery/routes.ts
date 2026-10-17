import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CATEGORIES,
  LANGUAGES,
  metaResponseSchema,
  PAYMENT_METHODS,
  searchRequestSchema,
  searchResponseSchema,
  vendorEventSchema,
  vendorProfileSchema,
} from '@streeteats/shared';
import { tags } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { bumpCounter } from '../analytics/counters';
import { search } from '../search/service';
import { getPublicProfile } from '../vendors/service';

/** Public, no account needed: browse, search and view vendor profiles. */
export const discoveryRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.get('/meta', { schema: { response: { 200: metaResponseSchema } } }, async () => {
    const tagRows = await ctx.db
      .select({ slug: tags.slug, nameEn: tags.nameEn, nameEs: tags.nameEs, category: tags.category })
      .from(tags)
      .orderBy(tags.nameEn);
    return {
      categories: [...CATEGORIES],
      paymentMethods: [...PAYMENT_METHODS],
      languages: [...LANGUAGES],
      tags: tagRows,
      live: { heartbeatIntervalSec: ctx.config.live.heartbeatIntervalSec, graceSec: ctx.config.live.graceSec },
    };
  });

  app.post(
    '/search',
    {
      schema: { body: searchRequestSchema, response: { 200: searchResponseSchema } },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request) => search(ctx, request.body),
  );

  app.get(
    '/vendors/:id',
    { schema: { params: z.object({ id: z.string().max(64) }), response: { 200: vendorProfileSchema } } },
    async (request) => getPublicProfile(ctx, request.params.id),
  );

  // Aggregate analytics events. Counted per vendor and day, nothing about who.
  app.post(
    '/vendors/:id/events',
    {
      schema: { params: z.object({ id: z.uuid() }), body: vendorEventSchema, response: { 204: z.null() } },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const counter = request.body.type === 'profile_view' ? 'profileViews' : 'directionsTaps';
      try {
        await bumpCounter(ctx.db, [request.params.id], counter);
      } catch {
        throw new ApiError('not_found');
      }
      return reply.code(204).send(null);
    },
  );
};
