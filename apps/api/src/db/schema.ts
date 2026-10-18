import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  MODERATION_STATUSES,
  PRECISIONS,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  ROLES,
  VERIFICATION_STATUSES,
} from '@streeteats/shared';

// Conventions (see PLAN.md §5): random UUIDv4 keys everywhere, timestamptz,
// and ON DELETE CASCADE from users so deleting an account removes everything.

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
// Points are written and read with explicit PostGIS SQL (see lib/geo), never
// through the ORM's value mapping, so the column type is all we declare here.
const geographyPoint = customType<{ data: string }>({ dataType: () => 'geography(Point, 4326)' });

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

export const userRole = pgEnum('user_role', ROLES);
export const credentialKind = pgEnum('credential_kind', ['password', 'pin']);
export const locationPrecision = pgEnum('location_precision', PRECISIONS);
export const moderationStatus = pgEnum('moderation_status', MODERATION_STATUSES);
export const photoSource = pgEnum('photo_source', ['vendor', 'customer']);
export const photoKind = pgEnum('photo_kind', ['profile', 'cover', 'gallery', 'customer']);
export const reportTarget = pgEnum('report_target', REPORT_TARGETS);
export const reportReason = pgEnum('report_reason', REPORT_REASONS);
export const reportStatus = pgEnum('report_status', REPORT_STATUSES);
export const verificationStatus = pgEnum('verification_status', VERIFICATION_STATUSES);

