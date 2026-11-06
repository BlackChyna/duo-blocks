import { describe, it, expect } from 'vitest';
import { accraToday, fnv1aDate } from '../../src/services/daily';
import { empty, mergeRemote } from '../../src/services/localProgress';
import { services } from '../../src/services';
import type { DbService, LevelProgressRow } from '../../src/types/services';

/**
 * CONTRACT TESTS — light, mock-free shape/semantics checks for the services
 * layer. No Supabase project is needed: with env vars absent the facade must
 * degrade to no-op local mode.
 */

// ---------------------------------------------------------------------------
// fnv1aDate — deterministic daily seed
// ---------------------------------------------------------------------------

describe('fnv1aDate', () => {
  it('is deterministic for the same date', () => {
    expect(fnv1aDate('2026-11-06')).toBe(fnv1aDate('2026-11-06'));
  });

  it('differs across dates', () => {
    expect(fnv1aDate('2026-11-05')).not.toBe(fnv1aDate('2026-11-06'));
    expect(fnv1aDate('2026-11-06')).not.toBe(fnv1aDate('2026-11-07'));
  });

  it('matches the FNV-1a 32-bit spec vectors (offset basis / empty input)', () => {
    // FNV-1a of the empty string is the 32-bit offset basis: 2166136261
    expect(fnv1aDate('')).toBe(2166136261);
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const d of ['2026-11-06', '2000-01-01', '9999-12-31']) {
      const h = fnv1aDate(d);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe('accraToday', () => {
  it('matches the UTC calendar day (Africa/Accra is UTC+0 all year)', () => {
    for (const iso of ['2026-11-06T00:30:00Z', '2026-11-06T23:59:00Z', '2026-06-15T12:00:00Z']) {
      expect(accraToday(new Date(iso))).toBe(iso.slice(0, 10));
    }
  });
});

// ---------------------------------------------------------------------------
// localProgress — merge semantics
// ---------------------------------------------------------------------------

function row(partial: Partial<LevelProgressRow>): LevelProgressRow {
  return {
    player: '00000000-0000-0000-0000-000000000001',
    level_id: 'L0001',
    stars: 0,
    best_score: 0,
    attempts: 1,
    completed_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('localProgress.empty', () => {
  it('returns a zeroed PlayerLocalProgress', () => {
    const p = empty();
    expect(p.highestScore).toBe(0);
    expect(p.levels).toEqual({});
    expect(p.endless).toEqual({
      best: 0, blocksPlaced: 0, linesCleared: 0, longestCombo: 0, games: 0,
    });
    expect(p.stats).toEqual({ totalBlocks: 0, totalLines: 0, winStreak: 0, longestWinStreak: 0 });
  });
});

describe('localProgress.mergeRemote', () => {
  it('takes the max of stars and bestScore — never lowers', () => {
    const local = empty();
    local.levels['L0001'] = { completedAt: '2026-01-02T00:00:00Z', stars: 1, bestScore: 900 };
    const merged = mergeRemote(local, [
      row({ level_id: 'L0001', stars: 3, best_score: 500 }),
    ]);
    expect(merged.levels['L0001']).toEqual({
      completedAt: '2026-01-02T00:00:00Z', // local kept
      stars: 3, // remote higher → raised
      bestScore: 900, // local higher → kept
    });
  });

  it('adds levels unknown locally', () => {
    const merged = mergeRemote(empty(), [
      row({ level_id: 'L0231', stars: 2, best_score: 250 }),
    ]);
    expect(merged.levels['L0231']?.stars).toBe(2);
    expect(merged.levels['L0231']?.bestScore).toBe(250);
  });

  it('ignores lower remote results', () => {
    const local = empty();
    local.levels['L0001'] = { completedAt: '2026-01-02T00:00:00Z', stars: 2, bestScore: 700 };
    const merged = mergeRemote(local, [
      row({ level_id: 'L0001', stars: 1, best_score: 300 }),
    ]);
    expect(merged.levels['L0001']).toEqual({
      completedAt: '2026-01-02T00:00:00Z', stars: 2, bestScore: 700,
    });
  });

  it('does not mutate its input', () => {
    const local = empty();
    const before = JSON.stringify(local);
    mergeRemote(local, [row({ level_id: 'L0001', stars: 3, best_score: 500 })]);
    expect(JSON.stringify(local)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// services facade — shape + graceful local-only degradation
// ---------------------------------------------------------------------------

const DB_SERVICE_METHODS: (keyof DbService)[] = [
  'isConfigured',
  'signIn', 'signOut', 'currentProfile', 'opponentProfile',
  'saveLevelProgress', 'fetchLevelProgress', 'saveEndlessResult',
  'createDuel', 'listDuels', 'submitDuelResult',
  'sendChallenge', 'listChallenges', 'resolveChallenge',
  'submitDailyResult', 'fetchDailyRecord',
  'fetchStats', 'fetchAchievements',
  'subscribeMatchEvents', 'subscribePresence', 'subscribeChallenges',
];

describe('services facade', () => {
  it('exposes every DbService method', () => {
    for (const name of DB_SERVICE_METHODS) {
      expect(typeof services[name]).toBe('function');
    }
  });

  it('reports unconfigured without env vars', () => {
    expect(services.isConfigured()).toBe(false);
  });

  it('degrades every method to a no-op/empty value (never throws)', async () => {
    expect(await services.currentProfile()).toBeNull();
    expect(await services.opponentProfile()).toBeNull();
    expect(await services.signIn('x@y.z', 'pw')).toBeNull();
    expect(await services.fetchLevelProgress()).toEqual([]);
    expect(await services.listDuels()).toEqual([]);
    expect(await services.listChallenges()).toEqual([]);
    expect(await services.fetchStats()).toEqual([]);
    expect(await services.fetchAchievements()).toEqual([]);
    expect(await services.fetchDailyRecord('2026-11-06')).toBeNull();
    expect(await services.createDuel('L0001', 42)).toBeNull();
    expect(await services.sendChallenge('uid-2', 'L0001', 42)).toBeNull();
    // no-ops resolve instead of rejecting
    await expect(services.signOut()).resolves.toBeUndefined();
    await expect(services.saveLevelProgress('L0001', 3, 100)).resolves.toBeUndefined();
    await expect(services.saveEndlessResult(123, 40, 5, 2)).resolves.toBeUndefined();
    await expect(services.submitDuelResult('m-1', {
      score: 100, lines_cleared: 3, blocks_placed: 10, combo: 2, moves: 10,
      move_history: '{"moves":10}',
    })).resolves.toBeUndefined();
    await expect(services.submitDailyResult(55)).resolves.toBeUndefined();
    await expect(services.resolveChallenge('c-1', 'accept')).resolves.toBeUndefined();
    // realtime subscriptions return an unsubscribe function without connecting
    expect(services.subscribeMatchEvents(() => {})).toBeTypeOf('function');
    expect(services.subscribePresence(() => {})).toBeTypeOf('function');
    expect(services.subscribeChallenges(() => {})).toBeTypeOf('function');
  });
});
