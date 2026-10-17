# Project: StreetEats Finder (working name) – a "Yelp for street vendors"

## Goal
Build a mobile app (iOS, tested in the Xcode iOS Simulator) and a website for finding street vendors on a map: hot dog carts, flower sellers, tamale vendors, fruit carts, elote, churros, etc. Everything runs locally for now (no cloud deployment). Customers search for something like "LA style hot dog" and see a map of the nearest open vendors who sell it. Vendors log in to go "open", share their location, promote their business, and post photos.

This is an exploratory prototype: prioritize a working end-to-end experience and clean architecture over exhaustive polish, so I can play with it and decide where to take it next.

## Two user roles (separate experiences, same backend)
1. **Customers** (can browse without an account; account needed to post photos/reviews/favorites)
2. **Vendors** (account required; separate vendor dashboard)

## Tech stack (use these unless you find a strong reason not to, and explain if so)
- Monorepo: `/apps/mobile`, `/apps/web`, `/apps/api`, `/packages/shared` (shared TypeScript types, validation schemas, i18n strings)
- **Mobile:** Expo (React Native + TypeScript), expo-router, react-native-maps (Apple Maps on iOS, no API key needed), expo-location, expo-image-picker. Must run in the Xcode iOS Simulator (`npx expo run:ios` or `npx expo start --ios`). Native Swift/SwiftUI is explicitly out of scope for now.
- **Web:** Next.js (App Router) + TypeScript + Tailwind, Leaflet with OpenStreetMap tiles (no API key).
- **API:** Node + TypeScript (Fastify or Express), Zod validation, JWT auth with refresh tokens, password hashing with argon2 or bcrypt.
- **Database:** PostgreSQL + PostGIS via Docker Compose (geospatial "nearest" queries). Use Prisma or Drizzle with SQL migrations.
- **Image storage:** local disk folder served by the API for now, behind a storage interface so it can swap to S3 later.
- Include a seed script with ~25 realistic fake vendors around Los Angeles (hot dogs, flowers, tacos, elote, fruit cups, churros), with menu items, tags, payment methods, sample photos/placeholders, and a few seeded "tomorrow" posts.

## Language support (English + Spanish from day one)
- Set up i18n scaffolding in mobile and web with full English and Spanish translations for all core screens (search, map, vendor profile, Go Live, onboarding, privacy screen, menu management).
- Default to the device/browser language, with a manual language switcher.
- Vendors can list languages they speak on their profile, and customers can filter by it.
- Keep all user-facing strings in translation files (no hardcoded text), so adding more languages later is easy.

## Customer features
- Home screen: map centered on the user's location (ask permission; fall back to a city search/manual location if denied) with pins for vendors currently **open**, plus a list/map toggle.
- Search bar: searches vendor names, categories, menu items, and tags. Searching "LA style hot dog" should match vendors tagged with things like bacon-wrapped hot dog, Danger Dog, Sonoran dog, etc. Build a small synonym/tag system for this. Results sort by distance and open status.
- Filters: category, open now, distance radius, price range, payment methods accepted, languages spoken.
- Vendor profile page: name, description, categories, menu/items with prices, photos, hours/typical schedule, last-active time, payment badges, verification badge, rating and reviews, "Get directions" (open Apple Maps / Google Maps), favorite button.
- Customers can upload photos of food/items they bought, tagged to a vendor (moderation queue, see below).
- Ratings and short reviews (one per user per vendor).
- Favorites; optional "notify me when this vendor opens near me" (design the data model now; implement the push piece as a stub).
- "Still here?" quick confirmation: a customer who is near a live vendor can tap a one-tap "Yes, they're here" (see verification badge below). No personal data stored with it.
- Report vendor / report photo / report review.

