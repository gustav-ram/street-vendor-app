import { and, desc, eq, sql } from 'drizzle-orm';
import type { Favorite } from '@streeteats/shared';
import type { AppContext } from '../../app';
import { favorites } from '../../db/schema';
import { ApiError } from '../../lib/errors';
import { bumpCounter } from '../analytics/counters';
import { getPublicProfile } from '../vendors/service';
import { publicVendor } from './guards';

const MAX_FAVORITES = 100;

/** Adds or updates a favorite. "Notify when open" is only a flag here (see pendingOpenNotifications). */
export async function setFavorite(ctx: AppContext, userId: string, vendorId: string, notifyOnOpen: boolean) {
  await publicVendor(ctx, vendorId);
  const mine = and(eq(favorites.userId, userId), eq(favorites.vendorId, vendorId));
  const isNew = (await ctx.db.$count(favorites, mine)) === 0;
  if (isNew && (await ctx.db.$count(favorites, eq(favorites.userId, userId))) >= MAX_FAVORITES) throw new ApiError('rate_limited');
  const [row] = await ctx.db
    .insert(favorites)
    .values({ userId, vendorId, notifyOnOpen })
    .onConflictDoUpdate({ target: [favorites.userId, favorites.vendorId], set: { notifyOnOpen } })
    // xmax = 0 only for a freshly inserted row.
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  if (row?.inserted) await bumpCounter(ctx.db, [vendorId], 'favoritesAdded');
}

export async function removeFavorite(ctx: AppContext, userId: string, vendorId: string) {
  const deleted = await ctx.db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.vendorId, vendorId)))
    .returning({ vendorId: favorites.vendorId });
  if (deleted.length > 0) await bumpCounter(ctx.db, [vendorId], 'favoritesRemoved');
}

/** Saved vendors with whether they're live now and where they'll be next. */
export async function listFavorites(ctx: AppContext, userId: string): Promise<Favorite[]> {
  const rows = await ctx.db
    .select({ vendorId: favorites.vendorId, notifyOnOpen: favorites.notifyOnOpen })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt))
    .limit(MAX_FAVORITES);
  const profiles = await Promise.all(
    rows.map((r) =>
      getPublicProfile(ctx, r.vendorId)
        .then((p) => ({ p, notifyOnOpen: r.notifyOnOpen }))
        // Vacation mode: hidden from favorites too, until they're back.
        .catch(() => null),
    ),
  );
  return profiles.flatMap((x) => {
    if (!x) return [];
    const { p } = x;
    return [
      {
        vendor: {
          id: p.id,
          displayName: p.displayName,
          categories: p.categories,
          priceLevel: p.priceLevel,
          paymentMethods: p.paymentMethods,
          languages: p.languages,
          rating: p.rating,
          verified: p.verified,
          status: p.status,
        },
        notifyOnOpen: x.notifyOnOpen,
        live: p.live,
        upcoming: p.upcoming.slice(0, 3),
      },
    ];
  });
}
