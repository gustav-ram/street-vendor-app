import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { Me, Role, UiLocale } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { authSessions, inviteCodes, users, vendorProfiles } from '../../db/schema';
import { ApiError, isUniqueViolation } from '../../lib/errors';
import { burnVerifyTime, hashSecret, verifySecret } from '../../lib/passwords';
import { hashRefreshToken, newRefreshToken } from '../../lib/tokens';

const LOCK_MINUTES = 15;
// A 6-digit PIN has far fewer combinations than a password, so it locks sooner.
const MAX_FAILURES = { pin: 5, password: 10 } as const;

export interface RegisterParams {
  email?: string;
  phone?: string;
  role: 'customer' | 'vendor';
  credential: { kind: 'password' | 'pin'; secret: string };
  displayName?: string;
  locale?: UiLocale;
  inviteCode?: string;
}

export async function register(ctx: AppContext, p: RegisterParams) {
  const passwordHash = await hashSecret(p.credential.secret);
  try {
    return await ctx.db.transaction(async (tx) => {
      if (p.inviteCode || ctx.config.inviteRequired) {
        // Aggregate only: bump the counter, never record who redeemed it.
        const redeemed = await tx
          .update(inviteCodes)
          .set({ redemptionCount: sql`${inviteCodes.redemptionCount} + 1` })
          .where(
            and(
              eq(inviteCodes.code, (p.inviteCode ?? '').toUpperCase()),
              eq(inviteCodes.disabled, false),
              or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, sql`now()`)),
              or(isNull(inviteCodes.maxRedemptions), lt(inviteCodes.redemptionCount, inviteCodes.maxRedemptions)),
            ),
          )
          .returning({ id: inviteCodes.id });
        if (redeemed.length === 0) throw new ApiError('invalid_invite');
      }
      const [user] = await tx
        .insert(users)
        .values({
          role: p.role,
          email: p.email ?? null,
          phone: p.phone ?? null,
          passwordHash,
          credentialKind: p.credential.kind,
          displayName: p.displayName ?? null,
          locale: p.locale ?? 'en',
        })
        .returning();
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('identifier_taken');
    throw err;
  }
}

export async function login(ctx: AppContext, p: { email?: string; phone?: string; secret: string }) {
  const where = p.email ? eq(users.email, p.email) : eq(users.phone, p.phone!);
  const [user] = await ctx.db.select().from(users).where(where).limit(1);
  if (!user) {
    await burnVerifyTime(p.secret);
    throw new ApiError('invalid_credentials');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError('account_locked');

  const ok = await verifySecret(user.passwordHash, p.secret);
  if (!ok) {
    const failures = user.failedLogins + 1;
    const lock = failures >= MAX_FAILURES[user.credentialKind];
    await ctx.db
      .update(users)
      .set(
        lock
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failures },
      )
      .where(eq(users.id, user.id));
    throw new ApiError(lock ? 'account_locked' : 'invalid_credentials');
  }
  if (user.failedLogins > 0 || user.lockedUntil) {
    await ctx.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  }
  return user;
}

/** Starts a new refresh-token family (a fresh login). */
export async function issueSession(ctx: AppContext, user: { id: string; role: Role }) {
  return createSessionRow(ctx, user, randomUUID());
}

async function createSessionRow(ctx: AppContext, user: { id: string; role: Role }, familyId: string) {
  const refresh = newRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + ctx.config.refreshTokenTtlDays * 86_400_000);
  await ctx.db.insert(authSessions).values({
    userId: user.id,
    familyId,
    refreshHash: refresh.hash,
    expiresAt: refreshExpiresAt,
  });
  const access = await ctx.tokens.signAccess(user);
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken: refresh.token, refreshExpiresAt };
}

/**
 * Rotates a refresh token. Presenting a token that was already rotated means
 * it leaked (or was replayed), so the whole family is revoked.
 */
export async function rotateRefreshToken(ctx: AppContext, token: string) {
  const [session] = await ctx.db
    .select()
    .from(authSessions)
    .where(eq(authSessions.refreshHash, hashRefreshToken(token)))
    .limit(1);
  if (!session) throw new ApiError('unauthorized');
  if (session.revokedAt) {
    await revokeFamily(ctx, session.familyId);
    throw new ApiError('unauthorized');
  }
  if (session.expiresAt <= new Date()) throw new ApiError('unauthorized');

  const revoked = await ctx.db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
  // Lost a race with a concurrent refresh of the same token: treat as reuse.
  if (revoked.length === 0) {
    await revokeFamily(ctx, session.familyId);
    throw new ApiError('unauthorized');
  }

  const [user] = await ctx.db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) throw new ApiError('unauthorized');
  return { user, tokens: await createSessionRow(ctx, user, session.familyId) };
}

export async function revokeByToken(ctx: AppContext, token: string) {
  const [session] = await ctx.db
    .select({ familyId: authSessions.familyId })
    .from(authSessions)
    .where(eq(authSessions.refreshHash, hashRefreshToken(token)))
    .limit(1);
  if (session) await revokeFamily(ctx, session.familyId);
}

async function revokeFamily(ctx: AppContext, familyId: string) {
  await ctx.db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.familyId, familyId), isNull(authSessions.revokedAt)));
}

export async function getMe(ctx: AppContext, userId: string): Promise<Me> {
  const [row] = await ctx.db
    .select({ user: users, vendorId: vendorProfiles.id })
    .from(users)
    .leftJoin(vendorProfiles, eq(vendorProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new ApiError('unauthorized');
  const u = row.user;
  return {
    id: u.id,
    role: u.role,
    displayName: u.displayName,
    locale: u.locale === 'es' ? 'es' : 'en',
    hasEmail: u.email !== null,
    hasPhone: u.phone !== null,
    vendorId: row.vendorId,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function updateMe(ctx: AppContext, userId: string, patch: { displayName?: string; locale?: UiLocale }) {
  if (patch.displayName === undefined && patch.locale === undefined) return;
  await ctx.db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
