-- =============================================================================
-- DUO BLOCKS — 0001_init.sql
-- Complete, IDEMPOTENT schema migration. Safe to re-run: every statement is
-- IF NOT EXISTS / OR REPLACE / DROP-IF-EXISTS-then-CREATE, and the whole body
-- is guarded by a single transaction (BEGIN … EXCEPTION … COMMIT) so a failure
-- rolls back atomically instead of leaving a half-applied schema.
--
-- Contents
--   1. Extensions
--   2. Tables (+ indexes)
--   3. Row Level Security enablement
--   4. RLS policies (owner-only for personal data, participant-only for duels)
--   5. Functions & triggers (profile auto-create, match finalisation, stats)
--   6. Server-validated RPC submit_duel_result
--   7. Privileges + realtime publication
-- =============================================================================

BEGIN;

DO $migration$
BEGIN

-- prevent citext from resolving to a colliding object in a broken search_path
PERFORM set_config('search_path', 'public, extensions', false);

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
DO $ext$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    -- Supabase convention: user-installed extensions live in `extensions`
    CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS citext;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'citext extension unavailable (%); falling back is not supported', SQLERRM;
  RAISE;
END $ext$;

DO $pc$
BEGIN
  -- gen_random_uuid() is built-in on PG13+; only pull in pgcrypto if missing
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto unavailable: %', SQLERRM;
END $pc$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- Player identity. Rows are created automatically by the handle_new_user
-- trigger when a user signs up in Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username    citext UNIQUE NOT NULL,
  avatar      text,
  total_score integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The fixed two-player room (single row seeded from the dashboard / SQL editor).
CREATE TABLE IF NOT EXISTS public.duo_rooms (
  id text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.duo_room_members (
  room_id text   NOT NULL REFERENCES public.duo_rooms (id) ON DELETE CASCADE,
  player  uuid   NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role    text   NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duo_room_members_room_player_key UNIQUE (room_id, player)
);

-- Campaign progress (player + level). Upserts only ever raise stars/best_score.
CREATE TABLE IF NOT EXISTS public.level_progress (
  player       uuid  NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  level_id     text  NOT NULL,
  stars        smallint NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  best_score   integer  NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  attempts     integer  NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  completed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT level_progress_pkey PRIMARY KEY (player, level_id)
);

-- Aggregate stats. Maintained by DB triggers (match finalisation) — clients
-- only read this table and update endless_best via stats.ts.
CREATE TABLE IF NOT EXISTS public.player_stats (
  player              uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  total_points        integer NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  highest_score       integer NOT NULL DEFAULT 0 CHECK (highest_score >= 0),
  wins                integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses              integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws               integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  total_matches       integer NOT NULL DEFAULT 0 CHECK (total_matches >= 0),
  levels_completed    integer NOT NULL DEFAULT 0 CHECK (levels_completed >= 0),
  daily_wins          integer NOT NULL DEFAULT 0 CHECK (daily_wins >= 0),
  daily_current_streak integer NOT NULL DEFAULT 0 CHECK (daily_current_streak >= 0),
  daily_best_streak   integer NOT NULL DEFAULT 0 CHECK (daily_best_streak >= 0),
  win_streak          integer NOT NULL DEFAULT 0 CHECK (win_streak >= 0),
  longest_win_streak  integer NOT NULL DEFAULT 0 CHECK (longest_win_streak >= 0),
  endless_best        integer NOT NULL DEFAULT 0 CHECK (endless_best >= 0),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Duels between the two room members.
CREATE TABLE IF NOT EXISTS public.matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  opponent        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  level_id        text NOT NULL,
  seed            bigint NOT NULL,
  scoring_version integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
  winner          uuid REFERENCES auth.users (id) ON DELETE SET NULL, -- NULL = draw/unfinished
  -- internal guard so per-match stats increments apply exactly once:
  stats_applied   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  CONSTRAINT matches_players_differ CHECK (created_by <> opponent)
);

CREATE TABLE IF NOT EXISTS public.match_results (
  match_id      uuid NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  player        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  score         integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  lines_cleared integer NOT NULL DEFAULT 0 CHECK (lines_cleared >= 0),
  blocks_placed integer NOT NULL DEFAULT 0 CHECK (blocks_placed >= 0),
  combo         integer NOT NULL DEFAULT 0 CHECK (combo >= 0),
  moves         integer NOT NULL DEFAULT 0 CHECK (moves >= 0),
  move_history  jsonb,
  result_verdict text NOT NULL DEFAULT 'pending'
                 CHECK (result_verdict IN ('pending', 'win', 'loss', 'draw', 'invalid')),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_results_pkey PRIMARY KEY (match_id, player)
);

CREATE TABLE IF NOT EXISTS public.challenges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  level_id   text NOT NULL,
  seed       bigint NOT NULL,
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'played_by_sender',
                               'played_by_recipient', 'complete', 'expired')),
  expires_at timestamptz NOT NULL,
  winner     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenges_players_differ CHECK (sender <> recipient)
);

