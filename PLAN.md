# StreetEats Finder — Build Plan

Draft for review · 2026-10-17 · Source brief: [docs/BRIEF.md](docs/BRIEF.md)

## 1. Key decisions

| Area | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) | npm 11 is already installed; Expo and Next both support npm workspaces out of the box. No Turborepo yet. |
| API | Fastify 5 + Zod 4 (`fastify-type-provider-zod`) | Typed routes, schema validation, mature plugins (`@fastify/rate-limit`, `@fastify/cors`, `@fastify/static`). |
| ORM | **Drizzle** with committed SQL migrations | Drizzle has native PostGIS geometry columns and GIST indexes. Prisma only supports PostGIS as `Unsupported`, so every geo query would be raw SQL. |
| DB | Postgres 17 + PostGIS 3.5 (`postgis/postgis` image), plus `pg_trgm`, `unaccent`, `citext` | Nearest-vendor queries, typo-tolerant search, case-insensitive email. |
| Auth | argon2id (`@node-rs/argon2`, prebuilt, no node-gyp) · 15-min JWT access tokens (`jose`) · opaque rotating refresh tokens stored hashed, with reuse detection | Standard, and no native build step. |
| Mobile | Expo SDK 58 + expo-router, react-native-maps (Apple Maps), expo-location, expo-image-picker, expo-image-manipulator, expo-sqlite, expo-secure-store, expo-localization | Runs in the **Expo Go** app in the iOS Simulator (`npx expo start --ios`). Every module we use ships in Expo Go, so we don't need CocoaPods or a native build. A dev build (`npx expo run:ios`) stays possible later but needs CocoaPods. |
| Web | Next.js 16 (App Router) + Tailwind 4 + react-leaflet with OSM tiles | As specified. |
| i18n | i18next + react-i18next in both apps; one set of JSON files in `packages/shared` | Both apps share the same strings and interpolation format. |
| Images | `sharp`: auto-rotate, re-encode to WebP, all metadata dropped | Strips EXIF/GPS for free. Sits behind a `StorageDriver` interface (local disk now, S3 later). |
| Tests | Vitest. API integration tests run against a separate `streeteats_test` database in the same container. | Fast, and the TypeScript setup is shared. |

Changes from the brief, with reasons:
- **Expo Go instead of `expo run:ios`** as the default Simulator path, because this Mac has no CocoaPods. For this feature set the two are equivalent.
- **Search uses `POST` with the location in the body.** Customer coordinates never appear in URLs, proxy logs or browser history.
- **Fuzzing is deterministic per vendor and grid cell, not per session** (see §6.1). Random offsets per session can be averaged across days to recover a vendor's regular corner. Snapping gives the same output every time, so averaging recovers nothing.

## 2. This machine

Already installed: Node 24.2, npm 11.3, Xcode 27 with a booted iPhone 17 (iOS 27) simulator, Homebrew 7.

Missing: **any Docker runtime** (blocks M1, see Q1), CocoaPods (not needed with Expo Go), watchman (optional).

## 3. Architecture

```
 iOS app (Expo Go)                    Web (Next.js :3000)
 customer + vendor                    customer + vendor dashboard + admin
 offline cache + outbox (SQLite)      online-only
            \                          /
             \      JSON over HTTP    /
              ---- API (Fastify :4000, /v1) ----
              auth · search · live/heartbeat · uploads · moderation
              in-process sweeper: expire live sessions, delete past posts,
              purge uploads/tombstones/old confirmation hashes
                  |                              |
      Postgres + PostGIS (:5432, Docker)   ./data/uploads (StorageDriver)
```

| Feature area | Mobile | Web |
|---|---|---|
| Customer: map/list, search, filters, profile, directions, favorites, reviews, photos, "Still here?", reports | ✅ | ✅ |
| Vendor: quick start, Go Live, status posts, menu, sold out, tomorrow posts, schedule, photos, reviews, stats, badge progress, account | ✅ | ✅ online-only; Go Live uses browser geolocation, which is the QR-flyer fallback path |
| Vendor offline mode (cache + outbox + sync issues) | ✅ | — |
| Admin: moderation queue, reports, badge revoke, invite codes and printable flyers | — | ✅ |
| "Your privacy" screen, EN/ES switcher | ✅ | ✅ |

