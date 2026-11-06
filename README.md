# DUO BLOCKS

**TWO MINDS. ONE PUZZLE BATTLEFIELD.**

A private two-player online block puzzle game built for **Cyril** and **Yayra** —
500 campaign levels, cross-device duels, daily challenges, endless mode, and a
shared leaderboard. Installable on Android and iPhone as a PWA.

Live: `https://blackchyna.github.io/duo-blocks/` *(active after the first Actions run)*

---

## Quick start (local)

```bash
npm install
npm run dev          # http://localhost:5173
```

Runs in **local mode** (all progress stored on-device via IndexedDB) until
Supabase is wired up. Everything solo — campaign, endless, daily — works in
local mode already.

## Connect Supabase (enables multiplayer, synced progress, leaderboard)

1. Create a project at https://supabase.com (free tier is enough).
2. Copy `.env.example` → `.env` and paste your **Project URL** and **anon
   (publishable) key** from Dashboard → Settings → API. Never commit `.env`.
3. Open Dashboard → SQL Editor and paste the whole of
   `supabase/migrations/0001_init.sql`, then run it. This creates the schema,
   Row Level Security policies, triggers and the server-side duel validator.
4. Dashboard → Authentication → Providers → Email: enable.
5. Create the two players (Dashboard → Authentication → Add user):
   - `cyril@duoblocks.app` (Cyril chooses a password)
   - `yayra@duoblocks.app` (Yayra chooses a password)
6. Walk the `%supabase%` SQL snippets at the bottom of
   `docs/SUPABASE-SETUP.md` for the room setup.
7. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **GitHub repo
   secrets** (Settings → Secrets → Actions) so deploys build with the keys.

Full walkthrough including phone installation (Android + iPhone):
**docs/SUPABASE-SETUP.md**.

## Install on your phone

- **Android (Chrome):** open the live URL → menu ⋮ → *Install app / Add to
  Home screen*.
- **iPhone (Safari):** open the live URL → Share → *Add to Home Screen* →
  confirm. Opens standalone, no browser UI.

## Adding new levels later (501+)

1. Open `scripts/generate-levels.mjs`, extend the `RANGES` array with a new
   range (e.g. `{ from: 501, to: 600, chapterThemes: [...] }`) — or hand-write
   new entries appended to `src/data/levels/levels.json`.
2. Run `node scripts/generate-levels.mjs && node scripts/validate-levels.mjs`.
3. Commit. Existing level IDs (`L0001`–`L0500`) are permanent — the validator
   refuses to renumber or delete them, and player progress rows in Supabase
   reference those IDs directly.

## Architecture

```
src/
  types/          contracts (game, services) — single source of truth
  features/game/  pure TS engine (board, shapes, scoring, PRNG) + board UI
  data/levels/    500-level JSON catalogue (generated, validated)
  pages/          auth, home, campaign, game, leaderboard, profile, duel…
  services/       Supabase client + IndexedDB local-first persistence
  store/          Zustand: app router, game session, player/progress
  pwa/            service-worker registration + update toast
supabase/         migrations (schema + RLS + duel validation RPC)
public/           manifest.json, sw.js, icons/
tests/            vitest engine/levels/UI tests
scripts/          level generator + validator
```

### Progress safety (the non-negotiables)

- GitHub stores **code only**; Supabase stores **player data**. Deploys never
  touch the database.
- Level IDs are permanent; the catalogue is additively extended.
- Results for competitive modes are validated server-side
  (`submit_duel_result` RPC) — the browser never decides the official winner.
- Local IndexedDB caches progress and reconciles with Supabase when
  connectivity returns; writes are idempotent upserts.
- Personal bests are only ever raised, never overwritten downward.

## Testing

```bash
npm run test            # vitest: engine determinism, scoring, level validity
node scripts/validate-levels.mjs   # structural + distribution validation
npm run build && npm run preview   # production smoke test
```

CI (`.github/workflows/deploy.yml`) runs typecheck + unit tests + level
validation on every push to `main` before deploying to GitHub Pages.
