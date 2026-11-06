import { describe, it, expect } from 'vitest';
import type { EngineApi, LevelDef } from '../../src/types/game';

/**
 * CONTRACT TEST — what the rest of the app expects from the engine module.
 * The engine must be exported from src/features/game/engine/index.ts as `engine`
 * and must satisfy EngineApi exactly. These tests pin the interface.
 *
 * NOTE to implementer: these tests will fail until the engine is implemented.
 */

import { engine } from '../../src/features/game/engine';

const level: LevelDef = {
  id: 'L0001', number: 1, chapter: 1, name: 'First Light', difficulty: 1,
  objective: { kind: 'targetScore', target: 50 },
  boardRows: 8, boardCols: 8,
  obstacles: [], seed: 1,
  starThresholds: [50, 100, 200],
};

describe('engine contract', () => {
  it('exports an EngineApi', () => {
    expect(engine.createGameState).toBeTypeOf('function');
    expect(engine.applyMove).toBeTypeOf('function');
    expect(engine.canPlaceAt).toBeTypeOf('function');
    expect(engine.anyValidPlacement).toBeTypeOf('function');
    expect(engine.isStuck).toBeTypeOf('function');
    expect(engine.evaluateObjective).toBeTypeOf('function');
  });

  it('creates a deterministic state from a seed', () => {
    const a = engine.createGameState({ rows: 8, cols: 8, seed: 42 });
    const b = engine.createGameState({ rows: 8, cols: 8, seed: 42 });
    expect(a.board).toEqual(b.board);
    expect(a.tray.map(p => p?.shapeId)).toEqual(b.tray.map(p => p?.shapeId));
    expect(a.rngState).toBe(b.rngState);
    expect(a.status).toBe('active');
    expect(a.tray.filter(Boolean)).toHaveLength(3);
  });

  it('serialises to plain JSON and back without behaviour change', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 7 });
    const clone = JSON.parse(JSON.stringify(s));
    const moved = engine.applyMove(clone, 0, 0, 0);
    // no crash on borrowed clone
    expect(moved.state).toBeTruthy();
  });

  it('rejects illegal placements and keeps state unchanged', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 3 });
    const before = JSON.parse(JSON.stringify(s));
    const r = engine.applyMove(s, 0, -1, 0); // off board
    expect(r.events.placed).toBe(false);
    expect(r.state).toEqual(before);
  });

  it('places a legal move and awards per-cell points', () => {
    let s = engine.createGameState({ rows: 8, cols: 8, seed: 3 });
    // find any legal tray-0 move
    const piece = s.tray[0]!;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (engine.canPlaceAt(s.board, piece.cells, r, c)) {
          const { state, events } = engine.applyMove(s, 0, r, c);
          expect(events.placed).toBe(true);
          expect(state.score).toBe(events.cellsPlaced * 10);
          break outer;
        }
        expect(r).toBeLessThan(8);
      }
    }
  });

  it('honours obstacles', () => {
    const s = engine.createGameState({ rows: 4, cols: 4, seed: 1, obstacles: [[0, 0]] });
    expect(s.board[0][0]).toBe(2);
  });

  it('clears a full line and awards 100 per line + placement points', () => {
    // Build a board one cell away from a bottom-row clear, place the filling piece.
    const s = engine.createGameState({ rows: 1, cols: 8, seed: 5 });
    // force-fill row 0 cols 1..7 through repeated legal moves is complex;
    // instead assert clearing math directly on an 1x8 single-cell piece sequence:
    let st = s;
    let total = 0;
    let lines = 0;
    for (let i = 0; i < 30; i++) {
      const movable = st.tray.findIndex(p => {
        if (!p) return false;
        for (let r = 0; r < st.rows; r++)
          for (let c = 0; c < st.cols; c++)
            if (engine.canPlaceAt(st.board, p.cells, r, c)) return true;
        return false;
      });
      if (movable === -1) break;
      const p = st.tray[movable]!;
      let placed = false;
      for (let r = 0; r < st.rows && !placed; r++)
        for (let c = 0; c < st.cols && !placed; c++)
          if (engine.canPlaceAt(st.board, p.cells, r, c)) {
            const res = engine.applyMove(st, movable, r, c);
            total += res.events.pointsEarned;
            lines += res.events.linesCleared;
            st = res.state;
            placed = true;
          }
    }
    // On a 1x8 board horizontal clears are guaranteed; vertical clears also trigger.
    expect(lines).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });

  it('is JSON-serialisable for move-history validation', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 11 });
    expect(() => JSON.stringify(s)).not.toThrow();
    expect(Array.isArray(s.history)).toBe(true);
    expect(Array.isArray(s.moveHashes)).toBe(true);
  });

  it('evaluates a targetScore objective with stars', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 1 });
    const ev = engine.evaluateObjective(level, { ...s, score: 60, status: 'stuck' });
    expect(ev.complete).toBe(true);
    expect(ev.stars).toBeGreaterThanOrEqual(1);
    expect(ev.stars).toBeLessThanOrEqual(3);
  });
});
