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

/**
 * Error details that are safe to log. Database errors are reduced to their
 * SQLSTATE code: the driver's message (and the first line of the stack)
 * repeats the query parameters, which can include coordinates or emails.
 */
export function safeError(err: unknown) {
  if (!err || typeof err !== 'object') return { type: typeof err, message: 'non-error thrown', stack: '' };
  const e = err as { name?: string; message?: string; stack?: string; code?: unknown; cause?: unknown };
  const frames = (e.stack ?? '').split('\n').filter((line) => line.trimStart().startsWith('at ')).join('\n');
  const sqlState = findSqlState(e);
  if (sqlState || e.name === 'DrizzleQueryError' || e.message?.startsWith('Failed query')) {
    return { type: 'DatabaseError', message: 'database query failed', code: sqlState, stack: frames };
  }
  return {
    type: e.name ?? 'Error',
    message: e.message ?? '',
    code: typeof e.code === 'string' ? e.code : undefined,
    stack: frames,
  };
}

function findSqlState(e: { code?: unknown; cause?: unknown }, depth = 0): string | undefined {
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  if (e.cause && typeof e.cause === 'object' && depth < 3) return findSqlState(e.cause as { code?: unknown; cause?: unknown }, depth + 1);
  return undefined;
}
