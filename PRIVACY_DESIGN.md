# StreetEats privacy design

Street vendors can be vulnerable to harassment, enforcement, immigration action and plain theft. This document explains what StreetEats stores, for how long, who can see it, and which attacks the design is meant to stop. It covers every feature through M6.

The plain-language version for users is the "Your privacy" screen (`/en/privacy` and `/es/privacy` on the web; Account → Your privacy in the iOS app). Mechanism details live in [PLAN.md §5–6](PLAN.md).

## 1. Principles

1. **No history of where a vendor has been.** The database holds a vendor's location only while they are live, and only the point customers see. When the session ends, the row is deleted.
2. **Approximate by default.** A vendor has to choose "Exact spot" to publish their real position. That applies to Go Live, tomorrow posts and the weekly schedule.
3. **The customer's location is never stored.** It is used for one query, then dropped. It travels in request bodies, never in URLs, and is never logged.
4. **Collect as little as possible.** An account needs an email or phone number plus a password or PIN. There is no legal name, address, ID or immigration question, ever.
5. **Count, don't track.** Analytics, invite redemptions and verification progress are counters. Nothing records which person did what.
6. **Leaving is real.** Export gives you everything we hold about you. Delete removes every row and file, right away.
7. **No third-party services that see users.** There is no analytics SDK, no ad network, no crash reporter, no email or SMS provider, and no geocoder. The QR code is drawn on the device. The only outside parties are the map tile providers (§4.13).

## 2. Who we protect, and from whom

| Adversary | What they want | What stops them | What's left |
|---|---|---|---|
| **Stalker or harasser** using the public app | A specific vendor's exact spot, home or routine | Approximate area by default (§4.2), deterministic snapping so repeated queries can't be averaged, hysteresis at cell edges, no history, vacation mode hides the vendor everywhere, offline vendors never appear in search, "last live" rounded to the hour | A vendor who picks "Exact spot" is findable while live, by design. Someone watching the map in real time learns the area while the vendor is live. |
| **Enforcement or immigration agency** with legal process or a copy of the database | Who sold where and when, and who they are | No location history table, live rows deleted on offline, expiry or heartbeat loss, no legal identity collected, request logs carry no IPs, coordinates or bodies, "Still here?" rows are hashed and expire, analytics are daily counters | A copy taken at a given moment shows who is live at that moment, as the public map does. Email or phone identifies the account holder. Backups hold whatever was live when they were taken (§6). |
| **Scraper or competitor** | Bulk lists of vendors and positions | Random UUIDs (no enumeration), rate limits, approximate points | Anyone can see the public map; this is the product. |
| **Vendor** who wants to identify customers | Who reviewed, photographed, confirmed or favorited them | Reviews show a display name only. Blocks use an opaque handle, never an account id. Confirmations are anonymous hashes. Favorites and stats are counts. A vendor's export has no customer identities. | Display names are chosen by customers; some may use real names. |
| **Customer or ring of accounts** gaming the badge or burying a vendor | Fake "Still here?" taps, review bombing, mass reports | Account age ≥ 24 h, one tap per vendor per day, one counted per week, distinct accounts and days, proximity check against the public point, per-account and per-IP limits, open reports never count, admins can revoke | A determined group of real, aged accounts near the stand could still earn a badge; admins can revoke it. |
| **Thief or abuser with the vendor's phone** | Account access, queued posts | Refresh token in iOS Keychain (SecureStore); sign out clears the outbox and cache; delete account kills every token | Queued changes sit unencrypted in app storage until they sync (§4.9). A thief with an unlocked phone can use the app as the vendor. |
| **Network observer** | Coordinates, tokens | HTTPS in production (§6); locations in POST bodies, never URLs; httpOnly cookie on web | Local dev runs on plain HTTP. |
| **Insider or compromised server** | Everything | Least data stored: no history, no customer locations, hashed confirmations, counters only, no secrets in logs | Whoever runs the server sees current live points (exact ones too), account emails and phone numbers, and content awaiting moderation. |

## 3. Data inventory