## Vendor features (separate dashboard after login)
- Onboarding: business display name, category, description, languages spoken, payment methods accepted, menu items with prices, profile photo, cover photo.
- **Big "Go Live / I'm Open" toggle.** When ON, the app shares the vendor's location and shows them on the map. When OFF, they are completely invisible on the map and no location is stored or updated.
- Optional auto-off timer (e.g., "close automatically in 2/4/8 hours") and automatic shut-off at end of day so a vendor never forgets it's on.
- Post a status update/promo ("Fresh strawberries today", "Sold out of onions", "Specials until 5pm"). Shown on their profile and as a banner on the map pin.
- **"Where I'll be tomorrow" posts:** vendors can announce a future spot and time window (e.g., "Saturday 4–9pm near X") so regulars can plan ahead without the vendor sharing live location. Vendor chooses the precision (default: approximate area, same fuzzing as live location) and can edit or delete anytime. Posts auto-delete shortly after their time window ends. Customers can favorite a vendor to see their upcoming posts, and these appear on the vendor profile and in an "Upcoming" tab on the map.
- **Payment method badges:** vendor selects what they accept: Cash, Card, Venmo, Zelle, Cash App, Apple Pay (extensible list). Shown as icons on the profile and pin detail card. Vendors only choose the *type*; never collect or display account handles, phone numbers, or payment account details.
- Upload/manage photos of food and items; edit menu items; mark items "sold out" in one tap.
- Simple analytics (no personal data): profile views, map impressions, directions taps, favorites count, by day/week.
- Manage reviews: reply publicly, report abusive ones.
- Optional posted regular schedule/spots (e.g., "Fridays near X intersection") that the vendor chooses to publish.

## Vendor offline-friendly mode (spotty signal is the norm on the street)
- The vendor app must remain usable with poor or no connectivity: cache the vendor's profile, menu, and recent posts locally.
- Queue actions made offline (mark item sold out, edit menu, create status post, schedule "tomorrow" post, photo uploads) in a local outbox with clear "Pending sync" indicators, then sync automatically with retry/backoff when the connection returns. Resolve conflicts with last-write-wins and show the vendor what happened if something couldn't sync.
- **Go Live with weak signal:** use a heartbeat/TTL model. The server keeps a vendor live only while it receives periodic heartbeats; if heartbeats stop (lost signal, app killed, phone died), the live session expires on its own after a short grace period and the stored location is deleted. Show the vendor a clear status ("Live", "Reconnecting...", "Offline") so they know what customers see.
- Compress photos on-device before upload to work on slow connections, and make uploads resumable/retryable.
- Keep the vendor UI lightweight (low data usage, no heavy assets).
- Customers see a vendor's "last confirmed live" time so stale pins are obvious.

## Vendor verification badge (community-based, no ID required)
- Offer a "Community Verified" badge earned through trust signals, never by collecting documents or identity information. Example signals: vendor has been live on N distinct days, customers have confirmed "Still here" on multiple distinct occasions, a minimum number of approved reviews with a healthy average, and no unresolved upheld reports.
- Make the criteria transparent in-app ("How do I earn this?") and show vendors their progress toward it.
- Verification is optional and purely a trust signal. Vendors without the badge are fully visible and not penalized in search, only sorted normally. Guard against gaming (rate-limit confirmations, require distinct accounts and sufficient time between them, ignore confirmations that don't match the vendor's live location window).
- Admins can revoke the badge if abuse is detected.

## Vendor-first launch tools (a map with no vendors is useless)
- **Invite codes and QR flyers:** admin page that generates invite codes/links and printable flyers (PDF or print-friendly web page) with a QR code that opens the vendor signup flow (or app/web fallback) with the code applied. Flyers should be bilingual (English/Spanish), big text, simple, and show the 3-step pitch: "Sign up free. Tap 'I'm Open'. Customers find you."
- Track only aggregate invite stats (codes created, redeemed). No personal data about who was invited.
- **Fast onboarding:** a "quick start" path that gets a vendor live in under 2 minutes (name, category, a few menu items, go live), with the rest (photos, descriptions, schedule) completable later. Optionally allow a helper to onboard a vendor in person on their phone ("assisted signup") with the vendor setting their own password/PIN afterward.
- Seed data should be clearly flagged as demo data so it can be wiped easily (`npm run seed:clear`) before real vendors join.