// ---------------------------------------------------------------- accounts

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: userRole('role').notNull(),
    // Login identifiers only. Never returned by public endpoints.
    email: citext('email').unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash').notNull(),
    credentialKind: credentialKind('credential_kind').notNull().default('password'),
    displayName: text('display_name'),
    locale: text('locale').notNull().default('en'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: ts('locked_until'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('users_identifier_present', sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // All refresh tokens descending from one login share a family; reusing a
    // rotated token revokes the whole family.
    familyId: uuid('family_id').notNull(),
    refreshHash: text('refresh_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId), index('auth_sessions_family_idx').on(t.familyId)],
);

// ---------------------------------------------------------------- vendors

export const vendorProfiles = pgTable(
  'vendor_profiles',
  {
    // The public vendor id. Deliberately different from users.id.
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    description: text('description').notNull().default(''),
    categories: text('categories').array().notNull().default(sql`'{}'::text[]`),
    languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
    paymentMethods: text('payment_methods').array().notNull().default(sql`'{}'::text[]`),
    // 1-3, derived from the menu's median price.
    priceLevel: smallint('price_level'),
    defaultPrecision: locationPrecision('default_precision').notNull().default('approximate'),
    // Optional public contact line, hidden unless the vendor turns it on.
    contactText: text('contact_text'),
    contactVisible: boolean('contact_visible').notNull().default(false),
    timezone: text('timezone').notNull().default('America/Los_Angeles'),
    // Vacation mode: invisible everywhere and cannot go live.
    hidden: boolean('hidden').notNull().default(false),
    profilePhotoId: uuid('profile_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
    coverPhotoId: uuid('cover_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
    quickStartAt: ts('quick_start_at'),
    completedAt: ts('completed_at'),
    // Rounded to the hour; a timestamp only, never a place.
    lastLiveAt: ts('last_live_at'),
    // Maintained by triggers (migration 0003) from name, tags, menu and description.
    searchDoc: tsvector('search_doc'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('vendor_profiles_categories_gin').using('gin', t.categories),
    index('vendor_profiles_languages_gin').using('gin', t.languages),
    index('vendor_profiles_payment_gin').using('gin', t.paymentMethods),
    index('vendor_profiles_search_gin').using('gin', t.searchDoc),
    index('vendor_profiles_name_trgm').using('gin', t.displayName.op('gin_trgm_ops')),
    check('vendor_profiles_price_level', sql`${t.priceLevel} IS NULL OR ${t.priceLevel} BETWEEN 1 AND 3`),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    // Client-generated on mobile so offline creates are idempotent.
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceCents: integer('price_cents').notNull(),
    soldOut: boolean('sold_out').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    // Last-write-wins clock for offline edits (the time the vendor made the change).
    clientUpdatedAt: ts('client_updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('menu_items_vendor_idx').on(t.vendorId),
    check('menu_items_price_nonneg', sql`${t.priceCents} >= 0`),
  ],
);

// Tombstones for client-id entities (menu items, status and upcoming posts),
// so a stale queued offline edit can't bring a deleted row back. Holds no
// content or location; purged after 30 days.
export const deletedEntities = pgTable('deleted_entities', {
  id: uuid('id').primaryKey(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  deletedAt: ts('deleted_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------- tags & synonyms

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  category: text('category'),
});

export const tagSynonyms = pgTable(
  'tag_synonyms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    // Stored normalized (see normalizeText): lowercase, no accents or punctuation.
    phrase: text('phrase').notNull(),
    lang: text('lang').notNull().default('any'),
  },
  (t) => [
    unique('tag_synonyms_tag_phrase').on(t.tagId, t.phrase),
    index('tag_synonyms_phrase_idx').on(t.phrase),
    // Typo-tolerant lookups ("tamals" -> "tamales").
    index('tag_synonyms_phrase_trgm').using('gin', t.phrase.op('gin_trgm_ops')),
  ],
);

export const vendorTags = pgTable(
  'vendor_tags',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.vendorId, t.tagId] }), index('vendor_tags_tag_idx').on(t.tagId)],
);

// ---------------------------------------------------------------- location (ephemeral)

// At most one row per vendor and no history. The row is deleted when the
// vendor goes offline, when heartbeats stop, or when ends_at passes.
// In approximate mode only the fuzzed point is ever written here.
export const vendorLiveSessions = pgTable(
  'vendor_live_sessions',
  {
    vendorId: uuid('vendor_id')
      .primaryKey()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    publicPoint: geographyPoint('public_point').notNull(),
    precision: locationPrecision('precision').notNull(),
    // Grid cell of the published point (approximate mode), for hysteresis.
    cellKey: text('cell_key'),
    startedAt: ts('started_at').notNull().defaultNow(),
    lastHeartbeatAt: ts('last_heartbeat_at').notNull().defaultNow(),
    // last_heartbeat_at + grace. Public queries require expires_at > now().
    expiresAt: ts('expires_at').notNull(),
    // Auto-off timer / end of street day / max session length.
    endsAt: ts('ends_at').notNull(),
    lastConfirmedAt: ts('last_confirmed_at'),
  },
  (t) => [index('live_sessions_point_gist').using('gist', t.publicPoint), index('live_sessions_expires_idx').on(t.expiresAt)],
);

export const upcomingSpotPosts = pgTable(
  'upcoming_spot_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    publicPoint: geographyPoint('public_point').notNull(),
    precision: locationPrecision('precision').notNull(),
    cellKey: text('cell_key'),
    placeLabel: text('place_label'),
    note: text('note'),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    clientUpdatedAt: ts('client_updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('upcoming_point_gist').using('gist', t.publicPoint),
    index('upcoming_ends_idx').on(t.endsAt),
    index('upcoming_vendor_idx').on(t.vendorId),
    check('upcoming_window_valid', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const scheduleEntries = pgTable(
  'schedule_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    // 0 = Sunday ... 6 = Saturday, in the vendor's timezone.
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    publicPoint: geographyPoint('public_point'),
    precision: locationPrecision('precision').notNull().default('approximate'),
    cellKey: text('cell_key'),
    placeLabel: text('place_label'),
    published: boolean('published').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('schedule_vendor_idx').on(t.vendorId),
    index('schedule_point_gist').using('gist', t.publicPoint),
    check('schedule_weekday_valid', sql`${t.weekday} BETWEEN 0 AND 6`),
  ],
);

export const vendorStatusPosts = pgTable(
  'vendor_status_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    expiresAt: ts('expires_at').notNull(),
    clientUpdatedAt: ts('client_updated_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('status_posts_vendor_idx').on(t.vendorId, t.expiresAt)],
);

// ---------------------------------------------------------------- photos

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  totalBytes: integer('total_bytes').notNull(),
  receivedBytes: integer('received_bytes').notNull().default(0),
  tmpKey: text('tmp_key').notNull(),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
});

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references((): AnyPgColumn => vendorProfiles.id, { onDelete: 'cascade' }),
    uploaderUserId: uuid('uploader_user_id').references(() => users.id, { onDelete: 'cascade' }),
    source: photoSource('source').notNull(),
    kind: photoKind('kind').notNull(),
    // Random keys; original filenames are never stored.
    storageKey: text('storage_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    caption: text('caption'),
    moderation: moderationStatus('moderation').notNull().default('pending'),
    hiddenByVendor: boolean('hidden_by_vendor').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('photos_vendor_idx').on(t.vendorId, t.moderation), index('photos_moderation_idx').on(t.moderation)],
);

// ---------------------------------------------------------------- community

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    body: text('body').notNull().default(''),
    moderation: moderationStatus('moderation').notNull().default('approved'),
    vendorReply: text('vendor_reply'),
    vendorReplyAt: ts('vendor_reply_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('reviews_one_per_user').on(t.vendorId, t.userId),
    index('reviews_moderation_idx').on(t.moderation),
    check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    // "Notify me when they open." The device decides whether it's "near me";
    // the server never stores the customer's location.
    notifyOnOpen: boolean('notify_on_open').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.vendorId] }), index('favorites_vendor_idx').on(t.vendorId)],
);

