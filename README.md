# StreetEats Finder (working name)

A "Yelp for street vendors": customers find nearby open hot dog carts, taco stands, fruit carts, elote, flowers and more on a live map; vendors tap **I'm Open** to appear. Everything runs locally. Privacy is a core design constraint (see [PLAN.md](PLAN.md); `PRIVACY_DESIGN.md` is written in M6).

| App | Path | URL |
|---|---|---|
| API (Fastify + Postgres/PostGIS) | `apps/api` | http://localhost:4000 |
| Web (Next.js) | `apps/web` | http://localhost:3100 |
| iOS app (Expo, runs in Expo Go) | `apps/mobile` | Metro on port 8090 |
| Shared types, schemas, EN/ES strings | `packages/shared` | |

> **Status:** M1 (foundation) and M2 (customer map, search, filters, vendor profiles on web and iOS) are done. Vendor tools, photos, reviews, offline mode and launch tools arrive in M3–M6 ([PLAN.md §8](PLAN.md)).

## Prerequisites

- **Node 22+** (developed on Node 24) and npm 10+
- **A Docker runtime.** This Mac uses [Colima](https://github.com/abiosoft/colima): `brew install colima docker docker-compose`. Docker Desktop or OrbStack work too.
- **Xcode** with an iOS Simulator runtime (for the mobile app)

## First-time setup

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
colima start
```

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run seed
```

`npm run db:up` starts Postgres 17 + PostGIS on `127.0.0.1:5432` (never exposed to your network) and creates the `streeteats_test` database the tests use. `npm run seed` loads 26 demo vendors around Los Angeles, with menus, tags, reviews, schedules and "tomorrow" posts. Re-running it replaces the demo data.

## Running

Use one terminal per app.

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open http://localhost:3100. You're redirected to `/en` or `/es` based on your browser language; the switcher in the header changes it, and the choice is remembered.

### Put demo vendors on the map

Live vendors only appear while their app is sending heartbeats. To keep 20 of the 26 seeded vendors live (the other 6 show up only under "coming later"):

```bash
npm run demo:live
```

Leave it running in its own terminal. Press Ctrl+C and the demo vendors go offline immediately. If you kill it hard, they disappear on their own within 5 minutes, which is the same rule real vendors follow.

If you sign in as a demo vendor (for example `vendor@demo.test`) and go live from the dashboard, `demo:live` notices and stops driving that vendor.

### iOS app in the Simulator

```bash
npm run ios
```

This starts Metro on port **8090** and opens the app in **Expo Go 58** on the booted simulator. If Expo offers to install or update Expo Go, accept it.

> **If you also work on other Expo projects:** Expo Go supports one SDK version at a time per simulator. To keep this project from changing the Expo Go version another project relies on, this repo was tested on a separate simulator called **"StreetEats iPhone 17"**. To use it:
>
> 1. Boot it in Simulator.app (File → Open Simulator → StreetEats iPhone 17).
> 2. Run `npm run dev:mobile` (Metro only, without `--ios`).
> 3. Open the app on that simulator:
>
> ```bash
> xcrun simctl openurl "StreetEats iPhone 17" exp://127.0.0.1:8090
> ```

The app follows the phone's language (Settings → General → Language & Region). The **English / Español** buttons at the top override it, and the choice is remembered.

**Expo's floating gear button** (the dev menu) can sit on top of the language buttons. Drag it out of the way.

## Demo logins

All demo accounts use the password **`streeteats-demo`**.

| Email | Role | What it's for |
|---|---|---|
| `customer@demo.test` | Customer | Favorites, reviews, photos, "Still here?" (the account is a month old, so it can confirm vendors) |
| `vendor@demo.test` | Vendor | Owns "Danger Dogs de la Esquina", fully set up |
| `newvendor@demo.test` | Vendor | No business yet, for trying the quick start |
| `admin@demo.test` | Admin | Moderation queue and reports at http://localhost:3100/en/admin |

All demo data (accounts and everything they own) is flagged as demo and can be removed before real vendors join. Tags and search synonyms are kept.

```bash
npm run seed:clear
```

Try the API directly:

```bash
curl -s -X POST localhost:4000/v1/auth/login -H 'content-type: application/json' -H 'x-client: mobile' -d '{"email":"vendor@demo.test","secret":"streeteats-demo"}'
```

## Tests

```bash
npm test
```

API integration tests run against the `streeteats_test` database and refuse to run against any other. They cover:

- **Auth:** refresh-token rotation and reuse detection, PIN lockout, cookie and CSRF rules, and confirming email and phone are never returned.
- **Location fuzzing:** the shown point stays within ~150 m of the real spot, the same input always gives the same output (so it can't be averaged out), different vendors get different points, and hysteresis at cell edges.
- **Sweeper:** live locations are deleted when heartbeats stop or time runs out, and "tomorrow" posts are deleted after their window.
- **Search:** offline vendors, vendors whose heartbeat expired or whose end time passed, and vendors in vacation mode never appear, even before the sweeper runs. Results never include account data. Also covered: synonyms ("LA style hot dog"), Spanish and typo matching, filters and ranking.
- **Go Live:** approximate mode stores only the fuzzed point; closing deletes the location at once; a late heartbeat never brings a vendor back; the timer and end of day are respected; and a device whose session was taken over by another phone or browser can't move the pin.
- **Logs:** no URLs, query strings, coordinates, search text, IPs or emails are written.

- **Photos:** EXIF and GPS are stripped (the test uploads a rotated phone photo with GPS coordinates and checks every served file); photos are kept upright; non-images are refused on the first chunk; huge-canvas "decompression bombs" are refused; uploads resume after a dropped connection and are swept after 24 h; customer photos stay private until approved; hidden and vacation-mode photos stop loading; rejected photos are deleted with their files.
- **"Still here?":** stores no location or identity; requires being near the public point (~400 m approximate, ~200 m exact), a live vendor and an account at least a day old; refuses vendors and blocked people; one per day per person, only one per week counts; a per-account daily cap; hashes change with each 30-day pepper and old peppers and rows are deleted.
- **Reviews, favorites, reports:** one review per customer, links/phones/slurs held for moderation, vendor replies, blocking without revealing who; favorite counts; reports never show the reporter, and upholding one takes the content down; moderation is for admins only.

The shared package tests cover:

- **Go Live on a device** (the logic the iOS app and website share), with fake timers: location is never read while the screen is hidden or for a session another device started; coming back after the grace period never restarts on its own; lost signal resumes with the original closing time; a heartbeat reply that arrives after closing doesn't put the vendor back on; turning location off mid-session closes the stand.
- **Resumable uploads:** every byte arrives exactly once after a dropped request or a lost reply, with backoff, and errors that retrying can't fix aren't retried.
- **Prices** as vendors type them ("7,50", "$7").
- **Translations:** every English string has a Spanish twin with the same placeholders.

```bash
npm run typecheck
```

## Simulating location and poor connectivity

- **Location (Simulator):** Features → Location → Custom Location…, then enter a point in LA, e.g. 34.0453, -118.2509 (Downtown). Or from a terminal:

```bash
xcrun simctl location "StreetEats iPhone 17" set 34.0453,-118.2509
```

- **Location (web):** the browser asks for permission the first time a vendor presses **I'm open**. To fake a position in Chrome, open DevTools → ⋮ → More tools → Sensors → Location.

- **"Still here?" on iPhone:** move the Simulator next to a live vendor's pin (the vendor page's map shows it), e.g. `xcrun simctl location "StreetEats iPhone 17" set 34.0399,-118.2509`.
- **A photo with GPS data:** `xcrun simctl addmedia "StreetEats iPhone 17" path/to/photo.jpg` adds it to the Simulator's Photos. Upload it from a vendor page; the stored copy has no location or camera data.

If you deny location access, the app and the website offer a built-in list of LA neighborhoods instead. That list is searched on the device, so nothing you type is sent anywhere.
- **Bad signal:** install *Network Link Conditioner* (Xcode → Open Developer Tool → More Developer Tools → "Additional Tools for Xcode") and pick the "Very Bad Network" or "100% Loss" profile. It affects the Simulator too. The vendor app gets a built-in "Simulate no signal" switch in M5.

## Trying it as a customer

No account is needed to browse.

1. Start the API, web and `npm run demo:live`.
2. Search **LA style hot dog**. The synonym system finds the bacon-wrapped, Danger Dog and Sonoran dog carts, and the line under the search bar shows what the query was understood as. Spanish works too: try **perros calientes**, **flores** or **elotes**. So do typos: try **tamals**.
3. Open **Filters** to filter by distance, category, price, payment type or language spoken (try Zapotec or Korean). Turn off **Open now** to also see vendors who plan to be somewhere later (dashed pins).
4. Tap a pin, then **View**, for the full profile with menu, schedule, upcoming spots and reviews. **Get directions** opens Apple or Google Maps at the vendor's public point. For approximate-area vendors that point is up to ~150 m from the cart.

**Signed in** as `customer@demo.test`, a vendor's page also has:

5. **♡ Save** to keep them under **Favorites** (a tab on iPhone, a header link on the web), with live status and where they'll be next. **Tell me when they open** is saved; real notifications come later, and the phone, not the server, would decide what's "near me".
6. **Write a review**: one per vendor, editable. Reviews with links, phone numbers or slurs wait for a moderator first.
7. **Add a photo** of what you bought. It's shrunk on the phone, uploaded in resumable chunks, re-encoded on the server with all location and camera data removed, and shown only after a moderator approves it.
8. **Are they here right now? → Yes, they're here** (only while the vendor is live and you're within ~400 m). Your location is checked once and never stored. One per vendor per day.
9. **Report** a vendor, a photo or a review.

