import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminReportsSchema,
  adminVendorSchema,
  adminVendorsQuerySchema,
  moderationDecisionSchema,
  moderationQueueSchema,
  REPORT_STATUSES,
  reportDecisionSchema,
  verificationDecisionSchema,
  verificationProgressSchema,
} from '@streeteats/shared';
import { requireUser } from '../../app';
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
};
