import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { customerPhotoCreateSchema, photoCreatedSchema } from '@streeteats/shared';
import { requireUser } from '../../app';
import { ApiError } from '../../lib/errors';
import { addCustomerPhoto, findServablePhoto, readPhotoForViewer } from './service';

const IMAGE_HEADERS = {
  'content-type': 'image/webp',
  'x-content-type-options': 'nosniff',
  'content-disposition': 'inline',
};

/** Public image files at /media/:key (outside /v1 so <img> tags can load them). */
export const mediaRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;
  app.get(
    '/media/:key',
    { schema: { params: z.object({ key: z.string().regex(/^[a-f0-9]{32}$/) }) }, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!(await findServablePhoto(ctx, request.params.key))) throw new ApiError('not_found');
      // Short cache, so a photo that's hidden or taken down stops showing soon.
      return reply.headers({ ...IMAGE_HEADERS, 'cache-control': 'public, max-age=300' }).send(ctx.storage.photoStream(request.params.key));
    },
  );
};

export const photoRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.post(
    '/vendors/:id/photos',
    {
      schema: { params: z.object({ id: z.uuid() }), body: customerPhotoCreateSchema, response: { 201: photoCreatedSchema } },
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const user = requireUser(request);
      reply.code(201);
      return addCustomerPhoto(ctx, user, request.params.id, request.body);
    },
  );

  // Not-yet-public photos, for moderators, their uploader, or the vendor (see readPhotoForViewer).
  app.get(
    '/photos/:id/image',
    { schema: { params: z.object({ id: z.uuid() }), querystring: z.object({ size: z.enum(['thumb', 'full']).default('thumb') }) } },
    async (request, reply) => {
      const user = requireUser(request);
      const data = await readPhotoForViewer(ctx, user, request.params.id, request.query.size);
      return reply.headers({ ...IMAGE_HEADERS, 'cache-control': 'private, no-store' }).send(data);
    },
  );
};