## Moderating

Sign in as `admin@demo.test` and open **Moderation** in the header (http://localhost:3100/en/admin):

- **Photos waiting**: customer photos, visible only to moderators until approved. **Reject** deletes the photo and its files.
- **Reviews waiting**: reviews the text screen held back.
- **Open reports**: what was reported and why (never who reported it). **Uphold and take down** removes the photo, review or post; **Dismiss** and **Mark resolved** close the report.

The seed leaves one customer photo waiting so the queue isn't empty.

## Trying it as a vendor

Use `newvendor@demo.test` to try the quick start, or `vendor@demo.test` for a stand that's already set up (see [Demo logins](#demo-logins)).

**On the website** (http://localhost:3100):

1. **Sign in.** A new vendor goes straight to the quick start: business name, what you sell, a few items with prices and how people can pay. It takes under 2 minutes.
2. On **My stand**, choose **Approximate area** (the default) or **Exact spot**, optionally a closing timer, and press **I'm open**. The browser asks for your location. The small map shows exactly what customers see: in approximate mode it's a nearby point, never your real one.
3. Open http://localhost:3100 in a private window. Your stand is on the map and in search.
4. Mark an item **Sold out**, or post an update ("Fresh mangos until 6"). Both show on your public page right away.
5. Press **Close now**. You disappear from the map and the location is deleted. If you switch to another tab instead, you go offline on your own after 5 minutes.
6. **My profile** has payment badges (types only, never account names or numbers), languages, the default map precision, an optional public contact (off by default) and vacation mode.
7. **Photos** sets the profile and cover photos and the food gallery, and lists customer photos: **Hide from my page** (not delete), **Report**, or **Block this person**.
8. **Reviews** lets you reply publicly, report a review or block its author. Blocked people can't review you, add photos or confirm you; reviews they already wrote stay up unless a moderator removes them, so blocking can't be used to hide criticism.

**On iPhone:** open the **Account** tab → sign in → **Open my vendor dashboard**. It works the same way and keeps the screen awake while you're live. Set the Simulator's location first (see [Simulating location](#simulating-location-and-poor-connectivity)).

**One device at a time:** if you're live on the phone and open the dashboard on a laptop, the laptop shows **Live from another device** and never shares its own location unless you press **Use this device's location**. The phone then stops sending its location.

## Useful commands

| Command | What it does |
|---|---|
| `npm run db:up` / `npm run db:down` | Start / stop Postgres (data is kept in a Docker volume) |
| `npm run db:reset` | Delete the database volume and re-run migrations |
| `npm run db:generate` | Generate a SQL migration after editing `apps/api/src/db/schema.ts` |
| `npm run seed` / `npm run seed:clear` | Load / remove demo data |
| `npm run seed -- -- --tags-only` | Reload tags and search synonyms only, keeping demo data |
| `npm run demo:live` | Keep demo vendors live (Ctrl+C takes them offline) |
| `colima stop` | Stop the Docker VM when you're done |

## Ports

The web app uses **3100** and Metro uses **8090** so they don't collide with other projects on the default 3000/8081. Change them in `apps/web/package.json`, `apps/mobile/package.json` and `CORS_ORIGINS` in `.env`.
