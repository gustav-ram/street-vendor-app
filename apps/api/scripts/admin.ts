import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AppContext } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { authSessions, inviteCodes, users } from '../src/db/schema';
import { isMain } from '../src/lib/is-main';
import { hashSecret } from '../src/lib/passwords';
import { createStorage } from '../src/lib/storage';
import { createTokenService } from '../src/lib/tokens';
import { purgeUser } from '../src/modules/account/service';
import { createInvite, inviteStats, listInvites } from '../src/modules/invites/service';
import { decideVerification } from '../src/modules/verification/service';

/**
 * The admin command line (npm run admin -- <command>). For the things that
 * have no screen: creating admins, password resets (there's no email or SMS),
 * invite codes, badges and deleting an account on request.
 *
 * New passwords are printed once, here in your terminal, and never stored in
 * readable form.
 */

const HELP = `Usage: npm run admin -- <command>

  create-admin <email> [--name "Name"]     Create an admin account (prints a new password once)
  reset-password <email or phone>          New password or PIN, unlocks, signs out everywhere
  invite create --label "Text" [--max N] [--days N]
  invite list
  invite disable <CODE> | invite enable <CODE>
  badge revoke <vendor name or id> --reason "Text"
  badge restore <vendor name or id>
  delete-account <email or phone> --yes    Delete the account and everything in it, files included
  stats                                    Totals only: accounts, live vendors, open reports, queues, invites
`;

type Print = (line: string) => void;