## 4. Folder structure

```
apps/
  api/
    src/
      app.ts  server.ts  config.ts         # config = zod-validated env
      db/schema/*.ts  db/client.ts  db/migrations/*.sql
      modules/<feature>/{routes,service}.ts
        auth search vendors live menu status-posts upcoming schedule uploads
        photos reviews favorites reports blocks still-here verification
        invites analytics account admin
      lib/geo/fuzz.ts  lib/storage/{driver,local-disk}.ts  lib/images.ts
      lib/hashing.ts  lib/logging.ts       # logging.ts: no query strings, bodies, or IPs
      jobs/sweeper.ts
    scripts/seed.ts  seed-clear.ts  demo-live.ts  admin.ts (CLI)
    test/
  web/
    app/(customer)/…  app/vendor/…  app/admin/…  app/join/…  app/privacy/…
    components/  lib/{api,i18n,auth}.ts
  mobile/
    app/(customer)/(tabs)/{map,upcoming,favorites,account}.tsx
    app/vendor/[id].tsx                    # public vendor profile
    app/(vendor)/{dashboard,quick-start,menu,posts,photos,reviews,stats,badge,settings}.tsx
    src/api/  src/offline/{cache,outbox,sync}.ts  src/i18n/  src/components/
packages/
  shared/
    src/schemas/      # zod request/response schemas used by API + both apps
    src/constants/    # categories, payment methods, languages, limits
    src/i18n/{en,es}/{common,search,vendor,golive,onboarding,menu,privacy,admin}.json
    src/search/normalize.ts  src/geo/round.ts  src/outbox/core.ts (pure, unit-tested)
docker-compose.yml  .env.example  PLAN.md  PRIVACY_DESIGN.md  README.md
```

## 5. Data model

Conventions: every primary key is a random UUIDv4 (`gen_random_uuid()`), so nothing is sequential or encodes creation time. Timestamps are `timestamptz`. Child rows `ON DELETE CASCADE` from `users`, which makes account deletion one statement plus file cleanup. `users.is_demo` marks seed data, so `seed:clear` can delete it.

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, role (customer·vendor·admin), email citext?, phone?, password_hash, credential_kind (password·pin), display_name, locale, failed_logins, locked_until, is_demo | Email or phone required (check constraint). Never returned by public endpoints. |
| `auth_sessions` | id, user_id, family_id, refresh_hash, expires_at, revoked_at | Not in the brief; needed for refresh rotation. |
| `vendor_profiles` | id (**public vendor id, not the user id**), user_id, display_name, description, categories[], languages[], payment_methods[], price_level 1–3, default_precision (approximate·exact), contact_text, contact_visible (default false), timezone, hidden (vacation), quick_start_at, completed_at, last_live_at (rounded to the hour), search_doc tsvector | GIN indexes on the arrays and search_doc; trigram index on display_name. price_level is derived from the menu's median price. |
| `menu_items` | id (client-generated), vendor_id, name, description, price_cents, sold_out, sort_order, client_updated_at, deleted_at | Client ids make offline creates idempotent. The tombstone stops a stale offline edit from bringing back a deleted item; tombstones are purged after 30 days. |
| `tags`, `tag_synonyms`, `vendor_tags` | tag: slug, name_en, name_es, category · synonym: tag_id, phrase (normalized), lang | Powers "LA style hot dog" → bacon-wrapped / Danger Dog / Sonoran. |
| `vendor_live_sessions` | **vendor_id (PK, at most one row per vendor)**, public_point geography(Point) + GIST, precision, cell_key, started_at, last_heartbeat_at, expires_at, ends_at, last_confirmed_at | No history: the row is deleted on offline, expiry or heartbeat loss. In approximate mode the exact coordinates are never written to the database. |
| `upcoming_spot_posts` | id (client), vendor_id, public_point + GIST, precision, place_label, note, starts_at, ends_at, client_updated_at | Queries filter `ends_at > now()`. The sweeper deletes rows 1 h after the window ends. |
| `schedule_entries` | id, vendor_id, weekday, start_time, end_time, public_point?, precision, place_label, published | "Fridays near X." Only shown when published. |
| `vendor_status_posts` | id (client), vendor_id, body ≤140, expires_at, client_updated_at | Latest active post appears as the pin banner. |
| `uploads` | id, user_id, content_type, total_bytes, received_bytes, tmp_key, expires_at | Staging for resumable uploads. Purged after 24 h. |
| `photos` | id, vendor_id, uploader_user_id, source (vendor·customer), kind (profile·cover·gallery·customer), storage_key, thumb_key, w, h, caption, moderation (pending·approved·rejected), hidden_by_vendor | Random storage keys; original filenames are never kept. |
| `reviews` | id, vendor_id, user_id, rating 1–5, body ≤500, moderation, vendor_reply, vendor_reply_at | Unique (vendor_id, user_id). |
| `favorites` | (user_id, vendor_id) PK, notify_on_open | |
| `push_devices` | user_id, expo_token | Stub. "Near me" is decided **on the device** (§6.7). |
| `reports` | id, reporter_user_id (set null on delete), target_type (vendor·photo·review·status_post·upcoming_post), target_id, reason, details, status (open·dismissed·upheld·resolved), admin_note | |
| `user_blocks` | blocker_user_id, blocked_user_id | Lets a vendor block a person from reviewing, photo-tagging or confirming them. |
| `still_here_confirmations` | id, vendor_id, confirmer_hash, epoch, local_day, counted | `confirmer_hash = HMAC(epoch_pepper, user_id‖vendor_id)`. No coordinates and no user id are stored. Rows and peppers are deleted after 30 days, after which old hashes can't be linked to anyone. |
| `hash_peppers` | epoch, secret | Rotated every 30 days. |
| `verification_progress` | vendor_id PK, live_days, last_live_day, confirmations_met_at, status (none·verified·revoked), verified_at, revoked_reason | Stores counters only, never a list of the days a vendor worked. |
| `invite_codes` | id, code (e.g. `TACO-7K2M`), label (campaign), max_redemptions, redemption_count, expires_at, disabled | Redeeming only increments the count. Codes are never linked to the account that used them. |
| `analytics_daily` | (vendor_id, day) PK, profile_views, map_impressions, directions_taps, favorites_added, favorites_removed, confirmations | Counters only, updated by upsert. |