// Stub: tokens for a future push sender. Nothing reads them yet.
export const pushDevices = pgTable('push_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expoToken: text('expo_token').notNull().unique(),
  platform: text('platform').notNull(),
  createdAt: createdAt(),
});

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Kept (de-linked) if the reporter deletes their account.
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: reportTarget('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    // The vendor when the report is about the vendor or their own posts and
    // photos (not a customer's review or photo). Upholding a report deletes
    // the content, so this is how the badge still sees it afterwards.
    vendorId: uuid('vendor_id').references((): AnyPgColumn => vendorProfiles.id, { onDelete: 'cascade' }),
    reason: reportReason('reason').notNull(),
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),
    adminNote: text('admin_note'),
    createdAt: createdAt(),
    resolvedAt: ts('resolved_at'),
  },
  (t) => [
    index('reports_status_idx').on(t.status),
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_vendor_idx').on(t.vendorId, t.status),
  ],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerUserId, t.blockedUserId] })],
);

// ---------------------------------------------------------------- trust signals

// "Still here?" taps. No coordinates and no user id: confirmer_hash is
// HMAC(pepper for `epoch`, user_id || vendor_id). Rows and peppers are
// deleted after 30 days, after which old hashes can't be linked to anyone.
export const stillHereConfirmations = pgTable(
  'still_here_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    confirmerHash: text('confirmer_hash').notNull(),
    epoch: integer('epoch').notNull(),
    localDay: date('local_day').notNull(),
    // Whether it counted toward the badge (at most once per confirmer per 7 days).
    counted: boolean('counted').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('still_here_vendor_idx').on(t.vendorId, t.createdAt),
    index('still_here_confirmer_idx').on(t.confirmerHash, t.createdAt),
  ],
);

export const hashPeppers = pgTable('hash_peppers', {
  epoch: integer('epoch').primaryKey(),
  secret: text('secret').notNull(),
  createdAt: createdAt(),
});

// Counters only: never a list of the days a vendor worked.
export const verificationProgress = pgTable('verification_progress', {
  vendorId: uuid('vendor_id')
    .primaryKey()
    .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
  liveDays: integer('live_days').notNull().default(0),
  lastLiveDay: date('last_live_day'),
  confirmationsMetAt: ts('confirmations_met_at'),
  status: verificationStatus('status').notNull().default('none'),
  verifiedAt: ts('verified_at'),
  revokedAt: ts('revoked_at'),
  revokedReason: text('revoked_reason'),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- launch tools & analytics

// Aggregate only: redeeming increments redemption_count and nothing links a
// code to the account that used it.
export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  maxRedemptions: integer('max_redemptions'),
  redemptionCount: integer('redemption_count').notNull().default(0),
  expiresAt: ts('expires_at'),
  disabled: boolean('disabled').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

export const analyticsDaily = pgTable(
  'analytics_daily',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    profileViews: integer('profile_views').notNull().default(0),
    mapImpressions: integer('map_impressions').notNull().default(0),
    directionsTaps: integer('directions_taps').notNull().default(0),
    favoritesAdded: integer('favorites_added').notNull().default(0),
    favoritesRemoved: integer('favorites_removed').notNull().default(0),
    confirmations: integer('confirmations').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.vendorId, t.day] })],
);
