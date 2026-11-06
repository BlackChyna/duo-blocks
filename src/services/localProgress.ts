/**
 * DUO BLOCKS — local player progress persistence + remote merge.
 *
 * playerStore uses: empty(), load(), save(progress), mergeRemote(local, rows)
 * and enqueue(fn) for offline writes. All storage goes through localStore
 * (IndexedDB → localStorage → memory).
 */
import type { PlayerLocalProgress } from '../types/game';
import type { LevelProgressRow } from '../types/services';
import {
  get as storeGet,
  readPendingWrites,
  set as storeSet,
  writePendingWrites,
  type PendingWriteRecord,
} from './localStore';

/** Zeroed local progress — the starting state for a fresh player. */
export function empty(): PlayerLocalProgress {
  return {
    highestScore: 0,
    levels: {},
    endless: {
      best: 0,
      blocksPlaced: 0,
      linesCleared: 0,
      longestCombo: 0,
      games: 0,
    },
    stats: { totalBlocks: 0, totalLines: 0, winStreak: 0, longestWinStreak: 0 },
    lastSavedAt: '',
  };
}

function looksLikeProgress(value: unknown): value is PlayerLocalProgress {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PlayerLocalProgress>;
  return (
    typeof p.highestScore === 'number' &&
    typeof p.levels === 'object' &&
    p.levels !== null &&
    typeof p.endless === 'object' &&
    p.endless !== null &&
    typeof p.stats === 'object' &&
    p.stats !== null
  );
}

/** Reads local progress; falls back to a zeroed shape when absent/corrupt. */
export async function load(): Promise<PlayerLocalProgress> {
  const stored = await storeGet<unknown>('progress', null);
  return looksLikeProgress(stored) ? stored : empty();
}

/** Persists local progress (stamps lastSavedAt). Never throws. */
export async function save(progress: PlayerLocalProgress): Promise<void> {
  await storeSet('progress', { ...progress, lastSavedAt: new Date().toISOString() });
}

/**
 * Merges remote `level_progress` rows into local progress.
 * stars / bestScore take the MAXIMUM of both sides — never lowered.
 * Unknown levels are added; the input object is not mutated.
 */
export function mergeRemote(
  local: PlayerLocalProgress,
  rows: LevelProgressRow[],
): PlayerLocalProgress {
  const next: PlayerLocalProgress = JSON.parse(JSON.stringify(local));
  for (const row of rows) {
    if (!row || typeof row.level_id !== 'string') continue;
    const current = next.levels[row.level_id];
    next.levels[row.level_id] = {
      completedAt: current?.completedAt ?? row.completed_at ?? new Date().toISOString(),
      stars: Math.max(current?.stars ?? 0, row.stars ?? 0) as 0 | 1 | 2 | 3,
      bestScore: Math.max(current?.bestScore ?? 0, row.best_score ?? 0),
    };
  }
  next.highestScore = Math.max(
    next.highestScore,
    ...rows.map((r) => r?.best_score ?? 0),
  );
  return next;
}

/**
 * Named export consumed by playerStore:
 * `import { syncLocalProgress } from '../services/localProgress'`.
 */
export const syncLocalProgress = {
  empty,
  load,
  save,
  mergeRemote,
  enqueue,
  pendingWriteCount,
};

// ---------------------------------------------------------------------------
// Pending-write queue — best-effort op markers for the retry UI.
// enqueue(fn) persists a marker, runs fn immediately, and removes the marker
// on success. If fn fails, the marker stays in the 'pendingWrites' kv entry.
// ---------------------------------------------------------------------------

export async function pendingWriteCount(): Promise<number> {
  return (await readPendingWrites()).length;
}

export async function enqueue(
  fn: () => Promise<void>,
  label = 'op',
): Promise<void> {
  const records = await readPendingWrites();
  const marker: PendingWriteRecord = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: new Date().toISOString(),
  };
  await writePendingWrites([...records, marker]);
  try {
    await fn();
    const remaining = await readPendingWrites();
    await writePendingWrites(remaining.filter((r) => r.id !== marker.id));
  } catch (err) {
    // Marker deliberately kept — surfaced by the retry UI / next hydrate.
    throw err;
  }
}