## 6. Core mechanisms

### 6.1 Location fuzzing ("Approximate area", the default)
- Snap the reported point to a grid of ~180 m cells. The latitude step is fixed; the longitude step is scaled by the cell row's latitude. Publish the cell center plus a small offset (≤25 m) derived from `HMAC(secret, vendor_id‖cell)`, so vendors in the same cell don't stack. The true spot is always within about 150 m of the shown point.
- The same vendor at the same spot gets the same output on every query, every session and every day.
- Hysteresis: the published cell only changes once the vendor is at least 40 m inside a new cell, so the moment of a boundary crossing doesn't leak.
- Exact mode stores coordinates rounded to 5 decimals (~1 m).
- Maps draw approximate vendors as a soft ~150 m circle labeled "Approximate area".
- The same function fuzzes tomorrow posts and schedule spots.

### 6.2 Live sessions (heartbeat + TTL)
- Go Live inserts the row. The app sends a heartbeat with a fresh foreground location every 60 s, and `expires_at = last_heartbeat + 5 min` grace.
- **Every public query checks `expires_at > now() AND ends_at > now()`**, so visibility never depends on the sweeper. The sweeper runs every 30 s and on boot, and hard-deletes expired rows.
- `ends_at = min(auto-off timer of 2, 4 or 8 h, end of the vendor's "street day" at 3:00 AM local)`, with a 16 h hard cap. Go Offline deletes the row immediately.
- Foreground only, no background location. When the app is backgrounded, heartbeats stop and the server expires the session. When the vendor comes back after expiry, the app shows "You went offline automatically" and needs a tap to go live again. If the signal drops while the app is still open, it goes live again on its own once it reconnects, with a fresh location, as long as the timer hasn't run out.
- The Live screen keeps the phone awake (`expo-keep-awake`) with a dark, low-power layout.
- The vendor always sees one of three states: **Live**, **Reconnecting…** (heartbeats failing, still within the grace period) or **Offline**. Customers see "Live · confirmed 3 min ago".

