import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminInviteSchema,
  adminReportsSchema,
  adminVendorSchema,
  adminVendorsQuerySchema,
  createInviteSchema,
  inviteStatsSchema,
  moderationDecisionSchema,
  moderationQueueSchema,
  REPORT_STATUSES,
  reportDecisionSchema,
  updateInviteSchema,
  verificationDecisionSchema,
  verificationProgressSchema,
} from '@streeteats/shared';
import { requireUser } from '../../app';
import { createInvite, getInvite, inviteStats, listInvites, setInviteDisabled } from '../invites/service';
import { decideVerification, listVendorsForAdmin } from '../verification/service';
import { decide, decideReport, listReports, moderationQueue } from './service';

const ok = z.object({ ok: z.literal(true) });

/** Moderators only. Admin accounts are created by the seed or the CLI, never by sign-up. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;
  app.addHook('onRequest', async (request) => {
    requireUser(request, ['admin']);
  });

  app.get('/admin/moderation', { schema: { response: { 200: moderationQueueSchema } } }, async () => moderationQueue(ctx));

  app.post(
    '/admin/moderation/:kind/:id',
    { schema: { params: z.object({ kind: z.enum(['photo', 'review']), id: z.uuid() }), body: moderationDecisionSchema, response: { 200: ok } } },
    async (request) => {
      await decide(ctx, request.params.kind, request.params.id, request.body.decision);
      return { ok: true as const };
    },
  );

  app.get(
    '/admin/reports',
    { schema: { querystring: z.object({ status: z.enum(REPORT_STATUSES).default('open') }), response: { 200: adminReportsSchema } } },
    async (request) => ({ reports: await listReports(ctx, request.query.status) }),
  );

  app.post(
    '/admin/reports/:id',
    { schema: { params: z.object({ id: z.uuid() }), body: reportDecisionSchema, response: { 200: ok } } },
    async (request) => {
      await decideReport(ctx, request.params.id, request.body.status, request.body.adminNote);
      return { ok: true as const };
    },
  );

  // "Community Verified": find a vendor, revoke the badge if it's being abused, or restore it.
  app.get(
    '/admin/vendors',
    { schema: { querystring: adminVendorsQuerySchema, response: { 200: z.object({ vendors: z.array(adminVendorSchema) }) } } },
    async (request) => ({ vendors: await listVendorsForAdmin(ctx, request.query.q, request.query.status) }),
  );

  app.post(
    '/admin/vendors/:id/verification',
    { schema: { params: z.object({ id: z.uuid() }), body: verificationDecisionSchema, response: { 200: verificationProgressSchema } } },
    async (request) => decideVerification(ctx, request.params.id, request.body),
  );

  // Invite codes for flyers. Only counts: how many were made and used, never by whom.
  app.get(
    '/admin/invites',
    { schema: { response: { 200: z.object({ invites: z.array(adminInviteSchema), stats: inviteStatsSchema }) } } },
    async () => ({ invites: await listInvites(ctx), stats: await inviteStats(ctx) }),
  );

  app.post(
    '/admin/invites',
    { schema: { body: createInviteSchema, response: { 201: adminInviteSchema } } },
    async (request, reply) => {
      reply.code(201);
      return createInvite(ctx, request.body);
    },
  );

  app.get(
    '/admin/invites/:id',
    { schema: { params: z.object({ id: z.uuid() }), response: { 200: adminInviteSchema } } },
    async (request) => getInvite(ctx, request.params.id),
  );

  app.patch(
    '/admin/invites/:id',
    { schema: { params: z.object({ id: z.uuid() }), body: updateInviteSchema, response: { 200: adminInviteSchema } } },
    async (request) => setInviteDisabled(ctx, request.params.id, request.body.disabled),
  );
};
