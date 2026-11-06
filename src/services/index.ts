/**
 * DUO BLOCKS — service facade implementing the DbService contract
 * (src/types/services.ts).
 *
 * Every method degrades gracefully when Supabase env vars are missing:
 * single-player local mode resolves to empty/no-op values and NEVER throws
 * uncaught errors. Network failures are caught and logged the same way.
 *
 * playerStore consumes exactly this object plus syncLocalProgress.
 */
import type {
  Challenge,
  DailyRecord,
  DbService,
  DuelMatch,
  LevelProgressRow,
  PlayerProfile,
  PlayerStatsRow,
} from '../types/services';
import { isSupabaseConfigured, ROOM_ID, supabase } from './supabaseClient';
import {
  createDuel as createDuelIn,
  listDuels as listDuelsIn,
  submitDuelResult as submitDuelResultIn,
} from './duel';
import {
  listChallenges as listChallengesIn,
  mapChallengeRow,
  resolveChallenge as resolveChallengeIn,
  sendChallenge as sendChallengeIn,
} from './challenges';
import {
  fetchDailyRecord as fetchDailyRecordIn,
  submitDailyResult as submitDailyResultIn,
} from './daily';
import {
  fetchAchievements as fetchAchievementsIn,
  fetchStats as fetchStatsIn,
  saveEndlessResult as saveEndlessResultIn,
} from './stats';

export { ROOM_ID } from './supabaseClient';

/** Current authenticated user id, or null when signed out / unconfigured. */
async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) return data.session.user.id;
    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Loads a profile row plus its total score, mapped to PlayerProfile. */
async function fetchProfile(uid: string): Promise<PlayerProfile | null> {
  if (!supabase) return null;
  try {
    const { data: p, error: pe } = await supabase
      .from('profiles')
      .select('id, username, avatar, created_at, total_score')
      .eq('id', uid)
      .maybeSingle();
    if (pe || !p) return null;
    const { data: s } = await supabase
      .from('player_stats')
      .select('total_points')
      .eq('player', uid)
      .maybeSingle();
    const name = String(p.username ?? '');
    const avatar = String(p.avatar ?? '');
    return {
      id: String(p.id),
      username: name === 'Yayra' ? 'Yayra' : 'Cyril',
      avatar: avatar === 'yayra' ? 'yayra' : 'cyril',
      created_at: String(p.created_at ?? ''),
      totalScore: Math.max(0, Number(s?.total_points ?? p.total_score ?? 0)) || 0,
    };
  } catch (err) {
    console.warn('[services] fetchProfile error:', err);
    return null;
  }
}

/** The other member of the fixed two-player room. */
async function opponentUid(): Promise<string | null> {
  const uid = await currentUid();
  if (!uid || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('duo_room_members')
      .select('player')
      .eq('room_id', ROOM_ID)
      .neq('player', uid)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return String(data.player);
  } catch {
    return null;
  }
}

