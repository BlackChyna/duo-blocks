# DUO BLOCKS — Supabase Setup (step by step)

This guide gets the online features (cloud progress sync, duels, challenges,
daily challenge, stats) working. **No coding experience needed** — everything
here is clicking in a web dashboard and copy-pasting.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and click **Start your project** (sign up free).
2. Click **New project**.
   - **Name:** `duo-blocks`
   - **Database Password:** pick a strong password and save it somewhere safe
     (you rarely need it, but you will if you ever connect tools directly).
   - **Region:** choose the one closest to you (e.g. `eu-west` works well for Ghana/Europe).
3. Wait ~2 minutes for the project to finish creating.

## 2. Copy the URL and anon key into `.env`

1. In the Supabase dashboard open **Settings → API** (Project Settings → API Keys on newer dashboards).
2. Copy the **Project URL** — it looks like `https://abcd1234.supabase.co`.
3. Copy the **anon / publishable key** — a long string starting with `eyJ...`.
4. In the `duo-blocks` folder on your computer, create a file named `.env`
   (copy `.env.example` if you like) and fill in:

   ```ini
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...long-key...
   ```

> ⚠️ **Never commit `.env` to git.** It is listed in `.gitignore` — leave it
> that way. The anon key is *designed* to be public in the app (every row is
> protected by Row Level Security — see the bottom of this page), but the
> `service_role` key shown on the same page must **never** go into the app.

## 3. Run the database migration

1. In the dashboard sidebar open **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/migrations/0001_init.sql` from the project folder,
   **select all of it, copy, and paste** into the SQL editor.
4. Click **Run**. It should finish in a few seconds with "Success".
5. Run it again (same contents, click Run once more) — it is **idempotent**,
   so running twice proves nothing broke. You should still get "Success".

What this created: tables for profiles, the duo room, level progress, player
stats, duels (`matches`), `match_results`, `challenges`, `daily_results`,
achievements — plus Row Level Security policies, triggers that auto-create
profiles and finalise duels, and the validated `submit_duel_result` function.

## 4. Create the two player accounts

1. Open **Authentication → Sign In / Providers** and make sure **Email** is enabled.
2. While there, turn **OFF** "Confirm email" (this is a private two-player app;
   it lets the players sign in immediately with their passwords).
3. Open **Authentication → Users → Add user → Create new user**:
   - Email: `cyril@duoblocks.app`, set the password Cyril chose. ✅ Auto Confirm User.
   - Add another: `yayra@duoblocks.app`, set the password Yayra chose. ✅ Auto Confirm User.

Profiles are created automatically for these users (a database trigger copies
the email prefix into the username).

## 5. Create the shared duo room

Open **SQL Editor → New query**, paste this, and **Run**:

```sql
INSERT INTO public.duo_rooms (id)
VALUES ('cyril-yayra-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.duo_room_members (room_id, player, role)
SELECT 'cyril-yayra-001', u.id,
       CASE WHEN u.email = 'cyril@duoblocks.app' THEN 'host' ELSE 'guest' END
FROM auth.users u
WHERE u.email IN ('cyril@duoblocks.app', 'yayra@duoblocks.app')
ON CONFLICT (room_id, player) DO NOTHING;

-- (optional) make the usernames exactly 'Cyril' and 'Yayra' with the right avatars
UPDATE public.profiles SET username = 'Cyril', avatar = 'cyril'
WHERE id = (SELECT id FROM auth.users WHERE email = 'cyril@duoblocks.app');

UPDATE public.profiles SET username = 'Yayra', avatar = 'yayra'
WHERE id = (SELECT id FROM auth.users WHERE email = 'yayra@duoblocks.app');
```

## 6. Run the game locally

```bash
npm install
npm run dev
```

Open the printed address (usually <http://localhost:5173>) on each player's
device, sign in as Cyril / Yayra, and play. The app works offline too — progress
is stored on-device and synced when a connection is available.

## 7. Deployment note

When you publish the site (e.g. GitHub Pages, Vercel, Netlify), add the two
environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the
hosting dashboard's settings — do **not** put them in the code. Same values as
your local `.env`.

---

## Why the data is safe (Row Level Security)

Every table has **Row Level Security (RLS)** enabled — the database itself
enforces who may read or write each row, no matter what the app (or a hacker
with the anon key) tries:

- Personal tables (`level_progress`, `player_stats`, `daily_results`,
  `player_achievements`) can only ever be read/written by their owner.
- Duels, results and challenges are visible **only to the two participants**.
- The room member list is readable only by room members.
- Result submission goes through a server-side function that checks the score
  is plausible — a modified client cannot inject impossible results.

So the anon key in the browser is safe to expose: without logging in as one of
the two players, an outsider sees **zero rows**.