| Data | Where | Kept for | Who can see it |
|---|---|---|---|
| Email or phone, password hash (argon2id), display name, language | `users` | Until the account is deleted | The account holder; admins through the CLI. Never in a public response. |
| Refresh-token hashes | `auth_sessions` | Until expiry (30 days), sign-out, reuse detection or account deletion | Nobody (hashes only) |
| Vendor business profile, menu, payment badges, languages | `vendor_profiles`, `menu_items` | Until deleted | Public (unless in vacation mode). Contact text only if the vendor turns it on (off by default). |
| **Current live point** (fuzzed, or exact if chosen), cell key, times | `vendor_live_sessions`, one row per vendor | While live. Deleted on Go Offline, expiry (5 min with no heartbeat), auto-off timer, 3:00 AM local or 16 h cap. | Public while live |
| Last time live | `vendor_profiles.last_live_at` | Rounded down to the hour, overwritten each time | Public ("Live 2 h ago") |
| Tomorrow posts | `upcoming_spot_posts` | Until 1 h after the window ends | Public |
| Weekly schedule | `schedule_entries` | Until edited | Public only if the vendor turns "show to customers" on |
| Status posts | `vendor_status_posts` | Until they expire | Public |
| Photos | Disk (random keys) + `photos` | Until removed, rejected, upheld in a report, or the account is deleted | Public once approved and not hidden; uploader, vendor and moderators otherwise |
| Upload staging | Disk + `uploads` | 24 h | Uploader |
| Reviews and replies | `reviews` | Until deleted | Public once approved |
| Favorites | `favorites` | Until removed | The customer; the vendor sees only a count |
| Reports | `reports` | Kept for moderation. When the reporter deletes their account, the reporter link is set to null. | Admins |
| Blocks | `user_blocks` | Until removed | The vendor (as display name + opaque handle) |
| "Still here?" taps | `still_here_confirmations`: vendor, HMAC hash, day, counted flag. **No location, no user id.** | 30 days | Nobody. The vendor sees "confirmed N min ago". |
| Hash peppers | `hash_peppers` | Each one lives at most 60 days (current + previous) | Nobody |
| Verification progress | `verification_progress`: counters and the last live day | Until the account is deleted | The vendor; the badge itself is public |
| Daily stats | `analytics_daily`: counters per vendor per day | Until the account is deleted | The vendor |
| Invite codes | `invite_codes`: code, campaign label, limit, redemption count | Until an admin deletes them | Admins |
| Tombstones for deleted menu items and posts | `deleted_entities` | 30 days | Nobody (they stop stale offline edits from resurrecting things) |
| Request logs | stdout | Whatever the host keeps | Operators. Method, route pattern, status and duration only. |

**Never stored on the server:** a customer's location, an IP address, a vendor's past locations, a vendor's exact spot in approximate mode, who redeemed an invite, who confirmed a vendor, or any per-customer activity.

## 4. Decisions by feature

### 4.1 Going live, heartbeats and timeouts
- Foreground location only. The app asks only for "While Using" permission and has background location turned off in its config (`apps/mobile/app.config.ts`).
- While live, the app sends a heartbeat with a fresh location every 60 s. `expires_at = last heartbeat + 5 min`. Leaving the app stops heartbeats, so a backgrounded or killed app drops off the map within 5 minutes. That is the brief's "auto-offline after N minutes in the background", enforced by the server so it works even if the phone dies.
- Every public query checks `expires_at > now() AND ends_at > now()`, so a stale point is never shown even if the sweeper is late. The sweeper hard-deletes those rows every 30 s.
- A session also ends at the vendor's timer (2, 4 or 8 h), at 3:00 AM local, or after 16 h, whichever comes first. Go Offline deletes the row at once. Signing out and vacation mode go offline first.
- One device at a time: a forgotten browser tab can't keep sending its location once the cart's phone goes live.
- The web dashboard follows the same rules: it sends heartbeats only while its tab is visible.

### 4.2 Location fuzzing ("Approximate area", the default)
- The server snaps the reported point to a ~180 m grid and publishes the cell center plus a small offset (≤ 25 m) derived from `HMAC(LOCATION_FUZZ_SECRET, vendor id ‖ cell)`. The real spot is always within ~150 m of the shown point. The exact point is used in memory for this step and never written anywhere.
- **Deterministic, not random.** The brief suggested a per-session random offset. We don't use one: random offsets can be averaged across many sessions to find the vendor's regular corner. A snapped point is identical every time, so averaging recovers nothing.
- **Hysteresis.** The published cell changes only once the vendor is 40 m inside a new cell, so the moment of crossing a cell edge doesn't reveal where the edge was crossed.
- Maps draw approximate vendors as a soft ~150 m circle labeled "Approximate area", not a pin.
- Exact mode stores coordinates rounded to ~1 m.
- The vendor's own dashboard shows the published point, so they see exactly what customers see.

### 4.3 Tomorrow posts and the weekly schedule
- Same fuzzing and the same approximate default as Go Live. Only the published point is stored.
- A post's window must end in the future, last at most 16 h and start within 14 days. Public queries hide it once the window ends, and the sweeper deletes it an hour later. There's no archive of past posts.
- The schedule is private until the vendor turns on "show to customers". Re-saving sends back the already-published point, and fuzzing a published point returns the same point, so editing never moves or sharpens a spot.