export const services: DbService = {
  isConfigured: () => isSupabaseConfigured(),

  // ---------------------------------------------------------------- auth ----
  signIn: async (email, password) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) return null;
      return await fetchProfile(data.user.id);
    } catch (err) {
      console.warn('[services] signIn error:', err);
      return null;
    }
  },

  signOut: async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[services] signOut error:', err);
    }
  },

  currentProfile: async () => {
    const uid = await currentUid();
    return uid ? fetchProfile(uid) : null;
  },

  opponentProfile: async () => {
    const uid = await opponentUid();
    return uid ? fetchProfile(uid) : null;
  },

  // ------------------------------------------------------------ progress ----
  saveLevelProgress: async (levelId, stars, score) => {
    if (!supabase) return;
    try {
      const uid = await currentUid();
      if (!uid) return;
      const stars3 = Math.max(0, Math.min(3, Math.round(stars))) as 0 | 1 | 2 | 3;
      const best = Math.max(0, Math.floor(score));
      const { data: existing } = await supabase
        .from('level_progress')
        .select('stars, best_score, attempts, completed_at')
        .eq('player', uid)
        .eq('level_id', levelId)
        .maybeSingle();
      // max-merge: a retry with a worse result never lowers the stored best
      const { error } = await supabase.from('level_progress').upsert(
        {
          player: uid,
          level_id: levelId,
          stars: Math.max(stars3, existing?.stars ?? 0),
          best_score: Math.max(best, existing?.best_score ?? 0),
          attempts: (existing?.attempts ?? 0) + 1,
          completed_at: existing?.completed_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player,level_id' },
      );
      if (error) console.warn('[services] saveLevelProgress failed:', error.message);
    } catch (err) {
      console.warn('[services] saveLevelProgress error:', err);
    }
  },

  fetchLevelProgress: async (): Promise<LevelProgressRow[]> => {
    if (!supabase) return [];
    try {
      const uid = await currentUid();
      if (!uid) return [];
      const { data, error } = await supabase
        .from('level_progress')
        .select('*')
        .eq('player', uid);
      if (error) throw error;
      return (data ?? []) as LevelProgressRow[];
    } catch (err) {
      console.warn('[services] fetchLevelProgress error:', err);
      return [];
    }
  },

  saveEndlessResult: async (score) => {
    const uid = await currentUid();
    if (!uid) return;
    await saveEndlessResultIn(uid, score);
  },

  // ---------------------------------------------------------------- duels ----
  createDuel: async (levelId, seed) => {
    const [uid, opp] = await Promise.all([currentUid(), opponentUid()]);
    if (!uid || !opp) return null;
    return createDuelIn(levelId, seed, uid, opp);
  },

  listDuels: async (): Promise<DuelMatch[]> => {
    const uid = await currentUid();
    return uid ? listDuelsIn(uid) : [];
  },

  submitDuelResult: async (matchId, result) => {
    await submitDuelResultIn(matchId, result);
  },

  // ----------------------------------------------------------- challenges ----
  sendChallenge: async (recipientUid, levelId, seed) => {
    const uid = await currentUid();
    if (!uid) return null;
    return sendChallengeIn(uid, recipientUid, levelId, seed);
  },

  listChallenges: async (): Promise<Challenge[]> => {
    const uid = await currentUid();
    return uid ? listChallengesIn(uid) : [];
  },

  resolveChallenge: async (challengeId, action) => {
    await resolveChallengeIn(challengeId, action);
  },

  // ---------------------------------------------------------------- daily ----
  submitDailyResult: async (score) => {
    await submitDailyResultIn(score);
  },

  fetchDailyRecord: async (date): Promise<DailyRecord | null> =>
    fetchDailyRecordIn(date),

  // ------------------------------------------------------ stats / unlocks ----
  fetchStats: async (): Promise<PlayerStatsRow[]> => {
    const uid = await currentUid();
    return uid ? fetchStatsIn(uid) : [];
  },

  fetchAchievements: async (): Promise<string[]> => {
    const uid = await currentUid();
    return uid ? fetchAchievementsIn(uid) : [];
  },

  // ------------------------------------------------------------- realtime ----
  subscribeMatchEvents: (cb) => {
    if (!supabase) return () => {};
    try {
      const client = supabase;
      const channel = client.channel(`room:${ROOM_ID}:matches`).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        (payload) => {
          try {
            const row = ((payload as { new?: unknown }).new ?? {}) as Record<string, unknown>;
            cb({
              type: String(payload.eventType).toLowerCase(),
              match_id: row.id == null ? undefined : String(row.id),
              by: row.created_by == null ? undefined : String(row.created_by),
            });
          } catch (err) {
            console.warn('[services] match event handler error:', err);
          }
        },
      );
      channel.subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  },

  subscribePresence: (cb) => {
    if (!supabase) return () => {};
    try {
      const client = supabase;
      const channel = client.channel(`room:${ROOM_ID}:presence`);
      channel
        .on('presence', { event: 'sync' }, () => {
          try {
            const state = channel.presenceState() as unknown as Record<string, unknown[]>;
            const online = Object.values(state)
              .flat()
              .map((p) =>
                p && typeof p === 'object' && 'uid' in p ? String((p as { uid: unknown }).uid) : '',
              )
              .filter((u) => u.length > 0);
            cb(Array.from(new Set(online)));
          } catch (err) {
            console.warn('[services] presence handler error:', err);
          }
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return;
          try {
            const uid = await currentUid();
            if (uid) await channel.track({ uid, online_at: new Date().toISOString() });
          } catch (err) {
            console.warn('[services] presence track error:', err);
          }
        });
      return () => {
        void client.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  },

  subscribeChallenges: (cb) => {
    if (!supabase) return () => {};
    try {
      const client = supabase;
      const channel = client.channel(`room:${ROOM_ID}:challenges`).on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'challenges' },
        (payload) => {
          try {
            const row = (payload as { new?: unknown }).new;
            if (row && typeof row === 'object') {
              cb(mapChallengeRow(row as Record<string, unknown>));
            }
          } catch (err) {
            console.warn('[services] challenge event handler error:', err);
          }
        },
      );
      channel.subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  },
};
