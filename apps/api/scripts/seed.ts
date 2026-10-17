import { sql } from 'drizzle-orm';
import { normalizeText } from '@streeteats/shared';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db/client';
import {
  inviteCodes,
  menuItems,
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
import { pointSql } from '../src/lib/geo/sql';
import { isMain } from '../src/lib/is-main';
import { hashSecret } from '../src/lib/passwords';
import { priceLevelFromMenu } from '../src/lib/price';
import { localDay, localTimeOnDay } from '../src/lib/time';
import { DEMO_ACCOUNTS, DEMO_INVITE, DEMO_PASSWORD, DEMO_REVIEWERS } from './seed-data/accounts';
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
  const fuzz = { secret: config.fuzzSecret, cellMeters: config.approxCellMeters };
  const rand = mulberry32(2026);
  const now = new Date();

  await clearDemoData(db);
  const tagIds = await seedTags(db);
  const passwordHash = await hashSecret(DEMO_PASSWORD);

  const insertUser = async (v: { email: string; role: 'customer' | 'vendor' | 'admin'; displayName?: string; locale?: string }) => {
    const [u] = await db
      .insert(users)
      .values({ email: v.email, role: v.role, displayName: v.displayName ?? null, locale: v.locale ?? 'en', passwordHash, isDemo: true })
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
  }

  await db.insert(inviteCodes).values({ code: DEMO_INVITE.code, label: DEMO_INVITE.label, isDemo: true });

  return { vendors: VENDORS.length, tags: TAGS.length, upcomingPosts: upcomingCount, reviews: reviewCount };
}

if (isMain(import.meta.url)) {
  const { db, close } = createDb(loadConfig().databaseUrl);
  try {
    const r = await seed(db);
    console.log(
      `Seeded ${r.vendors} demo vendors, ${r.tags} tags, ${r.reviews} reviews and ${r.upcomingPosts} "tomorrow" posts.\n` +
        'Demo logins are listed in README.md. Remove all demo data with: npm run seed:clear',
    );
  } finally {
    await close();
  }
}
