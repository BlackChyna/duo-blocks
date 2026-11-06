/**
 * DUO BLOCKS — pure UI-model tests (levelState).
 * Covers the campaign level-button status machine and the daily seed wrapper.
 */
import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/types/game';
import { campaignUnlockedUpTo, dailySeed, levelStatus, type LevelProgressRecord } from '../../src/pages/levelState';

function lvl(n: number, id = `L${String(n).padStart(4, '0')}`): LevelDef {
  return {
    id,
    number: n,
    chapter: Math.ceil(n / 50),
    name: `Level ${n}`,
    difficulty: 1,
    objective: { kind: 'targetScore', target: 100 },
    boardRows: 8,
    boardCols: 8,
    obstacles: [],
    seed: n,
    starThresholds: [100, 200, 300],
  };
}

function rec(stars: 0 | 1 | 2 | 3): LevelProgressRecord {
  return { completedAt: '2026-11-06T00:00:00.000Z', stars, bestScore: 100 };
}

describe('levelStatus', () => {
  it('is locked beyond the unlocked frontier', () => {
    expect(levelStatus(lvl(5), undefined, 3)).toBe('locked');
    expect(levelStatus(lvl(5), rec(0), 3)).toBe('locked');
    expect(levelStatus(lvl(2), undefined, 0)).toBe('locked');
  });

  it('is playable at the frontier (+1) and below', () => {
    expect(levelStatus(lvl(4), undefined, 3)).toBe('playable');
    expect(levelStatus(lvl(1), undefined, 0)).toBe('playable');
    expect(levelStatus(lvl(50), undefined, 49)).toBe('playable');
  });

  it('a failed attempt (0 stars) stays playable', () => {
    expect(levelStatus(lvl(2), rec(0), 1)).toBe('playable');
  });

  it('any starred record is completed regardless of the frontier', () => {
    expect(levelStatus(lvl(9), rec(3), 0)).toBe('completed');
    expect(levelStatus(lvl(9), rec(1), 0)).toBe('completed');
  });
});

describe('campaignUnlockedUpTo', () => {
  it('returns 0 with no progress', () => {
    expect(campaignUnlockedUpTo([lvl(1), lvl(2), lvl(3)], {})).toBe(0);
  });

  it('is the highest completed level number', () => {
    const levels = [lvl(1), lvl(2), lvl(3), lvl(4)];
    expect(campaignUnlockedUpTo(levels, { L0001: rec(2), L0003: rec(1) })).toBe(3);
  });

  it('ignores 0-star records', () => {
    expect(campaignUnlockedUpTo([lvl(1), lvl(2)], { L0001: rec(0) })).toBe(0);
  });
});

describe('dailySeed', () => {
  it('is stable within one Accra (UTC+0) day and differs across days', () => {
    const morning = new Date('2026-11-06T00:30:00Z');
    const night = new Date('2026-11-06T23:59:59Z');
    expect(dailySeed(morning)).toBe(dailySeed(night));
    expect(dailySeed(new Date('2026-11-07T00:00:00Z'))).not.toBe(dailySeed(morning));
  });

  it('matches an independent FNV-1a implementation over YYYY-MM-DD', () => {
    let hash = 0x811c9dc5;
    for (const ch of '2026-11-06') {
      hash ^= ch.charCodeAt(0) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    expect(dailySeed(new Date('2026-11-06T12:00:00Z'))).toBe(hash >>> 0);
  });

  it('defaults to today and returns an unsigned 32-bit integer', () => {
    const seed = dailySeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