### 4.4 Search and the customer's location
- `POST /v1/search` with the location in the body, so it never appears in URLs, proxy logs or browser history.
- The app rounds the location to 3 decimals (~100 m) before sending it, and the server rounds it again. It's used for the distance query and then discarded.
- Without location permission, customers pick from a built-in list of neighborhoods. No outside geocoder is called.
- Vendors who are offline with nothing scheduled never appear in search. Vacation mode hides the profile, photos and posts everywhere.

### 4.5 "Still here?" confirmations
- The phone rounds the customer's location to ~10 m. The server compares it, in memory, with the vendor's public point (within ~400 m approximate, ~200 m exact) and then drops it.
- The stored row has the vendor, the day and `HMAC(pepper, user id ‖ vendor id)`. No user id, no location. The pepper rotates every 30 days. Rows are deleted after 30 days and each pepper after at most 60, after which no stored hash can be tied to an account, even by us.
- Repeats are checked under the current and previous pepper, so a rotation can't be used to count one person twice.
- The per-account daily cap and per-IP limit are kept in memory only.

### 4.6 Verification badge
- Built from counters (live days, the last live day, the date the confirmations step was reached), never a list of days or places worked.
- Optional and purely a trust signal. It never changes search ranking. Open reports don't count against it, so mass-reporting can't block it; only an upheld report does.
- The criteria are published in `GET /meta` and shown in the app as "How do I earn this?" with the vendor's own progress.
- Admins can revoke it (web admin or `npm run admin -- badge revoke`), and it stays off until restored.

### 4.7 Photos
- Type checked from the file's contents, ≤ 10 MB, a pixel limit against decompression bombs.
- Re-encoded with sharp to WebP at 1600 px plus a 400 px thumbnail. All metadata is dropped (EXIF, GPS, XMP, ICC). Original filenames are never kept; storage keys are random.
- The upload screen warns not to include faces or license plates. Automatic blurring isn't built yet (§7).
- Files are served only while the photo is approved, not hidden by the vendor, and the vendor isn't in vacation mode. Taking one down works at once on our side; public image responses are cacheable for 5 minutes, so a copy already in a viewer's browser can linger that long.

### 4.8 Reviews, reports and blocks
- Reviews show the author's display name only. A basic text screen holds reviews that contain links, emails, phone numbers or slurs for moderation, so people can't post a vendor's private details.
- Vendors can hide customer photos of their stand (hide, not delete) and report them.
- A vendor blocks a person without learning who they are: blocks are listed by display name and an HMAC handle, never an account id. Blocking stops new reviews, photos and confirmations from that person. It doesn't hide reviews already written, so it can't be used to bury criticism.

### 4.9 Offline queue (vendor phone)
- Every vendor change on the phone goes through the outbox, stored in `expo-sqlite/kv-store` along with the last copy of the business. That data sits in the app's private sandbox, protected by iOS data protection while the phone is locked, but it isn't encrypted by the app.
- A queued tomorrow post holds the spot the vendor picked until it syncs, because fuzzing happens on the server. That's the only place a pre-fuzzing point is kept, it's on the vendor's own phone, and it's removed as soon as the server accepts the change.
- Queued photos are copied into the app's documents folder and deleted after upload.
- Go Live is never queued; it only happens with signal and a fresh location.
- Signing out and deleting the account clear the queue, the cache and any queued photos.

### 4.10 Analytics
- `analytics_daily` has one row per vendor per day with counters: profile views, map impressions, directions taps, favorites added and removed, confirmations. No customer ids, no IPs, no locations, no device ids.
- The app deduplicates profile views and directions taps per app session on the device, so a refresh doesn't inflate numbers. Nothing identifying is sent to do that.
- Vendors see 7- and 30-day totals and per-day columns. "Favorites now" is a count.

### 4.11 Invite codes and QR flyers
- A code has a campaign label, an optional limit and expiry, and a redemption count. Redeeming only increments the count. Nothing links a code to the account that used it, and a test checks there is no such column.
- `GET /v1/invites/:code` answers `{valid}` and nothing else, so it can't be used to learn a campaign's name or numbers.
- The QR code is generated in the browser with the `qrcode` library. No QR service sees the link. The flyer page prints to Letter; "Save as PDF" stays on the admin's machine.

### 4.12 Export and delete
- **Export** (`GET /v1/me/export`, Account → Download my data) returns a zip: a bilingual README, `account.json` with everything tied to the account, and copies of the photos the person uploaded (the same metadata-free files we serve). It never includes a password hash, token, or another person's identity: a vendor's export lists the approved reviews they received without their authors, blocked people by display name only, and stats as counts. "Still here?" taps a customer made aren't included because we can't tell which are theirs.
- **Delete** (`DELETE /v1/me`, Account → Delete my account) asks for the password or PIN again, then:
  1. ends any live session,
  2. collects every file key (photos, thumbnails, staged uploads),
  3. deletes the user row; every other table cascades from it (profile, menu, posts, schedule, photos, reviews, favorites, blocks, stats, verification, tokens),
  4. deletes the files.
  Reports the person filed are kept for moderation with the reporter link cleared. Any access token still in flight is refused at once because each request checks that the account still exists.