function parse(args: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

const ALNUM = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newPassword = () => Array.from({ length: 16 }, () => ALNUM[randomInt(ALNUM.length)]).join('');
const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

async function findUser(ctx: AppContext, identifier: string) {
  const id = identifier.trim().toLowerCase();
  const [user] = await ctx.db
    .select({ id: users.id, role: users.role, credentialKind: users.credentialKind })
    .from(users)
    .where(id.includes('@') ? sql`${users.email} = ${id}` : sql`${users.phone} = ${identifier.replace(/[\s().-]/g, '')}`);
  return user ?? null;
}

async function findVendor(ctx: AppContext, nameOrId: string, print: Print) {
  const rows = await ctx.db.execute<{ id: string; display_name: string }>(
    /^[0-9a-f-]{36}$/i.test(nameOrId)
      ? sql`SELECT id, display_name FROM vendor_profiles WHERE id = ${nameOrId}`
      : sql`SELECT id, display_name FROM vendor_profiles WHERE display_name ILIKE ${nameOrId}`,
  );
  if (rows.length === 1) return rows[0]!;
  print(rows.length === 0 ? `No vendor called "${nameOrId}".` : `Several vendors match "${nameOrId}"; use the id:`);
  rows.forEach((r) => print(`  ${r.id}  ${r.display_name}`));
  return null;
}

/** Runs one command. Returns the exit code. */
export async function runAdmin(ctx: AppContext, args: string[], print: Print = console.log): Promise<number> {
  const { positional, flags } = parse(args);
  const [command, sub, arg] = positional;

  switch (command) {
    case 'create-admin': {
      const email = sub?.trim().toLowerCase();
      if (!email || !email.includes('@')) return print(HELP), 1;
      const password = newPassword();
      try {
        await ctx.db.insert(users).values({
          role: 'admin',
          email,
          passwordHash: await hashSecret(password),
          credentialKind: 'password',
          displayName: typeof flags.name === 'string' ? flags.name : 'Admin',
        });
      } catch {
        print(`An account with ${email} already exists.`);
        return 1;
      }
      print(`Admin ${email} created. Password (shown once, write it down): ${password}`);
      return 0;
    }

    case 'reset-password': {
      if (!sub) return print(HELP), 1;
      const user = await findUser(ctx, sub);
      if (!user) return print('No account with that email or phone.'), 1;
      const secret = user.credentialKind === 'pin' ? newPin() : newPassword();
      await ctx.db
        .update(users)
        .set({ passwordHash: await hashSecret(secret), failedLogins: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      // Every device has to sign in again with the new one.
      await ctx.db.delete(authSessions).where(eq(authSessions.userId, user.id));
      print(`New ${user.credentialKind === 'pin' ? 'PIN' : 'password'} (shown once): ${secret}`);
      return 0;
    }

    case 'invite': {
      if (sub === 'create') {
        if (typeof flags.label !== 'string') return print('invite create needs --label "Text".'), 1;
        const invite = await createInvite(ctx, {
          label: flags.label,
          maxRedemptions: typeof flags.max === 'string' ? Number(flags.max) : undefined,
          expiresInDays: typeof flags.days === 'string' ? Number(flags.days) : undefined,
        });
        print(`Code ${invite.code} for "${invite.label}". Sign-up link: ${ctx.config.webBaseUrl}/join?code=${invite.code}`);
        return 0;
      }
      if (sub === 'list') {
        const invites = await listInvites(ctx);
        if (invites.length === 0) print('No invite codes yet.');
        for (const i of invites) {
          const limit = i.maxRedemptions ? `/${i.maxRedemptions}` : '';
          const state = i.disabled ? ' (disabled)' : i.expiresAt && new Date(i.expiresAt) < new Date() ? ' (expired)' : '';
          print(`${i.code.padEnd(12)} used ${i.redemptionCount}${limit}${state}  ${i.label}`);
        }
        return 0;
      }
      if ((sub === 'disable' || sub === 'enable') && arg) {
        const rows = await ctx.db
          .update(inviteCodes)
          .set({ disabled: sub === 'disable' })
          .where(eq(inviteCodes.code, arg.toUpperCase()))
          .returning({ code: inviteCodes.code });
        if (rows.length === 0) return print(`No code ${arg}.`), 1;
        print(`${rows[0]!.code} ${sub}d.`);
        return 0;
      }
      return print(HELP), 1;
    }

    case 'badge': {
      if ((sub !== 'revoke' && sub !== 'restore') || !arg) return print(HELP), 1;
      const vendor = await findVendor(ctx, arg, print);
      if (!vendor) return 1;
      if (sub === 'revoke') {
        if (typeof flags.reason !== 'string') return print('badge revoke needs --reason "Text" (the vendor sees it).'), 1;
        await decideVerification(ctx, vendor.id, { action: 'revoke', reason: flags.reason });
        print(`Badge revoked for ${vendor.display_name}. It stays off until restored.`);
      } else {
        const p = await decideVerification(ctx, vendor.id, { action: 'restore' });
        print(`Badge restored for ${vendor.display_name}: ${p.status === 'verified' ? 'verified again' : 'criteria not met yet'}.`);
      }
      return 0;
    }

    case 'delete-account': {
      if (!sub) return print(HELP), 1;
      const user = await findUser(ctx, sub);
      if (!user) return print('No account with that email or phone.'), 1;
      if (flags.yes !== true) return print('This deletes the account and everything in it, files included. Run again with --yes.'), 1;
      await purgeUser(ctx, user.id);
      print('Account deleted, with everything that belonged to it.');
      return 0;
    }

    case 'stats': {
      const [s] = await ctx.db.execute<Record<string, number>>(sql`
        SELECT
          (SELECT count(*) FROM users WHERE role = 'customer')::int AS customers,
          (SELECT count(*) FROM users WHERE role = 'vendor')::int AS vendors,
          (SELECT count(*) FROM users WHERE role = 'admin')::int AS admins,
          (SELECT count(*) FROM vendor_live_sessions WHERE expires_at > now() AND ends_at > now())::int AS live,
          (SELECT count(*) FROM reports WHERE status = 'open')::int AS reports,
          (SELECT count(*) FROM photos WHERE moderation = 'pending')::int AS photos,
          (SELECT count(*) FROM reviews WHERE moderation = 'pending')::int AS reviews`);
      const invites = await inviteStats(ctx);
      print(`Accounts: ${s!.customers} customers, ${s!.vendors} vendors, ${s!.admins} admins`);
      print(`Live right now: ${s!.live}`);
      print(`Waiting for moderators: ${s!.photos} photos, ${s!.reviews} reviews, ${s!.reports} open reports`);
      print(`Invite codes: ${invites.codes} made, used ${invites.redemptions} times`);
      return 0;
    }

    default:
      print(HELP);
      return command && command !== 'help' ? 1 : 0;
  }
}

if (isMain(import.meta.url)) {
  const config = loadConfig();
  const { db, close } = createDb(config.databaseUrl);
  const ctx: AppContext = { config, db, tokens: createTokenService(config), storage: createStorage(config.uploadDir) };
  const code = await runAdmin(ctx, process.argv.slice(2));
  await close();
  process.exit(code);
}
