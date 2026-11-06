/**
 * DUO BLOCKS — persistence / multiplayer service contracts.
 * The frontend talks ONLY through these interfaces; src/services/*.ts implement them.
 * When Supabase env vars are missing, implementations must degrade gracefully to
 * local-only mode (IndexedDB) and report isConfigured=false — never crash.
 */

import type { GameMode, PlayerLocalProgress } from './game';

export interface PlayerProfile {
  id: string; // supabase auth uid
  username: 'Cyril' | 'Yayra';
  avatar: 'cyril' | 'yayra';
  created_at: string;
  totalScore: number;
}

export interface DuelMatch {
  id: string; // uuid
  created_by: string; // uid
  opponent: string; // uid
  level_id: string; // LevelDef.id (e.g. 'L0231'), both players get identical seed
  seed: number;
  scoring_version: number;
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  winner: string | null; // uid or null for draw
  created_at: string;
  finished_at: string | null;
}

export interface MatchResult {
  match_id: string;
  player: string; // uid
  score: number;
  lines_cleared: number;
  blocks_placed: number;
  combo: number;
  moves: number;
  move_history: string; // JSON string of state.history + moveHashes (validated server-side)
  result_verdict: 'pending' | 'win' | 'loss' | 'draw' | 'invalid';
  submitted_at: string;
}

export interface Challenge {
  id: string;
  sender: string;
  recipient: string;
  level_id: string;
  seed: number;
  status: 'pending' | 'accepted' | 'played_by_sender' | 'played_by_recipient' | 'complete' | 'expired';
  expires_at: string; // sender-issued 24h window
  winner: string | null;
  created_at: string;
}

export interface DailyRecord {
  date: string; // YYYY-MM-DD (Africa/Accra timezone)
  seed: number; // deterministic from the date — identical for both players
  playerResults: Record<string, { score: number; attempts: number; completedAt: string }>;
  winner: string | null;
}

/** Shape of the row in table `player_stats`. */
export interface PlayerStatsRow {
  player: string;
  total_points: number;
  highest_score: number;
  wins: number;
  losses: number;
  draws: number;
  total_matches: number;
  levels_completed: number;
  daily_wins: number;
  daily_current_streak: number;
  daily_best_streak: number;
  win_streak: number;
  longest_win_streak: number;
  endless_best: number;
}

/** Shape of a row in table `level_progress`. */
export interface LevelProgressRow {
  player: string;
  level_id: string;
  stars: 0 | 1 | 2 | 3;
  best_score: number;
  attempts: number;
  completed_at: string;
  updated_at: string;
}

export interface DbService {
  /** false when VITE_SUPABASE_* env vars are absent — app then runs local-only. */
  isConfigured(): boolean;

  // auth
  signIn(email: string, password: string): Promise<PlayerProfile | null>;
  signOut(): Promise<void>;
  currentProfile(): Promise<PlayerProfile | null>;
  /** Opponent's uid/profile for the fixed two-player room. */
  opponentProfile(): Promise<PlayerProfile | null>;

  // progress (writes are idempotent upserts; local bests are never lowered)
  saveLevelProgress(levelId: string, stars: number, score: number): Promise<void>;
  fetchLevelProgress(): Promise<LevelProgressRow[]>;
  saveEndlessResult(score: number, blocks: number, lines: number, combo: number): Promise<void>;

  // duels
  createDuel(levelId: string, seed: number): Promise<DuelMatch | null>;
  listDuels(): Promise<DuelMatch[]>;
  submitDuelResult(matchId: string, result: Omit<MatchResult, 'match_id' | 'player' | 'result_verdict' | 'submitted_at'>): Promise<void>;

  // challenges
  sendChallenge(recipientUid: string, levelId: string, seed: number): Promise<Challenge | null>;
  listChallenges(): Promise<Challenge[]>;
  resolveChallenge(challengeId: string, action: 'accept' | 'expire'): Promise<void>;

  // daily
  submitDailyResult(score: number): Promise<void>;
  fetchDailyRecord(date: string): Promise<DailyRecord | null>;

  // stats / leaderboard
  fetchStats(): Promise<PlayerStatsRow[]>;
  fetchAchievements(): Promise<string[]>; // achievement ids already unlocked

  // realtime — subscribe to a validated private channel; returns an unsubscribe fn
  subscribeMatchEvents(cb: (payload: { type: string; match_id?: string; by?: string }) => void): () => void;
  subscribePresence(cb: (online: string[]) => void): () => void;
  subscribeChallenges(cb: (c: Challenge) => void): () => void;
}

/** Local-first cache used by all services; IndexedDB under the hood. */
export interface LocalStore {
  get<T>(key: 'profile' | 'progress' | 'pendingWrites', fallback: T): Promise<T>;
  set(key: 'profile' | 'progress' | 'pendingWrites', value: unknown): Promise<void>;
  /** Queue a write executed when connectivity returns (progress-sync reconciliation). */
  enqueueWrite(op: () => Promise<void>): Promise<void>;
}
