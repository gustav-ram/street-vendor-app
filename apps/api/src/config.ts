import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// One .env at the repo root serves the API, web and mobile apps.
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  WEB_BASE_URL: z.url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32),
  LOCATION_FUZZ_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LIVE_HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
  LIVE_GRACE_SEC: z.coerce.number().int().positive().default(300),
  LIVE_MAX_HOURS: z.coerce.number().positive().default(16),
  STREET_DAY_ENDS_AT: z.string().regex(/^\d{2}:\d{2}$/).default('03:00'),
  DEFAULT_TIMEZONE: z.string().default('America/Los_Angeles'),
  APPROX_CELL_METERS: z.coerce.number().positive().default(180),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  INVITE_REQUIRED: bool,
  REVIEW_PREMODERATION: bool,
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}. Did you copy .env.example to .env?`);
  }
  const e = parsed.data;
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  return {
    env: e.NODE_ENV,
    host: e.API_HOST,
    port: e.API_PORT,
    publicUrl: e.API_PUBLIC_URL.replace(/\/$/, ''),
    databaseUrl: e.NODE_ENV === 'test' && e.TEST_DATABASE_URL ? e.TEST_DATABASE_URL : e.DATABASE_URL,
    corsOrigins: e.CORS_ORIGINS,
    webBaseUrl: e.WEB_BASE_URL.replace(/\/$/, ''),
    jwtSecret: e.JWT_SECRET,
    fuzzSecret: e.LOCATION_FUZZ_SECRET,
    accessTokenTtlMin: e.ACCESS_TOKEN_TTL_MIN,
    refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    live: {
      heartbeatIntervalSec: e.LIVE_HEARTBEAT_INTERVAL_SEC,
      graceSec: e.LIVE_GRACE_SEC,
      maxHours: e.LIVE_MAX_HOURS,
      streetDayEndsAt: e.STREET_DAY_ENDS_AT,
    },
    defaultTimezone: e.DEFAULT_TIMEZONE,
    approxCellMeters: e.APPROX_CELL_METERS,
    uploadDir: e.UPLOAD_DIR.startsWith('/') ? e.UPLOAD_DIR : new URL(e.UPLOAD_DIR, `file://${repoRoot}`).pathname,
    inviteRequired: e.INVITE_REQUIRED,
    reviewPremoderation: e.REVIEW_PREMODERATION,
  };
}
