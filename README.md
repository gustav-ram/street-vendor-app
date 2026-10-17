# StreetEats Finder (working name)

A "Yelp for street vendors": customers find nearby open hot dog carts, taco stands, fruit carts, elote, flowers and more on a live map; vendors tap **I'm Open** to appear. Everything runs locally. Privacy is a core design constraint (see [PLAN.md](PLAN.md); `PRIVACY_DESIGN.md` is written in M6).

| App | Path | URL |
|---|---|---|
| API (Fastify + Postgres/PostGIS) | `apps/api` | http://localhost:4000 |
| Web (Next.js) | `apps/web` | http://localhost:3100 |
| iOS app (Expo, runs in Expo Go) | `apps/mobile` | Metro on port 8090 |
| Shared types, schemas, EN/ES strings | `packages/shared` | |

> **Status:** Milestone 1 (foundation) is done: database, migrations, seed data, auth API, i18n, and bilingual web/mobile shells. The map, search and vendor tools arrive in M2–M6 ([PLAN.md §8](PLAN.md)).

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
| `customer@demo.test` | Customer | Browsing, favorites, reviews |
| `vendor@demo.test` | Vendor | Owns "Danger Dogs de la Esquina", fully set up |
| `newvendor@demo.test` | Vendor | No business yet, for trying the quick start |
| `admin@demo.test` | Admin | Moderation, reports, invite codes |

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
- **Logs:** no URLs, query strings, coordinates, IPs or emails are written.

The shared package tests check that every English string has a Spanish twin with the same placeholders.

```bash
npm run typecheck
```

## Simulating location and poor connectivity

- **Location (Simulator):** Features → Location → Custom Location…, then enter a point in LA (e.g. 34.0430, -118.2673). The map arrives in M2.
- **Bad signal:** install *Network Link Conditioner* (Xcode → Open Developer Tool → More Developer Tools → "Additional Tools for Xcode") and pick the "Very Bad Network" or "100% Loss" profile. It affects the Simulator too. The vendor app gets a built-in "Simulate no signal" switch in M5.

## Useful commands

| Command | What it does |
|---|---|
| `npm run db:up` / `npm run db:down` | Start / stop Postgres (data is kept in a Docker volume) |
| `npm run db:reset` | Delete the database volume and re-run migrations |
| `npm run db:generate` | Generate a SQL migration after editing `apps/api/src/db/schema.ts` |
| `npm run seed` / `npm run seed:clear` | Load / remove demo data |
| `colima stop` | Stop the Docker VM when you're done |

## Ports

The web app uses **3100** and Metro uses **8090** so they don't collide with other projects on the default 3000/8081. Change them in `apps/web/package.json`, `apps/mobile/package.json` and `CORS_ORIGINS` in `.env`.
