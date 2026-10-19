import { sql } from 'drizzle-orm';
import { normalizeText } from '@streeteats/shared';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db/client';
import {
  analyticsDaily,
  inviteCodes,
  menuItems,
  photos,
  reviews,
  scheduleEntries,
  tags,
  tagSynonyms,
  upcomingSpotPosts,
  users,
  vendorProfiles,
  vendorStatusPosts,
  vendorTags,
  verificationProgress,
} from '../src/db/schema';
import { publicLocation } from '../src/lib/geo/fuzz';
import { processImage } from '../src/lib/images';
import { createStorage, type Storage } from '../src/lib/storage';
import { pointSql } from '../src/lib/geo/sql';
import { isMain } from '../src/lib/is-main';
import { hashSecret } from '../src/lib/passwords';
import { priceLevelFromMenu } from '../src/lib/price';
import { localDay, localTimeOnDay } from '../src/lib/time';
import { DEMO_ACCOUNTS, DEMO_INVITE, DEMO_PASSWORD, DEMO_REVIEWERS } from './seed-data/accounts';
import { placeholderCard, placeholderInitials } from './seed-data/photos';
import { REVIEW_TEXT } from './seed-data/reviews';
import { TAGS } from './seed-data/tags';
import { VENDORS } from './seed-data/vendors';
import { clearDemoData } from './seed-clear';

const TZ = 'America/Los_Angeles';

