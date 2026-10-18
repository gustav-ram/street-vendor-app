import type { ErrorCode } from '@streeteats/shared';

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  invalid_credentials: 401,
  forbidden: 403,
  account_locked: 423,
  not_found: 404,
  conflict: 409,
  identifier_taken: 409,
  invalid_invite: 400,
  payload_too_large: 413,
  onboarding_required: 409,
  already_onboarded: 409,
  not_live: 409,
  live_elsewhere: 409,
  vacation_mode: 409,
  rate_limited: 429,
  internal: 500,
};

/** An error whose code is safe to send to clients (they translate it). */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    status?: number,
  ) {
    super(code);
    this.status = status ?? STATUS[code];
  }
}

/** Postgres unique_violation, optionally for a specific constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  if (e?.code === '23505') return !constraint || e.constraint_name === constraint;
  return e?.cause ? isUniqueViolation(e.cause, constraint) : false;
}
