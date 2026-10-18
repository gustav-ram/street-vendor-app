import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createUploadSchema, LIMITS, uploadStateSchema } from '@streeteats/shared';
import { requireUser } from '../../app';
import { ApiError } from '../../lib/errors';
import { createUpload, uploadState, writeChunk } from './service';

const idParams = z.object({ id: z.uuid() });

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  // Chunks arrive as raw bytes, never parsed. The tus type is the convention, but
  // React Native sends a sliced Blob with an empty Content-Type, so in these routes
  // any non-JSON body is taken as raw bytes; the first chunk is still checked to be an image.
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: LIMITS.uploadChunkBytes * 2 }, (_request, body, done) => done(null, body));

  app.post(
    '/uploads',
    {
      schema: { body: createUploadSchema, response: { 201: uploadStateSchema } },
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const user = requireUser(request);
      reply.code(201);
      return createUpload(ctx, user.id, request.body);
    },
  );

  app.head('/uploads/:id', { schema: { params: idParams } }, async (request, reply) => {
    const user = requireUser(request);
    const state = await uploadState(ctx, user.id, request.params.id);
    return reply
      .header('upload-offset', String(state.offset))
      .header('upload-length', String(state.totalBytes))
      .header('cache-control', 'no-store')
      .send();
  });

  app.patch(
    '/uploads/:id',
    {
      schema: {
        params: idParams,
        headers: z.object({ 'upload-offset': z.coerce.number().int().min(0) }),
        response: { 200: uploadStateSchema },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const body = request.body;
      if (!Buffer.isBuffer(body)) throw new ApiError('unsupported_media');
      const state = await writeChunk(ctx, user.id, request.params.id, request.headers['upload-offset'], body);
      return reply.header('upload-offset', String(state.offset)).send(state);
    },
  );
};