/** Deterministic PRNG so every seed run produces the same demo data. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cuts at a word boundary, with an ellipsis. */
const shorten = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '').replace(/[,;:]$/, '')}…`;

/** Runs a placeholder through the same pipeline as real uploads. */
async function storeSeedPhoto(storage: Storage, png: Buffer, maxPixels: number) {
  const image = await processImage(png, maxPixels);
  const storageKey = storage.newKey();
  const thumbKey = storage.newKey();
  await storage.savePhoto(storageKey, image.full);
  await storage.savePhoto(thumbKey, image.thumb);
  return { storageKey, thumbKey, width: image.width, height: image.height };
}

export async function seedTags(db: Db) {
  for (const t of TAGS) {
    const [row] = await db
      .insert(tags)
      .values({ slug: t.slug, nameEn: t.en, nameEs: t.es, category: t.category ?? null })
      .onConflictDoUpdate({ target: tags.slug, set: { nameEn: t.en, nameEs: t.es, category: t.category ?? null } })
      .returning({ id: tags.id });
    // Synonyms always include the tag's own names.
    const phrases = new Set([t.en, t.es, ...t.synonyms].map(normalizeText).filter(Boolean));
    await db.delete(tagSynonyms).where(sql`${tagSynonyms.tagId} = ${row!.id}`);
    await db.insert(tagSynonyms).values([...phrases].map((phrase) => ({ tagId: row!.id, phrase })));
  }
  const all = await db.select({ id: tags.id, slug: tags.slug }).from(tags);
  return new Map(all.map((t) => [t.slug, t.id]));
}

export async function seed(db: Db) {
  const config = loadConfig();
  const storage = createStorage(config.uploadDir);
  const fuzz = { secret: config.fuzzSecret, cellMeters: config.approxCellMeters };
  const rand = mulberry32(2026);
  const now = new Date();

  await clearDemoData(db, storage);
  const tagIds = await seedTags(db);
  const passwordHash = await hashSecret(DEMO_PASSWORD);

  const insertUser = async (v: { email: string; role: 'customer' | 'vendor' | 'admin'; displayName?: string; locale?: string }) => {
    const [u] = await db
      .insert(users)
      .values({
        email: v.email,
        role: v.role,
        displayName: v.displayName ?? null,
        locale: v.locale ?? 'en',
        passwordHash,
        isDemo: true,
        // A month old, so the demo customer can try "Still here?" (new accounts wait a day).
        createdAt: new Date(now.getTime() - 30 * 86_400_000),
      })
      .returning({ id: users.id });
    return u!.id;
  };

  await insertUser({ ...DEMO_ACCOUNTS.admin, role: 'admin' });
  await insertUser({ ...DEMO_ACCOUNTS.customer, role: 'customer' });
  await insertUser({ email: DEMO_ACCOUNTS.newVendor.email, role: 'vendor', locale: 'es' });
  const reviewers: string[] = [];
  for (const [i, name] of DEMO_REVIEWERS.entries()) {
    reviewers.push(await insertUser({ email: `reviewer${i + 1}@demo.test`, role: 'customer', displayName: name }));
  }

  let upcomingCount = 0;
  let reviewCount = 0;
  let photoCount = 0;
  const addPhoto = async (
    vendorId: string,
    png: Buffer,
    values: { uploaderUserId: string; source: 'vendor' | 'customer'; kind: 'profile' | 'cover' | 'gallery' | 'customer'; caption?: string; moderation?: 'approved' | 'pending' },
  ) => {
    const stored = await storeSeedPhoto(storage, png, config.photoMaxPixels);
    const [row] = await db
      .insert(photos)
      .values({ vendorId, moderation: 'approved', caption: null, ...values, ...stored })
      .returning({ id: photos.id });
    photoCount++;
    return row!.id;
  };
  let dangerDogsId: string | null = null;
  for (const v of VENDORS) {
    const email = v.key === DEMO_ACCOUNTS.vendor.vendorKey ? DEMO_ACCOUNTS.vendor.email : `vendor-${v.key}@demo.test`;
    const userId = await insertUser({ email, role: 'vendor', locale: v.languages[0] === 'en' ? 'en' : 'es' });
    const precision = v.precision ?? 'approximate';
    const [profile] = await db
      .insert(vendorProfiles)
      .values({
        userId,
        displayName: v.name,
        description: v.description,
        categories: v.categories,
        languages: v.languages,
        paymentMethods: v.payments,
        priceLevel: priceLevelFromMenu(v.menu.map(([, cents]) => cents)),
        defaultPrecision: precision,
        timezone: TZ,
        quickStartAt: now,
        completedAt: now,
        lastLiveAt: new Date(Math.floor((now.getTime() - rand() * 3 * 86_400_000) / 3_600_000) * 3_600_000),
      })
      .returning({ id: vendorProfiles.id });
    const vendorId = profile!.id;
    if (v.key === DEMO_ACCOUNTS.vendor.vendorKey) dangerDogsId = vendorId;

    // Sample photos: initials for the profile, a cover, and a card for the first menu item.
    const category = v.categories[0]!;
    const asVendor = { uploaderUserId: userId, source: 'vendor' as const };
    const profilePhotoId = await addPhoto(vendorId, await placeholderInitials(category, v.name), { ...asVendor, kind: 'profile' });
    const coverPhotoId = await addPhoto(vendorId, await placeholderCard(category, v.name, shorten(v.description.split('.')[0]!, 44)), {
      ...asVendor,
      kind: 'cover',
    });
    const [firstItem, firstPrice] = v.menu[0]!;
    await addPhoto(vendorId, await placeholderCard(category, firstItem, `$${(firstPrice / 100).toFixed(2)} · ${v.name}`), {
      ...asVendor,
      kind: 'gallery',
      caption: firstItem,
    });
    await db.update(vendorProfiles).set({ profilePhotoId, coverPhotoId }).where(sql`${vendorProfiles.id} = ${vendorId}`);

    await db.insert(menuItems).values(
      v.menu.map(([name, priceCents, description], i) => ({
        vendorId,
        name,
        priceCents,
        description: description ?? '',
        sortOrder: i,
        soldOut: i === v.menu.length - 1 && rand() < 0.2,
      })),
    );
    await db.insert(vendorTags).values(
      v.tags.map((slug) => {
        const tagId = tagIds.get(slug);
        if (!tagId) throw new Error(`Unknown tag "${slug}" on ${v.key}`);
        return { vendorId, tagId };
      }),
    );

    if (v.status) {
      await db.insert(vendorStatusPosts).values({ vendorId, body: v.status, expiresAt: localTimeOnDay(now, 1, '03:00', TZ) });
    }

    if (v.tomorrow) {
      const loc = publicLocation(v.spot, precision, vendorId, fuzz);
      const startsAt = localTimeOnDay(now, 1, v.tomorrow.start, TZ);
      let endsAt = localTimeOnDay(now, 1, v.tomorrow.end, TZ);
      if (endsAt <= startsAt) endsAt = localTimeOnDay(now, 2, v.tomorrow.end, TZ);
      await db.insert(upcomingSpotPosts).values({
        vendorId,
        publicPoint: pointSql(loc),
        precision,
        cellKey: loc.cellKey,
        placeLabel: v.tomorrow.label,
        note: v.tomorrow.note ?? null,
        startsAt,
        endsAt,
      });
      upcomingCount++;
    }

    for (const s of v.schedule ?? []) {
      const loc = publicLocation(v.spot, precision, vendorId, fuzz);
      await db.insert(scheduleEntries).values({
        vendorId,
        weekday: s.weekday,
        startTime: s.start,
        endTime: s.end,
        publicPoint: pointSql(loc),
        precision,
        cellKey: loc.cellKey,
        placeLabel: s.label,
        published: true,
      });
    }

    // Reviews from distinct demo customers, ratings near the vendor's average.
    const count = Math.min(v.reviewCount ?? 0, reviewers.length);
    const pool = [...(REVIEW_TEXT[v.categories[0]!] ?? []), ...REVIEW_TEXT.any];
    for (let i = 0; i < count; i++) {
      const target = v.rating ?? 4.5;
      const rating = Math.max(1, Math.min(5, Math.round(target + (rand() - 0.5) * 1.6)));
      const createdAt = new Date(now.getTime() - Math.floor(rand() * 90) * 86_400_000);
      await db.insert(reviews).values({
        vendorId,
        userId: reviewers[i]!,
        rating,
        body: pool[Math.floor(rand() * pool.length)]!,
        createdAt,
        updatedAt: createdAt,
        ...(i === 0 && v.verified
          ? { vendorReply: v.languages[0] === 'en' ? 'Thank you! See you soon.' : '¡Gracias! Lo esperamos pronto.', vendorReplyAt: createdAt }
          : {}),
      });
      reviewCount++;
    }

    await db.insert(verificationProgress).values({
      vendorId,
      liveDays: v.liveDays,
      lastLiveDay: localDay(new Date(now.getTime() - 86_400_000), TZ),
      confirmationsMetAt: v.verified ? now : null,
      status: v.verified ? 'verified' : 'none',
      verifiedAt: v.verified ? now : null,
    });

    // 30 days of made-up daily totals so the Stats charts have something to show.
    // Busier on Fridays and Saturdays, and for vendors with more reviews.
    const busy = 1 + (v.reviewCount ?? 0) / 3;
    const days = [];
    for (let back = 30; back >= 1; back--) {
      const day = localDay(new Date(now.getTime() - back * 86_400_000), TZ);
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      const views = Math.round(busy * (weekday === 5 || weekday === 6 ? 7 : 3) * (0.4 + rand()));
      days.push({
        vendorId,
        day,
        profileViews: views,
        mapImpressions: views * 4 + Math.round(rand() * 10),
        directionsTaps: Math.round(views * 0.3 * rand()),
        favoritesAdded: rand() < 0.15 ? 1 : 0,
        favoritesRemoved: rand() < 0.03 ? 1 : 0,
        confirmations: rand() < 0.12 * busy ? 1 : 0,
      });
    }
    await db.insert(analyticsDaily).values(days);
  }

  // Customer photos on Danger Dogs: one approved, one waiting in the moderation queue for admin@demo.test.
  if (dangerDogsId) {
    const [customer] = await db.select({ id: users.id }).from(users).where(sql`${users.email} = ${DEMO_ACCOUNTS.customer.email}`);
    await addPhoto(dangerDogsId, await placeholderCard('hot_dogs', 'Danger Dog + onions', 'From a customer'), {
      uploaderUserId: customer!.id,
      source: 'customer',
      kind: 'customer',
      caption: 'After the Dodgers game',
    });
    await addPhoto(dangerDogsId, await placeholderCard('hot_dogs', 'Chiles toreados', 'Waiting for a moderator'), {
      uploaderUserId: customer!.id,
      source: 'customer',
      kind: 'customer',
      caption: 'Los chiles toreados',
      moderation: 'pending',
    });
  }

  await db.insert(inviteCodes).values({ code: DEMO_INVITE.code, label: DEMO_INVITE.label, isDemo: true });

  return { vendors: VENDORS.length, tags: TAGS.length, upcomingPosts: upcomingCount, reviews: reviewCount, photos: photoCount };
}

if (isMain(import.meta.url)) {
  const { db, close } = createDb(loadConfig().databaseUrl);
  try {
    if (process.argv.includes('--tags-only')) {
      // Refresh tags and synonyms without touching demo data.
      const ids = await seedTags(db);
      console.log(`Updated ${ids.size} tags and their synonyms.`);
      process.exit(0);
    }
    const r = await seed(db);
    console.log(
      `Seeded ${r.vendors} demo vendors, ${r.tags} tags, ${r.reviews} reviews, ${r.photos} sample photos and ${r.upcomingPosts} "tomorrow" posts.\n` +
        'Demo logins are listed in README.md. Remove all demo data with: npm run seed:clear',
    );
  } finally {
    await close();
  }
}
