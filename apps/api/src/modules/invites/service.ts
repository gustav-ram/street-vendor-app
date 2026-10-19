import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { AdminInvite, CreateInviteInput } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { inviteCodes } from '../../db/schema';
import { ApiError, isUniqueViolation } from '../../lib/errors';

/**
 * Invite codes for flyers (PLAN.md §6.7). A code only counts how many times
 * it was used: redeeming it bumps a number and nothing links the code to the
 * account that used it.
 */

const WORDS = ['TACO', 'ELOTE', 'FLOR', 'DOGO', 'CHURRO', 'FRUTA', 'TAMAL', 'PALETA', 'PUPUSA', 'AGUA'];
// No 0/O or 1/I/L, so a code read off a printed flyer can't be mistyped.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newInviteCode() {
  const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${WORDS[randomInt(WORDS.length)]}-${suffix}`;
}

type Row = typeof inviteCodes.$inferSelect;
const toAdmin = (r: Row): AdminInvite => ({
  id: r.id,
  code: r.code,
  label: r.label,
  maxRedemptions: r.maxRedemptions,
  redemptionCount: r.redemptionCount,
  expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  disabled: r.disabled,
  createdAt: r.createdAt.toISOString(),
});

export async function createInvite(ctx: AppContext, input: CreateInviteInput): Promise<AdminInvite> {
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await ctx.db
        .insert(inviteCodes)
        .values({ code: newInviteCode(), label: input.label, maxRedemptions: input.maxRedemptions ?? null, expiresAt })
        .returning();
      return toAdmin(row!);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new ApiError('conflict');
}

export async function listInvites(ctx: AppContext): Promise<AdminInvite[]> {
  const rows = await ctx.db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt)).limit(200);
  return rows.map(toAdmin);
}

export async function getInvite(ctx: AppContext, id: string): Promise<AdminInvite> {
  const [row] = await ctx.db.select().from(inviteCodes).where(eq(inviteCodes.id, id));
  if (!row) throw new ApiError('not_found');
  return toAdmin(row);
}

export async function setInviteDisabled(ctx: AppContext, id: string, disabled: boolean) {
  const [row] = await ctx.db.update(inviteCodes).set({ disabled }).where(eq(inviteCodes.id, id)).returning();
  if (!row) throw new ApiError('not_found');
  return toAdmin(row);
}

/** Can this code be used right now? The same rules registration applies. */
export async function checkInvite(ctx: AppContext, code: string) {
  const [row] = await ctx.db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, code.trim().toUpperCase()),
        eq(inviteCodes.disabled, false),
        or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, sql`now()`)),
        or(isNull(inviteCodes.maxRedemptions), lt(inviteCodes.redemptionCount, inviteCodes.maxRedemptions)),
      ),
    );
  return { valid: Boolean(row) };
}

export async function inviteStats(ctx: AppContext) {
  const [row] = await ctx.db.execute<{ codes: number; redemptions: number }>(sql`
    SELECT count(*)::int AS codes, coalesce(sum(redemption_count), 0)::int AS redemptions FROM invite_codes`);
  return { codes: Number(row?.codes ?? 0), redemptions: Number(row?.redemptions ?? 0) };
}