CREATE TABLE IF NOT EXISTS public.daily_results (
  date         date NOT NULL,
  player       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  score        integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  attempts     integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  completed_at timestamptz,
  CONSTRAINT daily_results_pkey PRIMARY KEY (date, player)
);

CREATE TABLE IF NOT EXISTS public.achievements (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  description text,
  icon        text
);

CREATE TABLE IF NOT EXISTS public.player_achievements (
  player         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES public.achievements (id) ON DELETE CASCADE,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_achievements_pkey PRIMARY KEY (player, achievement_id)
);

-- Lookup indexes for the access patterns used by the service layer.
CREATE INDEX IF NOT EXISTS matches_created_by_idx ON public.matches (created_by);
CREATE INDEX IF NOT EXISTS matches_opponent_idx   ON public.matches (opponent);
CREATE INDEX IF NOT EXISTS challenges_sender_idx    ON public.challenges (sender);
CREATE INDEX IF NOT EXISTS challenges_recipient_idx ON public.challenges (recipient);
CREATE INDEX IF NOT EXISTS challenges_expires_idx   ON public.challenges (expires_at);
CREATE INDEX IF NOT EXISTS level_progress_player_updated_idx
  ON public.level_progress (player, updated_at);
CREATE INDEX IF NOT EXISTS daily_results_date_idx ON public.daily_results (date);
CREATE INDEX IF NOT EXISTS player_achievements_achievement_idx
  ON public.player_achievements (achievement_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — enable on EVERY table
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duo_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duo_room_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a member of the fixed room? (security definer so the
-- check works before any table policy grants the read)
CREATE OR REPLACE FUNCTION public.is_room_member(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.duo_room_members m
    WHERE m.room_id = 'cyril-yayra-001'
      AND m.player = COALESCE(p_uid, auth.uid())
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 4. RLS policies (drop-then-create keeps the migration re-runnable)
-- ---------------------------------------------------------------------------

-- profiles: room members can read each other; a player updates only their own row.
DROP POLICY IF EXISTS profiles_select_room ON public.profiles;
CREATE POLICY profiles_select_room ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_room_member(auth.uid()));

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- duo_rooms / duo_room_members: readable by members; inserts happen from the
-- dashboard/SQL editor (runs as postgres, which bypasses RLS).
DROP POLICY IF EXISTS duo_rooms_select_members ON public.duo_rooms;
CREATE POLICY duo_rooms_select_members ON public.duo_rooms
  FOR SELECT TO authenticated
  USING (public.is_room_member(auth.uid()));

DROP POLICY IF EXISTS duo_room_members_select ON public.duo_room_members;
CREATE POLICY duo_room_members_select ON public.duo_room_members
  FOR SELECT TO authenticated
  USING (player = auth.uid() OR public.is_room_member(auth.uid()));

-- level_progress: strictly owner-only.
DROP POLICY IF EXISTS level_progress_select_own ON public.level_progress;
CREATE POLICY level_progress_select_own ON public.level_progress
  FOR SELECT TO authenticated USING (player = auth.uid());

DROP POLICY IF EXISTS level_progress_insert_own ON public.level_progress;
CREATE POLICY level_progress_insert_own ON public.level_progress
  FOR INSERT TO authenticated WITH CHECK (player = auth.uid());

DROP POLICY IF EXISTS level_progress_update_own ON public.level_progress;
CREATE POLICY level_progress_update_own ON public.level_progress
  FOR UPDATE TO authenticated
  USING (player = auth.uid()) WITH CHECK (player = auth.uid());

-- player_stats: owner-only writes (triggers maintain it with elevated privileges),
-- but ROOM MEMBERS may read each other's row — required for the head-to-head
-- leaderboard (only the two authorised players are in this room).
DROP POLICY IF EXISTS player_stats_select_own ON public.player_stats;
CREATE POLICY player_stats_select_own ON public.player_stats
  FOR SELECT TO authenticated
  USING (player = auth.uid() OR public.is_room_member(auth.uid()));

DROP POLICY IF EXISTS player_stats_insert_own ON public.player_stats;
CREATE POLICY player_stats_insert_own ON public.player_stats
  FOR INSERT TO authenticated WITH CHECK (player = auth.uid());

DROP POLICY IF EXISTS player_stats_update_own ON public.player_stats;
CREATE POLICY player_stats_update_own ON public.player_stats
  FOR UPDATE TO authenticated
  USING (player = auth.uid()) WITH CHECK (player = auth.uid());

-- matches: participants only; the creator inserts; either side may update status.
DROP POLICY IF EXISTS matches_select_participants ON public.matches;
CREATE POLICY matches_select_participants ON public.matches
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR opponent = auth.uid());

