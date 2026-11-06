import { describe, expect, it } from 'vitest';
import { CHAPTERS, LEVELS, LEVEL_BY_ID } from '../../src/data/levels';
import type { LevelDef } from '../../src/types/game';
import data from '../../src/data/levels/levels.json';

/**
 * STRUCTURAL TEST — vitest mirror of scripts/validate-levels.mjs.
 * Pins the generated 500-level catalogue against the LevelDef contract.
 */

const CHAPTER_MAX_DIFF = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];

const raw = data as { version: string; levels: LevelDef[] };
const levels: LevelDef[] = raw.levels;

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

const sameObstacleSet = (a: [number, number][], b: [number, number][]) =>
  a.length === b.length && a.every((o, i) => o[0] === b[i][0] && o[1] === b[i][1]);

describe('levels.json catalogue', () => {
  it('has version 1.0.0 and exactly 500 levels', () => {
    expect(raw.version).toBe('1.0.0');
    expect(levels).toHaveLength(500);
  });

  it('has zero-padded unique ids L0001…L0500 with number === index+1', () => {
    const ids = new Set<string>();
    levels.forEach((lv, i) => {
      const n = i + 1;
      expect(lv.id).toBe(`L${String(n).padStart(4, '0')}`);
      ids.add(lv.id);
      expect(lv.number).toBe(n);
    });
    expect(ids.size).toBe(500);
  });

  it('maps every level into the correct 1-10 x 50 chapter window', () => {
    for (const lv of levels) {
      const expected = Math.floor((lv.number - 1) / 50) + 1;
      expect(lv.chapter).toBe(expected);
      expect(lv.chapter).toBeGreaterThanOrEqual(1);
      expect(lv.chapter).toBeLessThanOrEqual(10);
    }
  });

  it('keeps board dims in {6,7,8} x {6,7,8}', () => {
    for (const lv of levels) {
      for (const dim of [lv.boardRows, lv.boardCols]) {
        expect(isInt(dim)).toBe(true);
        expect(dim).toBeGreaterThanOrEqual(6);
        expect(dim).toBeLessThanOrEqual(8);
      }
    }
  });

  it('keeps obstacles in bounds, unique, and under 40% of cells', () => {
    for (const lv of levels) {
      const seen = new Set<string>();
      for (const [r, c] of lv.obstacles) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(lv.boardRows);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(lv.boardCols);
        const key = `${r},${c}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      expect(lv.obstacles.length * 100).toBeLessThan(lv.boardRows * lv.boardCols * 40);
    }
  });

  it('has valid objective fields per kind', () => {
    for (const lv of levels) {
      const o = lv.objective;
      switch (o.kind) {
        case 'targetScore':
          expect(o.target).toBeGreaterThan(0);
          break;
        case 'scoreWithinMoves':
          expect(o.moveLimit).toBeGreaterThan(0);
          expect(o.target).toBeGreaterThan(0);
          break;
        case 'lineClears':
          expect(o.requiredLines).toBeGreaterThanOrEqual(1);
          expect(o.requiredLines).toBeLessThanOrEqual(16);
          if (o.moveLimit !== undefined) expect(o.moveLimit).toBeGreaterThan(0);
          break;
        case 'combo':
          expect(o.comboTarget).toBeGreaterThanOrEqual(2);
          expect(o.comboTarget).toBeLessThanOrEqual(5);
          if (o.moveLimit !== undefined) expect(o.moveLimit).toBeGreaterThan(0);
          break;
        default:
          throw new Error(`unknown objective kind in ${lv.id}`);
      }
    }
  });

  it('has ascending starThresholds with t3 > 0', () => {
    for (const lv of levels) {
      const [t1, t2, t3] = lv.starThresholds;
      expect(lv.starThresholds).toHaveLength(3);
      expect(t1).toBeLessThanOrEqual(t2);
      expect(t2).toBeLessThanOrEqual(t3);
      expect(t3).toBeGreaterThan(0);
    }
  });

  it('respects the per-chapter difficulty progression (ch1 max 2, ch10 max 5)', () => {
    for (const lv of levels) {
      expect(lv.difficulty).toBeGreaterThanOrEqual(1);
      expect(lv.difficulty).toBeLessThanOrEqual(5);
      expect(lv.difficulty).toBeLessThanOrEqual(CHAPTER_MAX_DIFF[lv.chapter - 1]);
    }
  });

  it('has unique seeds and unique level names', () => {
    const seeds = new Set(levels.map((lv) => lv.seed));
    const names = new Set(levels.map((lv) => lv.name));
    expect(seeds.size).toBe(500);
    expect(names.size).toBe(500);
  });

  it('never repeats (dims, obstacles, objective) on two consecutive levels', () => {
    for (let i = 1; i < levels.length; i++) {
      const a = levels[i - 1];
      const b = levels[i];
      const sameDims = a.boardRows === b.boardRows && a.boardCols === b.boardCols;
      const sameObjective = JSON.stringify(a.objective) === JSON.stringify(b.objective);
      if (sameDims && sameObjective) {
        expect(sameObstacleSet(a.obstacles, b.obstacles)).toBe(false);
      }
    }
  });

  it('exposes LEVELS, LEVEL_BY_ID and CHAPTERS from the loader', () => {
    expect(LEVELS).toHaveLength(500);
    expect(LEVEL_BY_ID.get('L0001')?.name).toBe('First Steps');
    expect(LEVEL_BY_ID.get('L0500')?.number).toBe(500);
    expect(LEVEL_BY_ID.size).toBe(500);
    expect(CHAPTERS).toHaveLength(10);
    CHAPTERS.forEach((ch, i) => {
      expect(ch.index).toBe(i + 1);
      expect(ch.fromLevel).toBe(i * 50 + 1);
      expect(ch.toLevel).toBe(i * 50 + 50);
    });
  });
});
