/**
 * DUO BLOCKS — daily challenge service (DbService.submitDailyResult / fetchDailyRecord).
 *
 * The daily seed is a deterministic FNV-1a hash of the UTC date string so both
 * players get an identical board. Rows live in `daily_results`, keyed by
 * (date, player); a player's best score is kept, attempts increment.
 */
import type { DailyRecord } from '../types/services';
import { supabase } from './supabaseClient';

/**
 * FNV-1a (32-bit) hash of a 'YYYY-MM-DD' string — deterministic daily seed.
 * Exported for tests; callers pass the date exactly as stored (Accra calendar day).
 */
export function fnv1aDate(date: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime, keep unsigned 32-bit
  }
  return h >>> 0;
}

/** Today's calendar date in Africa/Accra as 'YYYY-MM-DD'. */
export function accraToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Upserts today's result: keeps the best score, increments attempts. */
export async function submitDailyResult(score: number): Promise<void> {
  if (!supabase) return;
  try {
    const uid = await currentUid();
    if (!uid || !Number.isFinite(score)) return;
    const date = accraToday();
    const { data: existing } = await supabase
      .from('daily_results')
      .select('score, attempts')
      .eq('date', date)
      .eq('player', uid)
      .maybeSingle();
    const best = Math.max(existing?.score ?? 0, Math.max(0, Math.floor(score)));
    const attempts = (existing?.attempts ?? 0) + 1;
    const { error } = await supabase.from('daily_results').upsert(
      {
        date,
        player: uid,
        score: best,
        attempts,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'date,player' },
    );
    if (error) console.warn('[daily] submitDailyResult failed:', error.message);
  } catch (err) {
    console.warn('[daily] submitDailyResult error:', err);
  }
}

/**
 * Builds the day's record for both players. Winner is the unique top score
 * (a tie or an empty day yields null). Never throws.
 */
export async function fetchDailyRecord(date: string): Promise<DailyRecord | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('daily_results')
      .select('date, player, score, attempts, completed_at')
      .eq('date', date);
    if (error) throw error;
    const rows = data ?? [];
    const playerResults: DailyRecord['playerResults'] = {};
    let winner: string | null = null;
    let best = -1;
    let tie = false;
    for (const r of rows) {
      playerResults[r.player] = {
        score: r.score ?? 0,
        attempts: r.attempts ?? 0,
        completedAt: r.completed_at ?? '',
      };
      if (r.score > best) {
        best = r.score;
        winner = r.player;
        tie = false;
      } else if (r.score === best) {
        tie = true;
      }
    }
    return {
      date,
      seed: fnv1aDate(date),
      playerResults,
      winner: rows.length === 0 || tie ? null : winner,
    };
  } catch (err) {
    console.warn('[daily] fetchDailyRecord error:', err);
    return null;
  }
}
