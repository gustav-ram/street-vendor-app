import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authResponseSchema,
  loginSchema,
  meSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from '@streeteats/shared';
import { requireUser } from '../../app';
import { ApiError } from '../../lib/errors';
import * as auth from './service';

export const REFRESH_COOKIE = 'se_rt';
const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/**
 * Refresh-token transport:
 * - mobile sends `X-Client: mobile` and gets the token in the body (kept in SecureStore);
 * - browsers get an httpOnly cookie scoped to /v1/auth and never see the token.
 * Cookie-based refresh/logout also require `X-Requested-With`, which a
 * cross-site form can't send and CORS only allows from our web origin.
 */
function isMobile(request: FastifyRequest) {
  return request.headers['x-client'] === 'mobile';
}

function requireCsrfHeader(request: FastifyRequest) {
  if (request.headers['x-requested-with'] !== 'streeteats') throw new ApiError('forbidden');
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { ctx } = app;

  async function respondWithSession(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
    tokens: Awaited<ReturnType<typeof auth.issueSession>>,
  ) {
    const user = await auth.getMe(ctx, userId);
    if (isMobile(request)) {
      return { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(), refreshToken: tokens.refreshToken, user };
    }
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.config.env === 'production',
      path: '/v1/auth',
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(), user };
  }

  app.post(
    '/auth/register',
    { schema: { body: registerSchema, response: { 201: authResponseSchema } }, config: AUTH_RATE_LIMIT },
    async (request, reply) => {
      const user = await auth.register(ctx, request.body);
      const tokens = await auth.issueSession(ctx, user);
      reply.code(201);
      return respondWithSession(request, reply, user.id, tokens);
    },
  );

  app.post(
    '/auth/login',
    { schema: { body: loginSchema, response: { 200: authResponseSchema } }, config: AUTH_RATE_LIMIT },
    async (request, reply) => {
      const user = await auth.login(ctx, request.body);
      const tokens = await auth.issueSession(ctx, user);
      return respondWithSession(request, reply, user.id, tokens);
    },
  );

  app.post(
    '/auth/refresh',
    { schema: { body: refreshSchema.nullish(), response: { 200: authResponseSchema } }, config: AUTH_RATE_LIMIT },
    async (request, reply) => {
      let token = request.body?.refreshToken;
      if (!token) {
        requireCsrfHeader(request);
        token = request.cookies[REFRESH_COOKIE];
      }
      if (!token) throw new ApiError('unauthorized');
      const { user, tokens } = await auth.rotateRefreshToken(ctx, token);
      return respondWithSession(request, reply, user.id, tokens);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { body: refreshSchema.nullish(), response: { 204: z.null() } } },
    async (request, reply) => {
      let token = request.body?.refreshToken;
      if (!token && request.cookies[REFRESH_COOKIE]) {
        requireCsrfHeader(request);
        token = request.cookies[REFRESH_COOKIE];
      }
      if (token) await auth.revokeByToken(ctx, token);
      reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
      return reply.code(204).send(null);
    },
  );

  app.get('/me', { schema: { response: { 200: meSchema } } }, async (request) => {
    const user = requireUser(request);
    return auth.getMe(ctx, user.id);
  });

  app.patch('/me', { schema: { body: updateMeSchema, response: { 200: meSchema } } }, async (request) => {
    const user = requireUser(request);
    await auth.updateMe(ctx, user.id, request.body);
    return auth.getMe(ctx, user.id);
  });
};
