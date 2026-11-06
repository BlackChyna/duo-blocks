/**
 * DUO BLOCKS — stats / achievements service.
 *
 * `player_stats` rows are maintained server-side by DB triggers for
 * match-derived numbers; endless best is updated here with a conditional
 * UPDATE (never lowered, race-safe without an RPC).
 */
import type { PlayerStatsRow } from '../types/services';
import { supabase } from './supabaseClient';

function mapStatsRow(row: Record<string, unknown>): PlayerStatsRow {
  const num = (k: string): number => Math.max(0, Math.floor(Number(row[k] ?? 0)) || 0);
  return {
    player: String(row.player),
    total_points: num('total_points'),
    highest_score: num('highest_score'),
    wins: num('wins'),
    losses: num('losses'),
    draws: num('draws'),
    total_matches: num('total_matches'),
    levels_completed: num('levels_completed'),
    daily_wins: num('daily_wins'),
    daily_current_streak: num('daily_current_streak'),
    daily_best_streak: num('daily_best_streak'),
    win_streak: num('win_streak'),
    longest_win_streak: num('longest_win_streak'),
    endless_best: num('endless_best'),
  };
}

/** Own stats row (RLS restricts player_stats reads to the owner). */
export async function fetchStats(uid: string): Promise<PlayerStatsRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('player', uid);
    if (error) throw error;
    return (data ?? []).map((r) => mapStatsRow(r as Record<string, unknown>));
  } catch (err) {
    console.warn('[stats] fetchStats error:', err);
    return [];
  }
}

/** Achievement ids already unlocked by the caller. */
export async function fetchAchievements(uid: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('player_achievements')
      .select('achievement_id')
      .eq('player', uid);
    if (error) throw error;
    return (data ?? [])
      .map((r) => String((r as { achievement_id?: unknown }).achievement_id ?? ''))
      .filter((id) => id.length > 0);
  } catch (err) {
    console.warn('[stats] fetchAchievements error:', err);
    return [];
  }
}

/**
 * Records an endless-mode result: endless_best = max(existing, score).
 * Implemented as a conditional UPDATE (only rows whose current best is lower)
 * plus a first-run insert fallback — atomic, no RPC needed.
 */
export async function saveEndlessResult(uid: string, score: number): Promise<void> {
  if (!supabase) return;
  try {
    const best = Math.max(0, Math.floor(score));
    const { data: updated } = await supabase
      .from('player_stats')
      .update({ endless_best: best, updated_at: new Date().toISOString() })
      .eq('player', uid)
      .lt('endless_best', best)
      .select('player');
    if (updated && updated.length > 0) return; // raised the existing best
    const { data: existing } = await supabase
      .from('player_stats')
      .select('player')
      .eq('player', uid)
      .maybeSingle();
    if (!existing) {
      // trigger-created row missing (e.g. user created before the migration):
      // seed a minimal row so the best is never lost.
      const { error } = await supabase.from('player_stats').upsert({
        player: uid,
        endless_best: best,
      }, { onConflict: 'player', ignoreDuplicates: false });
      if (error) console.warn('[stats] saveEndlessResult seed failed:', error.message);
    }
  } catch (err) {
    console.warn('[stats] saveEndlessResult error:', err);
  }
}
