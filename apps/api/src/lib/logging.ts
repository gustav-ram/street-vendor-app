import type { DestinationStream } from 'pino';
import type { FastifyServerOptions } from 'fastify';
import type { Config } from '../config';

/**
 * Privacy rules for logs (PRIVACY_DESIGN.md):
 * - never log request bodies, query strings, headers or client IPs
 *   (customer and vendor coordinates travel in bodies; IPs are personal data);
 * - one line per request with the route *pattern* (/v1/vendors/:id), not the raw URL;
 * - errors are logged as name/message/code/stack only. Driver errors carry
 *   the query parameters as properties, which could include coordinates.
 */
export function loggerOptions(config: Config, stream?: DestinationStream): FastifyServerOptions['logger'] {
  const base = {
    level: 'info',
    serializers: {
      req: () => ({}),
      res: () => ({}),
      err: safeError,
    },
  };
  // Tests pass a stream to inspect exactly what would be written.
  if (stream) return { ...base, stream };
  if (config.env === 'test') return false;
  return {
    ...base,
    ...(config.env === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  };
}

export function safeError(err: unknown) {
  if (!(err instanceof Error)) return { type: typeof err, message: 'non-error thrown', stack: '' };
  const code = (err as { code?: unknown }).code;
  return {
    type: err.name,
    message: err.message,
    code: typeof code === 'string' ? code : undefined,
    stack: err.stack ?? '',
  };
}