### 6.3 Search
- `POST /v1/search {location, radius, q, filters}`. The client rounds the location to 3 decimals (~100 m) and the server rounds it again. Request logs record only method, route, status and duration: no bodies, query strings or IPs.
- Query pipeline: normalize (lowercase, unaccent, strip punctuation), then match the longest phrases against `tag_synonyms` ("la style hot dog", "danger dog", "jocho", "perro caliente", "esquites"…) to boost tags. Remaining words go to full-text search (simple config + unaccent, so English and Spanish both work) over name, description, menu items and tag names, plus trigram matching for typos.
- Results come in two groups. **Live** vendors are open now and sorted by distance (rounded to 0.1 mi). **Upcoming** vendors have a tomorrow post or published schedule spot in the radius within the next 48 h. Turning off the "Open now" filter adds the upcoming group to the list.
- **Vendors who are offline and have nothing scheduled never appear in search.** Their profile stays reachable by link or favorites. Vendors in vacation mode are excluded everywhere.
- Filters: category, radius, price level, payment methods (any of), languages (any of).

### 6.4 Vendor offline mode (mobile)
- **Cache:** TanStack Query, persisted to device storage, for profile, menu and posts.
- **Outbox** (expo-sqlite): each queued action stores `{id, type, entity_id, payload, client_updated_at, attempts, next_attempt_at, status}`. Creates use client-generated ids, so retrying is harmless. Updates and deletes carry `client_updated_at`; the server applies last-write-wins and answers `applied` or `superseded`. Superseded or failed items go to a **Sync issues** list that explains in plain words what happened. Every pending item shows a "Pending sync" chip.
- **Sync** runs on reconnect (NetInfo), on returning to the foreground and on a timer, with exponential backoff and jitter (2 s up to 5 min). A 4xx validation error stops retrying for that item.
- **Photos** are compressed on the device (≤1600 px, JPEG q≈0.7) and saved in the app's documents folder, then sent with a chunked upload that can resume: `POST /uploads`, then `PATCH` chunks with `Upload-Offset`, and `HEAD` to find where to resume.
- Go Live is not queued because it's real-time; reconnecting resumes it as in §6.2. Tapping Go Offline with no signal shows "You'll disappear from the map within 5 minutes", and the app sends the delete when it reconnects.
- A dev-only "Simulate no signal" switch sits next to the usual tools (Network Link Conditioner, turning Wi-Fi off).
- The outbox engine in `packages/shared/src/outbox/core.ts` is pure TypeScript with injected storage and transport, so it's unit-tested in Node.

### 6.5 Photos
- Accept JPEG, PNG or WebP up to 10 MB. The type is checked from the file contents, and a pixel limit guards against decompression bombs. Images are auto-rotated, then re-encoded to WebP at 1600 px plus a 400 px thumbnail. sharp drops all metadata (EXIF, GPS, XMP, ICC).
- Customer photos start as pending; vendor photos are approved automatically. The upload screen warns against faces and license plates. Automatic blurring is deferred.

### 6.6 "Community Verified" badge
Default criteria (configurable in env, shown in the app with progress bars and a "How do I earn this?" explainer):
1. Live on at least 10 distinct days.
2. At least 5 counted "Still here" confirmations from at least 3 distinct accounts on at least 3 distinct days, all within 30 days.
3. At least 3 approved reviews, averaging 3.5 or more.
4. No upheld reports in the last 90 days. Open reports don't count, so the badge can't be blocked by mass-reporting.

A "Still here" confirmation is only accepted when:
- the customer is signed in, the account is at least 24 h old, and it isn't a vendor account or the vendor themselves;
- the vendor is live right now;
- the customer's location (sent with the request and never stored) is within ~400 m of the public point (approximate mode) or ~200 m (exact mode).

Limits: one confirmation per account per vendor per 24 h, and at most one per 7 days counts toward the badge. Each account gets 10 per day, plus a per-IP limit kept in memory only.

An admin revoke keeps the badge off until an admin restores it. The badge never changes ranking.

