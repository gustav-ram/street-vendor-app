import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
    .default('http://localhost:3100')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  WEB_BASE_URL: z.url().default('http://localhost:3100'),
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
  PHOTO_MAX_PIXELS: z.coerce.number().int().positive().default(40_000_000),
  STILL_HERE_MIN_ACCOUNT_AGE_HOURS: z.coerce.number().min(0).default(24),
  STILL_HERE_RADIUS_APPROX_M: z.coerce.number().positive().default(400),
  STILL_HERE_RADIUS_EXACT_M: z.coerce.number().positive().default(200),
  STILL_HERE_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
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
    // Tests write to their own folder so they never touch real uploads.
    uploadDir: join(e.UPLOAD_DIR.startsWith('/') ? e.UPLOAD_DIR : join(repoRoot, e.UPLOAD_DIR), e.NODE_ENV === 'test' ? 'test' : ''),
    photoMaxPixels: e.PHOTO_MAX_PIXELS,
    stillHere: {
      minAccountAgeHours: e.STILL_HERE_MIN_ACCOUNT_AGE_HOURS,
      radiusApproxM: e.STILL_HERE_RADIUS_APPROX_M,
      radiusExactM: e.STILL_HERE_RADIUS_EXACT_M,
      dailyLimit: e.STILL_HERE_DAILY_LIMIT,
    },
    inviteRequired: e.INVITE_REQUIRED,
    reviewPremoderation: e.REVIEW_PREMODERATION,
  };
}
