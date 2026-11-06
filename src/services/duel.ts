/**
 * DUO BLOCKS — duel (head-to-head match) service.
 *
 * Thin wrapper over the `matches` / `match_results` tables. Result submission
 * goes through the server-validated RPC `submit_duel_result` — see
 * supabase/migrations/0001_init.sql for the SQL contract.
 */
import { SCORING_VERSION } from '../types/game';
import type { DuelMatch, MatchResult } from '../types/services';
import { supabase } from './supabaseClient';

export type DuelResultInput = Omit<
  MatchResult,
  'match_id' | 'player' | 'result_verdict' | 'submitted_at'
>;

/** Maps a `matches` row to the DuelMatch contract shape. */
export function mapMatchRow(row: Record<string, unknown>): DuelMatch {
  return {
    id: String(row.id),
    created_by: String(row.created_by),
    opponent: String(row.opponent),
    level_id: String(row.level_id),
    seed: Number(row.seed),
    scoring_version: Number(row.scoring_version ?? SCORING_VERSION),
    status: row.status as DuelMatch['status'],
    winner: row.winner == null ? null : String(row.winner),
    created_at: String(row.created_at),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
  };
}

/** Creates an active duel between the two room members. */
export async function createDuel(
  levelId: string,
  seed: number,
  createdByUid: string,
  opponentUid: string,
): Promise<DuelMatch | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        created_by: createdByUid,
        opponent: opponentUid,
        level_id: levelId,
        seed: Math.trunc(seed),
        scoring_version: SCORING_VERSION,
        status: 'active',
      })
      .select('*')
      .single();
    if (error || !data) {
      console.warn('[duel] createDuel failed:', error?.message);
      return null;
    }
    return mapMatchRow(data as Record<string, unknown>);
  } catch (err) {
    console.warn('[duel] createDuel error:', err);
    return null;
  }
}

/** Lists the caller's duels (RLS restricts to the two participants). */
export async function listDuels(uid: string): Promise<DuelMatch[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .or(`created_by.eq.${uid},opponent.eq.${uid}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => mapMatchRow(r as Record<string, unknown>));
  } catch (err) {
    console.warn('[duel] listDuels error:', err);
    return [];
  }
}

/**
 * Submits the caller's result via the server-validated RPC. Idempotent:
 * the server keeps the best submission per player per match and computes
 * the verdict + stats via triggers.
 */
export async function submitDuelResult(
  matchId: string,
  result: DuelResultInput,
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('submit_duel_result', {
      p_match_id: matchId,
      p_score: Math.max(0, Math.floor(result.score)),
      p_lines: Math.max(0, Math.floor(result.lines_cleared)),
      p_blocks: Math.max(0, Math.floor(result.blocks_placed)),
      p_combo: Math.max(0, Math.floor(result.combo)),
      p_moves: Math.max(0, Math.floor(result.moves)),
      p_history: result.move_history,
    });
    if (error) console.warn('[duel] submitDuelResult failed:', error.message);
  } catch (err) {
    console.warn('[duel] submitDuelResult error:', err);
  }
}