### 6.7 Smaller pieces
- **Auth and safety:** sign up with email or phone, plus a password (≥10 characters) or a 6-digit PIN for assisted signup. A PIN locks for 15 min after 5 failed attempts. No legal name, address or ID, ever. Rate limits apply globally, with tighter limits on auth, uploads, reviews, reports and confirmations. CORS only allows the web origin. On web the refresh token is an httpOnly SameSite=Lax cookie; on mobile it's in SecureStore.
- **Notify when open:** stored as `favorites.notify_on_open`. On delivery, the server would push the vendor's approximate area and the device decides locally whether it's "near me", so the server never needs the customer's location. Sending is a stub that logs counts only.
- **Invites and flyers:** an admin creates a code with a campaign label. A locally generated QR code (`qrcode`, SVG) points to `${WEB_URL}/join?code=…`, which offers "Open in app" (`streeteats://` deep link) or continuing on the web. The flyer is a print-ready Letter page: big bilingual text, the three-step pitch, and the QR code. Use the browser's "Save as PDF".
- **Analytics:** counted as daily totals. Profile views and directions taps are reported as events, deduplicated on the client per app session. A map impression is counted when a vendor shows up in a results page. The dashboard shows 7- and 30-day charts.
- **Account controls:** instant offline, vacation mode, export (zip of JSON + photos), delete (asks for the password again, then hard-deletes everything including stored files; reports the person filed are kept but no longer linked to them).
- **i18n:** strings are grouped by namespace in `packages/shared/src/i18n/{en,es}`. Each app defaults to the device or browser language, with a manual switcher whose choice is remembered. The API returns error codes and the apps translate them. A test fails if the English and Spanish key sets differ. Category, payment-method and language labels are translation keys. Tags have English and Spanish names. Text that vendors write is shown as written.

## 7. API (all under `/v1`, JSON)

