/**
 * DUO BLOCKS — pure campaign/daily UI logic.
 * No React or store imports so it stays unit-testable
 * (see tests/unit/ui-model.test.ts).
 */
import type { LevelDef, PlayerLocalProgress } from '../types/game';
import { accraToday, fnv1aDate } from '../services/daily';

export type LevelStatus = 'locked' | 'playable' | 'completed';

/** One saved attempt for a level (value shape of PlayerLocalProgress.levels). */
export type LevelProgressRecord = PlayerLocalProgress['levels'][string];

/**
 * Status of a campaign level button.
 * - 'completed': a record with stars > 0 exists (a 0-star run was a failed
 *   attempt, so the level is still playable)
 * - 'playable':  the open frontier — every level numbered unlockedUpTo + 1 or below
 * - 'locked':    beyond the frontier
 */
export function levelStatus(
  level: LevelDef,
  record: LevelProgressRecord | undefined,
  unlockedUpTo: number,
): LevelStatus {
  if (record && record.stars > 0) return 'completed';
  if (level.number <= unlockedUpTo + 1) return 'playable';
  return 'locked';
}

/**
 * Highest campaign level number with a completed (stars > 0) record.
 * 0 when nothing is completed yet — level 1 is always playable.
 */
export function campaignUnlockedUpTo(
  levels: readonly LevelDef[],
  records: Record<string, LevelProgressRecord>,
): number {
  let max = 0;
  for (const level of levels) {
    const record = records[level.id];
    if (record && record.stars > 0 && level.number > max) max = level.number;
  }
  return max;
}

/**
 * Daily-duo seed wrapper: FNV-1a over the Accra (UTC+0) calendar date.
 * Adapts Date-based callers to the services layer's string-based
 * `fnv1aDate('YYYY-MM-DD')`.
 */
export function dailySeed(date: Date = new Date()): number {
  return fnv1aDate(accraToday(date));
}
