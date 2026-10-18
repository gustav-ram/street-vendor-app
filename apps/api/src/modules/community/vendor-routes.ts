import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  blockInputSchema,
  blocksResponseSchema,
  hidePhotoSchema,
  myPhotosSchema,
  photoCreatedSchema,
  reviewReplySchema,
  vendorPhotoCreateSchema,
  vendorReviewSchema,
} from '@streeteats/shared';
import { requireVendor } from '../dashboard/service';
import { addVendorPhoto, deleteVendorPhoto, getMyPhotos, setCustomerPhotoHidden } from '../photos/service';
import { blockAuthor, listBlocks, unblock } from './blocks';
import { listVendorReviews, setReply } from './reviews';

const idParams = z.object({ id: z.uuid() });
const ok = z.object({ ok: z.literal(true) });

/** The vendor's side of photos, reviews and blocks. */
export const vendorCommunityRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  app.get('/vendor/photos', { schema: { response: { 200: myPhotosSchema } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    return getMyPhotos(ctx, vendor.id);
  });

  app.post(
    '/vendor/photos',
    { schema: { body: vendorPhotoCreateSchema, response: { 201: photoCreatedSchema } }, config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const vendor = await requireVendor(ctx, request);
      reply.code(201);
      return addVendorPhoto(ctx, vendor.id, vendor.userId, request.body);
    },
  );

  app.delete('/vendor/photos/:id', { schema: { params: idParams, response: { 200: ok } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    await deleteVendorPhoto(ctx, vendor.id, request.params.id);
    return { ok: true as const };
  });

  app.patch(
    '/vendor/customer-photos/:id',
    { schema: { params: idParams, body: hidePhotoSchema, response: { 200: ok } } },
    async (request) => {
      const vendor = await requireVendor(ctx, request);
      await setCustomerPhotoHidden(ctx, vendor.id, request.params.id, request.body.hidden);
      return { ok: true as const };
    },
  );

  app.get('/vendor/reviews', { schema: { response: { 200: z.object({ reviews: z.array(vendorReviewSchema) }) } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    return { reviews: await listVendorReviews(ctx, vendor.id, vendor.userId) };
  });

  app.put('/vendor/reviews/:id/reply', { schema: { params: idParams, body: reviewReplySchema, response: { 200: ok } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    await setReply(ctx, vendor.id, request.params.id, request.body.body);
    return { ok: true as const };
  });

  app.delete('/vendor/reviews/:id/reply', { schema: { params: idParams, response: { 200: ok } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    await setReply(ctx, vendor.id, request.params.id, null);
    return { ok: true as const };
  });

  app.get('/vendor/blocks', { schema: { response: { 200: blocksResponseSchema } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    return { blocks: await listBlocks(ctx, vendor.userId) };
  });

  app.post('/vendor/blocks', { schema: { body: blockInputSchema, response: { 200: ok } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    await blockAuthor(ctx, vendor.id, vendor.userId, request.body);
    return { ok: true as const };
  });

  app.delete('/vendor/blocks/:id', { schema: { params: z.object({ id: z.string().max(64) }), response: { 200: ok } } }, async (request) => {
    const vendor = await requireVendor(ctx, request);
    await unblock(ctx, vendor.userId, request.params.id);
    return { ok: true as const };
  });
};