DROP POLICY IF EXISTS matches_insert_creator ON public.matches;
CREATE POLICY matches_insert_creator ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS matches_update_participants ON public.matches;
CREATE POLICY matches_update_participants ON public.matches
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR opponent = auth.uid())
  WITH CHECK (created_by = auth.uid() OR opponent = auth.uid());

-- match_results: own rows only for direct writes; reads also allowed for the
-- opponent of the match (needed to show head-to-head results).
DROP POLICY IF EXISTS match_results_select_visible ON public.match_results;
CREATE POLICY match_results_select_visible ON public.match_results
  FOR SELECT TO authenticated
  USING (
    player = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_results.match_id
        AND (m.created_by = auth.uid() OR m.opponent = auth.uid())
    )
  );

DROP POLICY IF EXISTS match_results_insert_own ON public.match_results;
CREATE POLICY match_results_insert_own ON public.match_results
  FOR INSERT TO authenticated WITH CHECK (player = auth.uid());

DROP POLICY IF EXISTS match_results_update_own ON public.match_results;
CREATE POLICY match_results_update_own ON public.match_results
  FOR UPDATE TO authenticated
  USING (player = auth.uid()) WITH CHECK (player = auth.uid());

-- challenges: the two participants only; sender inserts, recipient accepts.
DROP POLICY IF EXISTS challenges_select_participants ON public.challenges;
CREATE POLICY challenges_select_participants ON public.challenges
  FOR SELECT TO authenticated
  USING (sender = auth.uid() OR recipient = auth.uid());

DROP POLICY IF EXISTS challenges_insert_sender ON public.challenges;
CREATE POLICY challenges_insert_sender ON public.challenges
  FOR INSERT TO authenticated WITH CHECK (sender = auth.uid());

DROP POLICY IF EXISTS challenges_update_participants ON public.challenges;
CREATE POLICY challenges_update_participants ON public.challenges
  FOR UPDATE TO authenticated
  USING (sender = auth.uid() OR recipient = auth.uid())
  WITH CHECK (sender = auth.uid() OR recipient = auth.uid());

-- daily_results: strictly owner-only.
DROP POLICY IF EXISTS daily_results_select_own ON public.daily_results;
CREATE POLICY daily_results_select_own ON public.daily_results
  FOR SELECT TO authenticated USING (player = auth.uid());

DROP POLICY IF EXISTS daily_results_insert_own ON public.daily_results;
CREATE POLICY daily_results_insert_own ON public.daily_results
  FOR INSERT TO authenticated WITH CHECK (player = auth.uid());

DROP POLICY IF EXISTS daily_results_update_own ON public.daily_results;
CREATE POLICY daily_results_update_own ON public.daily_results
  FOR UPDATE TO authenticated
  USING (player = auth.uid()) WITH CHECK (player = auth.uid());

-- achievements catalogue: every authenticated player can read, nobody writes
-- from the client (rows are seeded from the dashboard).
DROP POLICY IF EXISTS achievements_select_authenticated ON public.achievements;
CREATE POLICY achievements_select_authenticated ON public.achievements
  FOR SELECT TO authenticated USING (true);

