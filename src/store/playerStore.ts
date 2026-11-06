import { create } from 'zustand';
import type { GameMode, PlayerLocalProgress } from '../types/game';
import type { PlayerProfile, PlayerStatsRow } from '../types/services';
import { services } from '../services';
import { syncLocalProgress } from '../services/localProgress';

export interface ResultInput {
  mode: GameMode;
  levelId: string | null;
  stars: 0 | 1 | 2 | 3;
  score: number;
  lines: number;
  blocks: number;
  combo: number;
  matched: boolean; // competitive (duel/daily/challenge) result — validated server-side
  matchId?: string;
  challengeId?: string;
}

interface PlayerStoreState {
  profile: PlayerProfile | null;
  opponent: PlayerProfile | null;
  progress: PlayerLocalProgress;
  stats: PlayerStatsRow[];
  achievements: string[];
  configured: boolean; // supabase configured?
  hydrate: () => Promise<void>;
  signIn: (username: 'Cyril' | 'Yayra', password: string) => Promise<PlayerProfile | null>;
  signOut: () => Promise<void>;
  recordResult: (r: ResultInput) => Promise<void>;
  refreshStats: () => Promise<void>;
}

/** Merges a finished game into local progress; used in every mode. */
export function mergeLocalResult(progress: PlayerLocalProgress, r: ResultInput): PlayerLocalProgress {
  const next: PlayerLocalProgress = JSON.parse(JSON.stringify(progress));
  next.highestScore = Math.max(next.highestScore, r.score);
  if (r.mode === 'campaign' && r.levelId) {
    const cur = next.levels[r.levelId];
    next.levels[r.levelId] = {
      completedAt: cur?.completedAt ?? new Date().toISOString(),
      stars: Math.max(cur?.stars ?? 0, r.stars) as 0 | 1 | 2 | 3,
      bestScore: Math.max(cur?.bestScore ?? 0, r.score),
    };
  }
  if (r.mode === 'endless') {
    next.endless = {
      best: Math.max(next.endless.best, r.score),
      blocksPlaced: next.endless.blocksPlaced + r.blocks,
      linesCleared: next.endless.linesCleared + r.lines,
      longestCombo: Math.max(next.endless.longestCombo, r.combo),
      games: next.endless.games + 1,
    };
  }
  next.stats.totalBlocks += r.blocks;
  next.stats.totalLines += r.lines;
  next.lastSavedAt = new Date().toISOString();
  return next;
}

/** Single store for identity + progress. All DB writes go through services. */
export const usePlayerStore = create<PlayerStoreState>((set) => ({
  profile: null,
  opponent: null,
  progress: syncLocalProgress.empty(),
  stats: [],
  achievements: [],
  configured: services.isConfigured(),

  hydrate: async () => {
    set({ configured: services.isConfigured() });
    const local = await syncLocalProgress.load();
    set({ progress: local });
    if (!services.isConfigured()) return;
    const profile = await services.currentProfile();
    if (profile) {
      const [opponent, stats, achievements] = await Promise.all([
        services.opponentProfile(),
        services.fetchStats(),
        services.fetchAchievements(),
      ]);
      set({ profile, opponent, stats, achievements });
      const remote = await services.fetchLevelProgress();
      const merged = syncLocalProgress.mergeRemote(local, remote);
      set({ progress: merged });
      await syncLocalProgress.save(merged);
    } else {
      set({ profile: null });
    }
  },

  signIn: async (username, password) => {
    if (!services.isConfigured()) {
      // Local-only mode: provisional identity so the game is fully playable solo.
      const provisional: PlayerProfile = {
        id: `local:${username.toLowerCase()}`,
        username,
        avatar: username === 'Cyril' ? 'cyril' : 'yayra',
        created_at: new Date().toISOString(),
        totalScore: 0,
      };
      set({ profile: provisional });
      return provisional;
    }
    const email = username === 'Cyril' ? 'cyril@duoblocks.app' : 'yayra@duoblocks.app';
    const profile = await services.signIn(email, password);
    if (profile) {
      set({ profile, opponent: await services.opponentProfile() });
      await usePlayerStore.getState().hydrate();
    }
    return profile;
  },

  signOut: async () => {
    if (services.isConfigured()) await services.signOut();
    set({ profile: null });
  },

  recordResult: async (r) => {
    set(state => ({ progress: mergeLocalResult(state.progress, r) }));
    const progress = usePlayerStore.getState().progress;
    await syncLocalProgress.save(progress);
    if (!services.isConfigured()) return;
    try {
      if (r.mode === 'campaign' && r.levelId) await services.saveLevelProgress(r.levelId, r.stars, r.score);
      else if (r.mode === 'endless') await services.saveEndlessResult(r.score, r.blocks, r.lines, r.combo);
      else if (r.mode === 'daily') await services.submitDailyResult(r.score);
      else if (r.mode === 'duel' && r.matchId) {
        await services.submitDuelResult(r.matchId, {
          score: r.score, lines_cleared: r.lines, blocks_placed: r.blocks,
          combo: r.combo, moves: r.blocks, move_history: JSON.stringify({ moves: r.blocks }),
        });
      }
      // NOTE: player_stats totals are maintained by DB triggers on the backend.
    } catch {
      // offline — queued via pendingWrites by syncLocalProgress; retried on next hydrate
    }
  },

  refreshStats: async () => {
    if (!services.isConfigured()) return;
    set({ stats: await services.fetchStats() });
  },
}));
