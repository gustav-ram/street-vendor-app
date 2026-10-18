import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  favoriteInputSchema,
  favoritesResponseSchema,
  reportInputSchema,
  reportReceivedSchema,
  reviewInputSchema,
  myReviewSchema,
  stillHereInputSchema,
  stillHereResultSchema,
  viewerStateSchema,
} from '@streeteats/shared';
import { requireUser } from '../../app';
import { favorites } from '../../db/schema';
import { listFavorites, removeFavorite, setFavorite } from './favorites';
import { publicVendor } from './guards';
import { createReport } from './reports';
import { deleteReview, getOwnReview, upsertReview } from './reviews';
import { confirmedRecently, confirmStillHere, createDailyCounter } from './still-here';

const vendorParams = z.object({ id: z.uuid() });
const ok = z.object({ ok: z.literal(true) });

/** Things a signed-in person does on a vendor's page: favorite, review, confirm, report. */
export const communityRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;
  const daily = createDailyCounter();

  app.get('/vendors/:id/viewer', { schema: { params: vendorParams, response: { 200: viewerStateSchema } } }, async (request) => {
    const user = requireUser(request);
    const vendor = await publicVendor(ctx, request.params.id);
    const [fav] = await ctx.db
      .select({ notifyOnOpen: favorites.notifyOnOpen })
      .from(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.vendorId, vendor.id)));
    return {
      favorite: Boolean(fav),
      notifyOnOpen: fav?.notifyOnOpen ?? false,
      review: await getOwnReview(ctx, user.id, vendor.id),
      confirmedRecently: await confirmedRecently(ctx, user.id, vendor.id),
      isOwner: vendor.userId === user.id,
    };
  });

  // ---------------------------------------------------------------- favorites

  app.put(
    '/vendors/:id/favorite',
    { schema: { params: vendorParams, body: favoriteInputSchema.nullish(), response: { 200: ok } } },
    async (request) => {
      const user = requireUser(request);
      await setFavorite(ctx, user.id, request.params.id, request.body?.notifyOnOpen ?? false);
      return { ok: true as const };
    },
  );

  app.delete('/vendors/:id/favorite', { schema: { params: vendorParams, response: { 200: ok } } }, async (request) => {
    const user = requireUser(request);
    await removeFavorite(ctx, user.id, request.params.id);
    return { ok: true as const };
  });

  app.get('/me/favorites', { schema: { response: { 200: favoritesResponseSchema } } }, async (request) => {
    const user = requireUser(request);
    return { favorites: await listFavorites(ctx, user.id) };
  });

  // ---------------------------------------------------------------- reviews

  app.put(
    '/vendors/:id/review',
    {
      schema: { params: vendorParams, body: reviewInputSchema, response: { 200: myReviewSchema } },
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    },
    async (request) => upsertReview(ctx, requireUser(request), request.params.id, request.body),
  );

  app.delete('/vendors/:id/review', { schema: { params: vendorParams, response: { 200: ok } } }, async (request) => {
    await deleteReview(ctx, requireUser(request).id, request.params.id);
    return { ok: true as const };
  });

  // ---------------------------------------------------------------- "Still here?"

  app.post(
    '/vendors/:id/still-here',
    {
      schema: { params: vendorParams, body: stillHereInputSchema, response: { 200: stillHereResultSchema } },
      // Per IP, in memory only.
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    },
    async (request) => confirmStillHere(ctx, requireUser(request), request.params.id, request.body.location, daily),
  );

  // ---------------------------------------------------------------- reports

  app.post(
    '/reports',
    {
      schema: { body: reportInputSchema, response: { 200: reportReceivedSchema } },
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request) => createReport(ctx, requireUser(request).id, request.body),
  );
};