| Group | Endpoints |
|---|---|
| Meta | `GET /health` · `GET /meta` (categories, tags, payment methods, languages, badge criteria) · `GET /places?q=` (built-in LA gazetteer) |
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /me` · `PATCH /me` |
| Discovery (public) | `POST /search` · `GET /vendors/:id` · `GET /vendors/:id/reviews` · `GET /vendors/:id/photos` · `GET /vendors/:id/upcoming` · `POST /vendors/:id/events` (profile_view, directions) |
| Customer | `PUT`/`DELETE /vendors/:id/favorite` · `GET /me/favorites` (includes their upcoming posts) · `PUT`/`DELETE /vendors/:id/review` · `POST /vendors/:id/photos` · `POST /vendors/:id/still-here` · `POST /reports` · `PUT`/`DELETE /blocks/:userId` · `POST /me/push-devices` (stub) |
| Uploads | `POST /uploads` · `HEAD /uploads/:id` · `PATCH /uploads/:id` (`Upload-Offset`) |
| Vendor | `POST /vendor/quick-start` · `GET`/`PATCH /vendor/profile` · `PUT`/`DELETE /vendor/menu/:itemId` · `PUT /vendor/menu/:itemId/sold-out` · `GET`/`POST`/`DELETE /vendor/live` · `POST /vendor/live/heartbeat` · `PUT`/`DELETE /vendor/status/:postId` · `PUT`/`DELETE /vendor/upcoming/:postId` · `PUT /vendor/schedule` · `POST /vendor/photos` · `DELETE /vendor/photos/:id` · `PATCH /vendor/customer-photos/:id` (hide) · `PUT /vendor/reviews/:id/reply` · `GET /vendor/analytics?range=7d\|30d` · `GET /vendor/verification` |
| Account | `GET /me/export` · `DELETE /me` |
| Admin | `GET /admin/moderation` · `POST /admin/moderation/:kind/:id` · `GET /admin/reports` · `POST /admin/reports/:id` · `POST /admin/vendors/:id/verification` · `GET`/`POST /admin/invites` · public `GET /invites/:code` |

Vendor writes use `PUT` with a client-generated id and `clientUpdatedAt`, so outbox retries can't create duplicates.

## 8. Milestones (each ends with a real run, verification, and small commits)

| # | Scope | Done when |
|---|---|---|
| **M1** | Monorepo and tooling; docker-compose with PostGIS; env config; full Drizzle schema and migrations (all tables up front, so later milestones don't reshape them); seed of ~25 LA vendors flagged as demo, plus `seed:clear`; auth (register, login, refresh, logout, me); i18n scaffolding with EN/ES switcher; bare web and mobile shells; log redaction; sweeper skeleton | DB up, migrations and seed run, auth tested with curl, web and Simulator both render translated shells and switch EN/ES, tests pass |
| **M2** | Search (synonyms, full-text, trigram, filters), public profile, meta, gazetteer; `demo:live` keeps seeded vendors live; mobile and web map/list toggle, filters, profile, directions, location fallback | "LA style hot dog" finds the Danger Dog carts in the Simulator (custom location) and on the web. Tests: offline and hidden vendors never appear in results; synonym matching |
| **M3** | Quick start (under 2 min), rest of onboarding, Go Live with precision choice, timer and end of day; heartbeat, expiry and sweeper; status posts; menu CRUD and one-tap sold out; payment badges; vendor dashboard on mobile and web | A vendor goes live in the Simulator and appears on the web map, then disappears after Go Offline or after heartbeats stop. Tests: fuzzing (determinism, bounds, hysteresis, no exact coordinates stored in approximate mode); location deleted on offline, expiry, heartbeat loss and ends_at |
| **M4** | Resumable uploads and photo pipeline; moderation queue (web admin); reviews and replies; favorites and the notify stub; reports and blocks; "Still here?" | Photo uploaded from the Simulator, approved by admin, shown without metadata. Tests: EXIF/GPS stripping; confirmation anti-gaming rules |
| **M5** | Tomorrow posts, schedule, Upcoming tab; offline cache, outbox, sync issues UI; verification progress, badge and admin revoke | Edits made offline in the Simulator sync after reconnecting. Tests: posts auto-delete after their window; outbox idempotency, backoff and LWW; badge criteria |
| **M6** | Invite codes and QR flyers; analytics dashboards; privacy screens; export and delete; `PRIVACY_DESIGN.md`; README; contrast and big-touch-target pass; final end-to-end run | Full customer and vendor walkthrough on both apps; deleting an account removes every row and file |

Seeded logins (customer, live vendor, brand-new vendor, admin) use `.test` email addresses and are listed in the README.

## 9. Assumptions (all easy to change)

1. Signup is open. Invite codes are optional and only count campaign redemptions; `INVITE_REQUIRED=true` makes them required.
2. Email and phone are login identifiers only. There's no email or SMS sending (that would mean paid services), so there's no verification, and password resets go through the admin CLI for now.
3. Browsing needs no account. Favorites, reviews, photos, "Still here" and reports need one, which keeps abuse and anti-gaming manageable.
4. Closed vendors with no live session and no upcoming spot don't appear in search (§6.3). This is my reading of "offline vendors never appear in search results".
5. Timings: heartbeat every 60 s, 5 min grace, street day ends at 3:00 AM local (so late-night taco stands aren't cut off at midnight), 16 h maximum session. All set in env.
6. Approximate area is about 150 m, as described in §6.1.
7. Reviews appear right away unless a basic word filter holds them as pending. Customer photos always wait for an admin. `REVIEW_PREMODERATION=true` holds every review.
8. Text that vendors write isn't machine-translated. Prices are in USD. Distances are in miles, or km when the device region isn't the US.
9. Without location permission, customers pick from a built-in list of ~100 LA-area neighborhoods and cities, or move the map. There's no third-party geocoder.
10. Map tiles come from OSM on the web and Apple Maps on iOS. Those providers see which map area is being viewed (but not who is a vendor). This is documented in the privacy design.
11. Admins are created only by the seed or the CLI. A single API process runs the sweeper in-process, with no Redis or queue.
12. Seeded vendors only stay live while `npm run demo:live` is running. Otherwise the heartbeat rules expire them after 5 minutes, as designed.
13. Out of scope for now: real push delivery, email/SMS, face and plate blurring, App Store builds, cloud deploy, offline mode on the web, and payments.

## 10. Open question (blocking M1)

**Q1. Which Docker runtime should run Postgres + PostGIS?** None is installed.
- **Colima** (recommended): free and open source, CLI-only, light. I can install it with `brew install colima docker docker-compose` once you agree.
- **OrbStack** or **Docker Desktop**: GUI apps you install yourself.
- If you'd rather not use Docker at all: Homebrew `postgresql@17` + `postgis`. Everything else stays the same, but it departs from the brief's Docker Compose setup.