## PRIVACY (top priority, design this in from the start, not as an afterthought)
Street vendors can be vulnerable (harassment, enforcement, immigration concerns, safety). Treat their data protectively:
- **Location is opt-in and ephemeral.** Only store the *current* location while the vendor is Live. No location history table. On going offline, expiry, heartbeat loss, or app timeout, delete the stored coordinates. No background location tracking; use foreground location only, and if the app is backgrounded for more than N minutes, auto-set to offline.
- **Location precision control per vendor:** "Exact spot" vs "Approximate area" (server-side fuzzing/snapping to roughly a ~150m radius or nearest block, deterministic per session so it can't be averaged out by repeated queries). Default to approximate, and let the vendor choose exact if they want customers to find them easily. The same applies to "tomorrow" posts and scheduled spots.
- **Minimal PII:** vendors sign up with email (or phone) + a public *business display name*. Do NOT require legal name, address, government ID, or immigration-related information. Never show email/phone publicly. Make phone/contact optional and off by default.
- **Photos:** strip EXIF/GPS metadata from every uploaded image server-side, re-encode, and limit size/type. Warn vendors not to include faces or license plates; face/plate blurring is a "nice to have" if time permits.
- **Customer privacy:** the customer's location is used only for the query and is never stored or logged on the server (don't log coordinates in request logs). Round/coarsen any location sent in search requests where possible. "Still here?" confirmations store no customer location or identity beyond what's needed to prevent duplicate/gamed confirmations (e.g., hashed, expiring, never exposed).
- **Analytics are aggregate only,** with no per-customer tracking.
- **Account controls:** vendors can instantly go offline, hide their profile entirely ("vacation mode"), export their data, and permanently delete their account and all data, including photos and scheduled posts.
- **Safety:** block/report tools, rate limiting, and abuse protection on the API; never expose vendor internal IDs sequentially (use UUIDs).
- Add a plain-language "Your privacy" screen in both apps (English and Spanish) explaining exactly what's shared and when.
- Write a `PRIVACY_DESIGN.md` documenting these decisions and the threat model, including the new features (offline queue, heartbeats, tomorrow posts, verification signals, invite tracking).

## Moderation and trust
- User-uploaded photos/reviews go through a basic moderation state (pending/approved/rejected) and report flow; include a minimal admin page or CLI to review reports.
- Vendors can remove customer photos of their business from their profile (hide, not delete) and report them.

## Data model (propose, then implement)
Users (role: customer/vendor/admin), VendorProfiles (including languages, payment methods, verification status), MenuItems, Tags/Synonyms, VendorLiveSessions (current location only, with expiry and last heartbeat), UpcomingSpotPosts (future location + time window, with precision and auto-expiry), Photos, Reviews, Favorites, Reports, VendorStatusPosts, StillHereConfirmations (minimal, anonymized, expiring), VerificationProgress, InviteCodes (aggregate redemption only), AnalyticsDaily.
Add a PostGIS index on live location for fast nearest-vendor queries.

## How I want you to work
1. **Start by reading this whole brief, then write a short plan** (architecture, folder structure, data model, API endpoints, milestones) in `PLAN.md`. Ask me at most 5 clarifying questions only if truly blocking; otherwise make reasonable assumptions and list them in `PLAN.md`.
2. Build in milestones, and after each one, run it and verify it works before moving on:
   - M1: Docker Compose (Postgres/PostGIS), API skeleton, migrations, seed data, auth, i18n scaffolding
   - M2: Customer flow: map, search, filters, vendor profile (API + mobile + web)
   - M3: Vendor flow: quick-start onboarding, Go Live toggle with privacy modes, heartbeat/auto-expiry, status posts, menu management, payment badges
   - M4: Photos (upload, EXIF stripping, moderation), reviews, favorites, reports, "Still here?" confirmations
   - M5: "Tomorrow" posts, vendor offline mode (local cache + outbox sync), verification badge logic
   - M6: Invite codes and QR flyers, analytics, privacy screens, account deletion/export, polish
3. Provide a `README.md` with exact commands to: start the DB, run migrations and seed, start the API, start the web app, and launch the iOS app in the Xcode Simulator. Include how to simulate a location in the Simulator (Features > Location), how to simulate poor connectivity to test offline mode, and how to test as both a customer and a vendor (provide seeded test logins).
4. Write tests for the privacy-critical logic: location fuzzing, location deletion on offline/expiry/heartbeat loss, EXIF stripping, offline vendors never appearing in search results, "tomorrow" posts auto-deleting after their window, and verification-gaming protections.
5. Keep the UI clean, friendly, and simple. Many vendors may be non-technical and use the app on a phone outdoors, so use big buttons, high contrast, minimal text, and a simple English/Spanish toggle.
6. Don't add paid services or API keys. Put any config in `.env.example`.
7. Commit in small, logical steps with clear messages.

Begin with the plan.