- The test suite scans every uuid and text column in the database after a purge to prove no row mentions the deleted account, and checks the upload folder for leftover files.
- Admins can purge an account with `npm run admin -- delete-account <email> --yes` (same code path).

### 4.13 Logs and third parties
- Request logs have one line per request: method, route pattern (`/v1/vendors/:id`, not the raw URL), status and duration. No bodies, query strings, headers or IPs.
- Database errors are reduced to their SQLSTATE code, because driver messages repeat query parameters, which can include coordinates or emails.
- The "notify when open" sender is a stub that logs counts only. When it's built, the server would send the vendor's approximate area and the phone would decide "near me", so the server never needs a customer's location.
- **Map tiles:** the website loads OpenStreetMap tiles and iOS uses Apple Maps. Those providers see which area is on screen and the viewer's IP, like any map. They don't learn who is a vendor or where vendors are; the points are drawn on our side. A self-hosted tile server would close this gap.

### 4.14 Accounts and safety
- Passwords ≥ 10 characters (argon2id), or a 6-digit PIN for assisted signup that locks for 15 min after 5 wrong tries.
- Access tokens last 15 minutes. Refresh tokens rotate on every use, are stored hashed, and a reused token revokes its whole family. On web the refresh token is an httpOnly SameSite=Lax cookie; on iOS it's in the Keychain.
- Rate limits everywhere, tighter on sign-in, uploads, reviews, reports, confirmations and export.
- CORS allows only the web origin.
- All public ids are random UUIDs, and a vendor's public id is not their account id.
- Email and phone are login identifiers only and are never shown publicly. There's no email or SMS sending, so password resets go through an admin (`npm run admin -- reset-password`), which also signs out every device.

## 5. Tests that guard this

| Area | Test file |
|---|---|
| Fuzzing: determinism, bounds, hysteresis, no exact coordinates stored in approximate mode | `apps/api/test/fuzz.test.ts`, `live.test.ts` |
| Location deleted on offline, expiry, heartbeat loss and end time | `apps/api/test/live.test.ts`, `sweeper.test.ts` |
| Offline and hidden vendors never in search | `apps/api/test/search.test.ts` |
| EXIF/GPS stripping, photo visibility | `apps/api/test/photos.test.ts` |
| Tomorrow posts deleted after their window | `apps/api/test/upcoming.test.ts`, `sweeper.test.ts` |
| "Still here?" anti-gaming, hashing and pepper rotation | `apps/api/test/community.test.ts` |
| Badge criteria and revoke | `apps/api/test/verification.test.ts` |
| Logs contain no coordinates, bodies, query strings or IPs | `apps/api/test/logging.test.ts` |
| Export contents; delete leaves no rows or files; tokens die; stats are counters only; invites unlinked | `apps/api/test/account.test.ts` |
| Admin CLI purge and password reset | `apps/api/test/admin-cli.test.ts` |
| Go Live timing rules shared by both apps | `packages/shared/src/live/controller.test.ts` |
| Outbox idempotency, backoff, last-write-wins | `packages/shared/src/outbox/*.test.ts` |
| Every privacy string exists in English and Spanish | `packages/shared/src/i18n/i18n.test.ts` |

## 6. Running it for real

The code makes the guarantees above, but whoever runs it in production has to keep them:
- **HTTPS only**, for the API and the website. Set `API_PUBLIC_URL`, `WEB_BASE_URL` and `CORS_ORIGINS` to the https origins.
- **Secrets:** generate fresh `JWT_SECRET` and `LOCATION_FUZZ_SECRET` values (32+ random characters each). Changing the fuzz secret moves every approximate point once; don't rotate it casually, and never publish it.
- **Backups** contain whatever was live at backup time and any account not yet deleted. Keep backup retention short (days, not months), encrypt them, and don't restore an old backup without re-running deletes made since.
- **Logs:** keep the default serializers. Don't put a proxy in front that logs request bodies or client IPs, or set it to drop them.
- **Demo data:** run `npm run seed:clear` before real vendors join.
- **Admins** are created only with the CLI. Treat admin accounts like production credentials.

## 7. Known gaps

- No automatic face or license-plate blurring yet; vendors and customers are warned instead.
- The phone's offline queue isn't encrypted by the app beyond iOS data protection.
- Map tile providers see the viewed area and IP (§4.13).
- Display names are free text; a customer can choose their real name.
- There's no email verification or self-service password reset, because both need a paid sending service.