-- player_achievements: owner-only.
DROP POLICY IF EXISTS player_achievements_select_own ON public.player_achievements;
CREATE POLICY player_achievements_select_own ON public.player_achievements
  FOR SELECT TO authenticated USING (player = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Functions & triggers
-- ---------------------------------------------------------------------------

-- Auto-create a profile + zeroed stats row for every new auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_username text;
BEGIN
  v_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    split_part(COALESCE(NEW.email, 'player'), '@', 1)
  );
  -- keep username unique even if the metadata collides with an existing player
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := v_username || '-' || left(NEW.id::text, 4);
  END IF;

  INSERT INTO public.profiles (id, username, avatar)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'avatar', ''),
             lower(split_part(COALESCE(NEW.email, 'player'), '@', 1)))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.player_stats (player) VALUES (NEW.id)
  ON CONFLICT (player) DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Applies per-match stat deltas for BOTH participants. Called only from the
-- finalisation trigger behind the stats_applied guard → idempotent per match.
CREATE OR REPLACE FUNCTION public.apply_match_stats(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  m public.matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.player_stats AS ps
    (player, total_points, highest_score,
     wins, losses, draws, total_matches,
     win_streak, longest_win_streak)
  SELECT r.player,
         r.score,
         r.score,
         CASE WHEN m.winner IS NOT NULL AND m.winner = r.player THEN 1 ELSE 0 END,
         CASE WHEN m.winner IS NOT NULL AND m.winner <> r.player THEN 1 ELSE 0 END,
         CASE WHEN m.winner IS NULL THEN 1 ELSE 0 END,
         1,
         CASE WHEN m.winner IS NOT NULL AND m.winner = r.player THEN 1 ELSE 0 END,
         CASE WHEN m.winner IS NOT NULL AND m.winner = r.player THEN 1 ELSE 0 END
  FROM public.match_results r
  WHERE r.match_id = p_match_id
  ON CONFLICT (player) DO UPDATE SET
    total_points       = ps.total_points + EXCLUDED.total_points,
    highest_score      = GREATEST(ps.highest_score, EXCLUDED.highest_score),
    wins               = ps.wins + EXCLUDED.wins,
    losses             = ps.losses + EXCLUDED.losses,
    draws              = ps.draws + EXCLUDED.draws,
    total_matches      = ps.total_matches + 1,
    win_streak         = CASE WHEN EXCLUDED.wins = 1   THEN ps.win_streak + 1
                              WHEN EXCLUDED.losses = 1 THEN 0
                              ELSE ps.win_streak END, -- draw: streak unchanged
    longest_win_streak = GREATEST(ps.longest_win_streak,
                                  CASE WHEN EXCLUDED.wins = 1 THEN ps.win_streak + 1
                                       ELSE 0 END),
    updated_at         = now();
END;
$fn$;

-- Finalises a match once both participants have a match_results row:
-- winner = higher score (equal → draw/NULL), verdicts recomputed, and the
-- per-match stats delta applied exactly once (stats_applied guard).
CREATE OR REPLACE FUNCTION public.maybe_finalize_match()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  m        public.matches%ROWTYPE;
  a        record;
  b        record;
  v_winner uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO a FROM public.match_results
   WHERE match_id = NEW.match_id AND player = m.created_by;
  SELECT * INTO b FROM public.match_results
   WHERE match_id = NEW.match_id AND player = m.opponent;
  IF a.player IS NULL OR b.player IS NULL THEN
    RETURN NEW; -- one side still pending; verdict stays 'pending'
  END IF;

  v_winner := CASE
    WHEN a.score > b.score THEN m.created_by
    WHEN b.score > a.score THEN m.opponent
    ELSE NULL END; -- equal scores → draw

  UPDATE public.match_results
     SET result_verdict = CASE
       WHEN result_verdict = 'invalid' THEN 'invalid'
       WHEN v_winner IS NULL THEN 'draw'
       WHEN player = v_winner THEN 'win'
       ELSE 'loss' END
   WHERE match_id = NEW.match_id;

  UPDATE public.matches
     SET winner = v_winner,
         status = 'finished',
         finished_at = COALESCE(finished_at, now())
   WHERE id = m.id;

  IF NOT m.stats_applied THEN
    UPDATE public.matches SET stats_applied = true WHERE id = m.id;
    PERFORM public.apply_match_stats(m.id);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_match_results_finalize ON public.match_results;
CREATE TRIGGER trg_match_results_finalize
  AFTER INSERT OR UPDATE OF score ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION public.maybe_finalize_match();

-- ---------------------------------------------------------------------------
-- 6. Server-validated RPC: submit_duel_result
--    Verifies the caller is a participant and the match is active, sanity-
--    checks the score, upserts idempotently (a lower/equal re-submission is
--    ignored), computes the verdict and lets the finalisation trigger
--    maintain player_stats.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_duel_result(
  p_match_id uuid,
  p_score    integer,
  p_lines    integer,
  p_blocks   integer,
  p_combo    integer,
  p_moves    integer,
  p_history  jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_match    public.matches%ROWTYPE;
  v_other    record;
  v_existing record;
  v_verdict  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_score IS NULL OR p_lines IS NULL OR p_blocks IS NULL
     OR p_combo IS NULL OR p_moves IS NULL
     OR p_score < 0 OR p_lines < 0 OR p_blocks < 0 OR p_combo < 0 OR p_moves < 0 THEN
    RAISE EXCEPTION 'invalid result: negative or missing values';
  END IF;
  IF p_blocks > 100000 OR p_lines > 100000 OR p_score > 100000000 THEN
    RAISE EXCEPTION 'invalid result: implausible magnitude';
  END IF;
  -- scoring v1: every placed cell is worth 10 points, so any claimed score
  -- below 10 points with blocks placed is impossible.
  IF p_blocks > 0 AND p_score < 10 THEN
    RAISE EXCEPTION 'invalid result: score below minimum cell points (scoring v1)';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match % not found', p_match_id;
  END IF;
  IF v_match.created_by <> v_uid AND v_match.opponent <> v_uid THEN
    RAISE EXCEPTION 'not a participant of match %', p_match_id;
  END IF;
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match % is not active (status=%)', p_match_id, v_match.status;
  END IF;

  -- idempotent submission: keep the best attempt, ignore lower/equal re-sends
  SELECT * INTO v_existing FROM public.match_results
   WHERE match_id = p_match_id AND player = v_uid;
  IF FOUND AND p_score <= v_existing.score THEN
    RETURN;
  END IF;

  SELECT * INTO v_other FROM public.match_results
   WHERE match_id = p_match_id
     AND player = (CASE WHEN v_match.created_by = v_uid
                        THEN v_match.opponent ELSE v_match.created_by END);

  v_verdict := CASE
    WHEN NOT FOUND THEN 'pending'
    WHEN p_score > v_other.score THEN 'win'
    WHEN p_score < v_other.score THEN 'loss'
    ELSE 'draw' END;

  INSERT INTO public.match_results
    (match_id, player, score, lines_cleared, blocks_placed, combo, moves,
     move_history, result_verdict)
  VALUES
    (p_match_id, v_uid, p_score, p_lines, p_blocks, p_combo, p_moves,
     p_history, v_verdict)
  ON CONFLICT (match_id, player) DO UPDATE SET
    score          = EXCLUDED.score,
    lines_cleared  = EXCLUDED.lines_cleared,
    blocks_placed  = EXCLUDED.blocks_placed,
    combo          = EXCLUDED.combo,
    moves          = EXCLUDED.moves,
    move_history   = EXCLUDED.move_history,
    result_verdict = EXCLUDED.result_verdict,
    submitted_at   = now();
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Privileges + realtime publication
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
-- the frontend is fully anonymous-hostile: RLS exposes nothing to anon anyway
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE EXECUTE ON FUNCTION public.submit_duel_result(uuid, integer, integer, integer, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_duel_result(uuid, integer, integer, integer, integer, integer, jsonb) TO authenticated;
-- internal helpers are trigger/service-callable only
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_finalize_match() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_match_stats(uuid) FROM PUBLIC, anon, authenticated;
-- is_room_member IS evaluated inside RLS policies as the invoking user, so it
-- must stay executable by authenticated roles
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid) TO authenticated;

-- Stream matches / challenges / player_stats over the supabase_realtime
-- publication so the service layer's postgres_changes subscriptions work.
DO $rt$
DECLARE
  t text;
  has_pub boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    INTO has_pub;
  IF NOT has_pub THEN
    RAISE NOTICE 'supabase_realtime publication not found — enable Realtime for this project in the dashboard';
  ELSE
    FOREACH t IN ARRAY ARRAY['matches', 'challenges', 'player_stats'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END;
$rt$;

EXCEPTION
  WHEN OTHERS THEN
    -- Transactional guard: re-raise so a genuinely broken migration rolls the
    -- whole script back instead of reporting success. Idempotent statements
    -- above mean this branch only fires on real errors, never on re-runs.
    RAISE;

END;
$migration$;

COMMIT;
