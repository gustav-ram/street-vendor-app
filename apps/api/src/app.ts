import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyRequest, LogController } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import type { DestinationStream } from 'pino';
import type { Role } from '@streeteats/shared';
import type { Config } from './config';
import type { Db } from './db/client';
import { ApiError } from './lib/errors';
import { loggerOptions, safeError } from './lib/logging';
import { createStorage, type Storage } from './lib/storage';
import { type AuthUser, createTokenService, type TokenService } from './lib/tokens';
import { adminRoutes } from './modules/admin/routes';
import { authRoutes } from './modules/auth/routes';
import { communityRoutes } from './modules/community/routes';
import { vendorCommunityRoutes } from './modules/community/vendor-routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { discoveryRoutes } from './modules/discovery/routes';
import { mediaRoutes, photoRoutes } from './modules/photos/routes';
import { uploadRoutes } from './modules/uploads/routes';

export interface AppContext {
  config: Config;
  db: Db;
  tokens: TokenService;
  storage: Storage;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export interface BuildAppOptions {
  config: Config;
  db: Db;
  /** Tests turn rate limiting off except where they exercise it. */
  rateLimit?: boolean;
  /** Tests capture log output here. */
  logStream?: DestinationStream;
}

export async function buildApp({ config, db, rateLimit: rateLimitEnabled = true, logStream }: BuildAppOptions) {
  const app = Fastify({
    logger: loggerOptions(config, logStream),
    // Fastify's built-in request lines include the raw URL; we log our own below.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 256 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('ctx', { config, db, tokens: createTokenService(config), storage: createStorage(config.uploadDir) });
  app.decorateRequest('user', null);

  // One line per request, with the route pattern only (see lib/logging.ts).
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? '(unmatched)',
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  // Attach the caller (or null). Invalid or expired tokens are treated as
  // anonymous; protected routes then answer 401 and the client refreshes.
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      request.user = await app.ctx.tokens.verifyAccess(header.slice(7));
    }
  });

  app.setErrorHandler((err: FastifyError | ApiError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: {
          code: 'validation_failed',
          issues: err.validation.map((v) => ({
            path: v.instancePath,
            // Custom messages in shared schemas are already codes (e.g. "invalid_pin").
            code: /^[a-z_]+$/.test(v.message ?? '') ? v.message! : v.keyword,
          })),
        },
      });
    }
    if (err instanceof ApiError) {
      return reply.code(err.status).send({ error: { code: err.code } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.code(429).send({ error: { code: 'rate_limited' } });
    if (status === 413) return reply.code(413).send({ error: { code: 'payload_too_large' } });
    if (status === 415) return reply.code(415).send({ error: { code: 'unsupported_media' } });
    if (status === 404) return reply.code(404).send({ error: { code: 'not_found' } });
    if (status >= 400 && status < 500) return reply.code(400).send({ error: { code: 'validation_failed' } });
    request.log.error({ err: safeError(err), route: request.routeOptions.url }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal' } });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'not_found' } }));

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Client', 'Upload-Offset'],
    exposedHeaders: ['Upload-Offset', 'Upload-Length'],
  });
  await app.register(cookie);
  if (rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      // Counters live in memory only and are never logged.
      errorResponseBuilder: () => ({ statusCode: 429, code: 'rate_limited', message: 'rate_limited' }),
    });
  }

  app.get('/health', async () => {
    await db.execute(sql`select 1`);
    return { ok: true };
  });

  await app.register(authRoutes, { prefix: '/v1' });
  await app.register(discoveryRoutes, { prefix: '/v1' });
  await app.register(dashboardRoutes, { prefix: '/v1' });
  await app.register(uploadRoutes, { prefix: '/v1' });
  await app.register(photoRoutes, { prefix: '/v1' });
  await app.register(communityRoutes, { prefix: '/v1' });
  await app.register(vendorCommunityRoutes, { prefix: '/v1' });
  await app.register(adminRoutes, { prefix: '/v1' });
  await app.register(mediaRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

/** Returns the signed-in caller or throws 401/403. */
export function requireUser(request: FastifyRequest, roles?: readonly Role[]): AuthUser {
  if (!request.user) throw new ApiError('unauthorized');
  if (roles && !roles.includes(request.user.role)) throw new ApiError('forbidden');
  return request.user;
}
