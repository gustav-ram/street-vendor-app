import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  deleteInputSchema,
  goLiveSchema,
  heartbeatSchema,
  liveStatusSchema,
  menuItemInputSchema,
  myVendorSchema,
  quickStartSchema,
  soldOutInputSchema,
  statusPostInputSchema,
  vendorProfileUpdateSchema,
  writeResultSchema,
} from '@streeteats/shared';
import { requireUser } from '../../app';
import { ApiError } from '../../lib/errors';
import {
  endLiveSession,
  getLiveStatus,
  heartbeatLiveSession,
  pendingOpenNotifications,
  startLiveSession,
} from '../live/service';
import * as dash from './service';

const idParams = z.object({ id: z.uuid() });

/** Vendor dashboard: signed-in vendors only, acting on their own business. */
export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  const requireVendor = (request: FastifyRequest) => dash.requireVendor(ctx, request);

  app.post(
    '/vendor/quick-start',
    { schema: { body: quickStartSchema, response: { 201: myVendorSchema } } },
    async (request, reply) => {
      const user = requireUser(request, ['vendor']);
      reply.code(201);
      return dash.quickStart(ctx, user.id, request.body);
    },
  );

  app.get('/vendor/me', { schema: { response: { 200: myVendorSchema } } }, async (request) => {
    const vendor = await requireVendor(request);
    return dash.getMyVendor(ctx, vendor.id);
  });

  app.patch(
    '/vendor/me',
    { schema: { body: vendorProfileUpdateSchema, response: { 200: myVendorSchema } } },
    async (request) => dash.updateProfile(ctx, await requireVendor(request), request.body),
  );

  // ---------------------------------------------------------------- menu

  app.put(
    '/vendor/menu/:id',
    { schema: { params: idParams, body: menuItemInputSchema, response: { 200: writeResultSchema } } },
    async (request) => {
      const vendor = await requireVendor(request);
      return { result: await dash.upsertMenuItem(ctx, vendor.id, request.params.id, request.body) };
    },
  );

  app.put(
    '/vendor/menu/:id/sold-out',
    { schema: { params: idParams, body: soldOutInputSchema, response: { 200: writeResultSchema } } },
    async (request) => {
      const vendor = await requireVendor(request);
      const { soldOut, clientUpdatedAt } = request.body;
      return { result: await dash.setSoldOut(ctx, vendor.id, request.params.id, soldOut, clientUpdatedAt) };
    },
  );

  app.delete(
    '/vendor/menu/:id',
    { schema: { params: idParams, body: deleteInputSchema, response: { 200: writeResultSchema } } },
    async (request) => {
      const vendor = await requireVendor(request);
      return { result: await dash.deleteMenuItem(ctx, vendor.id, request.params.id, request.body.clientUpdatedAt) };
    },
  );

  // ---------------------------------------------------------------- status posts

  app.put(
    '/vendor/status/:id',
    { schema: { params: idParams, body: statusPostInputSchema, response: { 200: writeResultSchema } } },
    async (request) => {
      const vendor = await requireVendor(request);
      return { result: await dash.upsertStatusPost(ctx, vendor, request.params.id, request.body) };
    },
  );

  app.delete(
    '/vendor/status/:id',
    { schema: { params: idParams, body: deleteInputSchema, response: { 200: writeResultSchema } } },
    async (request) => {
      const vendor = await requireVendor(request);
      return { result: await dash.deleteStatusPost(ctx, vendor.id, request.params.id, request.body.clientUpdatedAt) };
    },
  );

  // ---------------------------------------------------------------- live (Go Live / heartbeat / close)

  app.get('/vendor/live', { schema: { response: { 200: liveStatusSchema } } }, async (request) => {
    const vendor = await requireVendor(request);
    return getLiveStatus(ctx, vendor.id);
  });

  app.post(
    '/vendor/live',
    { schema: { body: goLiveSchema, response: { 200: liveStatusSchema } }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const vendor = await requireVendor(request);
      const { location, precision, autoOffHours, endsAt } = request.body;
      const status = await startLiveSession(ctx, vendor, location, { precision, autoOffHours, endsAt });
      const waiting = await pendingOpenNotifications(ctx, vendor.id);
      // Stub for push: a count only, never who.
      if (waiting > 0) request.log.info({ count: waiting }, 'open notifications (stub, not sent)');
      return status;
    },
  );

  app.post(
    '/vendor/live/heartbeat',
    { schema: { body: heartbeatSchema, response: { 200: liveStatusSchema } }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const vendor = await requireVendor(request);
      return heartbeatLiveSession(ctx, vendor.id, request.body.location, request.body.startedAt);
    },
  );

  app.delete('/vendor/live', { schema: { response: { 200: liveStatusSchema } } }, async (request) => {
    const vendor = await requireVendor(request);
    await endLiveSession(ctx, vendor.id);
    return getLiveStatus(ctx, vendor.id);
  });
};
