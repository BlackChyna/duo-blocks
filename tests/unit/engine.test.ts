import { describe, it, expect } from 'vitest';
import type { Cell, GameState, LevelDef, Objective, TrayPiece } from '../../src/types/game';
import { engine, SHAPES, pickShape } from '../../src/features/game/engine';
import { SCORING_RULES, scoreMove } from '../../src/features/game/engine/scoring';
import { next, seedToState } from '../../src/features/game/engine/prng';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function piece(shapeId: string, trayIndex = 0): TrayPiece {
  const sh = SHAPES.find(s => s.id === shapeId)!;
  return {
    trayIndex,
    shapeId: sh.id,
    color: 'cyan',
    cells: sh.cells.map(([r, c]) => [r, c] as [number, number]),
    w: sh.w,
    h: sh.h,
  };
}

function setBoard(s: GameState, fill: (r: number, c: number) => Cell): void {
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) s.board[r][c] = fill(r, c);
  }
}

/** First legal move in tray order / row-major board order, or null if stuck. */
function firstLegal(s: GameState): [number, number, number] | null {
  for (let t = 0; t < s.tray.length; t++) {
    const p = s.tray[t];
    if (!p) continue;
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (engine.canPlaceAt(s.board, p.cells, r, c)) return [t, r, c];
      }
    }
  }
  return null;
}

function levelWith(objective: Objective): LevelDef {
  return {
    id: 'T0001', number: 1, chapter: 1, name: 'Test', difficulty: 1,
    objective, boardRows: 8, boardCols: 8, obstacles: [], seed: 1,
    starThresholds: [100, 200, 400],
  };
}

// ---------------------------------------------------------------------------
// shape catalog
// ---------------------------------------------------------------------------

describe('shape catalog', () => {
  it('has 16-20 shapes with unique, stable ids', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(16);
    expect(SHAPES.length).toBeLessThanOrEqual(20);
    expect(new Set(SHAPES.map(s => s.id)).size).toBe(SHAPES.length);
  });

  it('every shape: cells inside bounding box, no duplicates, w/h consistent', () => {
    for (const s of SHAPES) {
      expect(s.cells.length).toBeGreaterThan(0);
      for (const [r, c] of s.cells) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(s.h);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(s.w);
      }
      const keys = new Set(s.cells.map(([r, c]) => `${r},${c}`));
      expect(keys.size).toBe(s.cells.length);
    }
  });

  it('covers the required families', () => {
    const ids = new Set(SHAPES.map(s => s.id));
    for (const id of ['dot', 'bar2h', 'bar3h', 'bar4h', 'sq2', 'corner5', 'cross5']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// prng
// ---------------------------------------------------------------------------

describe('prng (mulberry32)', () => {
  it('seedToState is deterministic and returns a uint32', () => {
    for (const seed of [0, 1, 42, 999999, -7]) {
      const a = seedToState(seed);
      expect(a).toBe(seedToState(seed));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('next() returns [0,1) floats and an advanced uint32 state', () => {
    let s = seedToState(123);
    for (let i = 0; i < 1000; i++) {
      const [s2, v] = next(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(s2).toBeGreaterThanOrEqual(0);
      expect(s2).toBeLessThanOrEqual(0xffffffff);
      s = s2;
    }
  });

  it('the whole draw sequence is reproducible from the seed', () => {
    const run = () => {
      let s = seedToState(9);
      const seq: number[] = [];
      for (let i = 0; i < 100; i++) {
        const [s2, v] = next(s);
        s = s2;
        seq.push(v);
      }
      return seq;
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

describe('scoring v1 rules', () => {
  it('matches the versioned rules table', () => {
    expect(SCORING_RULES.version).toBe(1);
    expect(SCORING_RULES.cellPoints).toBe(10);
    expect(SCORING_RULES.linePoints).toBe(100);
    expect(SCORING_RULES.multiLineBonusPerExtraPair).toBe(50);
    expect(SCORING_RULES.comboBonusPerStreakStep).toBe(25);
  });

  it('placement-only and multi-line math', () => {
    expect(scoreMove(5, 0, 0)).toBe(50); // cells only
    expect(scoreMove(1, 1, 0)).toBe(110); // 10 + 100, no combo bonus on streak start
    expect(scoreMove(2, 2, 0)).toBe(270); // 20 + 200 + 50
    expect(scoreMove(3, 3, 0)).toBe(480); // 30 + 300 + 150 (3 pairs)
    expect(scoreMove(4, 4, 0)).toBe(740); // 40 + 400 + 50*6 + 0
    expect(scoreMove(2, 2, 2)).toBe(320); // + 25 * (3 - 1)
    expect(scoreMove(1, 1, 3)).toBe(185); // + 25 * (4 - 1)
  });
});

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  function playGreedy(seed: number, maxMoves: number): string[] {
    let st = engine.createGameState({ rows: 8, cols: 8, seed });
    const snaps: string[] = [];
    for (let i = 0; i < maxMoves; i++) {
      const mv = firstLegal(st);
      if (!mv) break;
      st = engine.applyMove(st, mv[0], mv[1], mv[2]).state;
      snaps.push(JSON.stringify(st));
    }
    return snaps;
  }

  it('same seed -> identical 20-move game (full state snapshots)', () => {
    // Greedy play may legitimately end stuck before 20 moves on a crowded
    // board; determinism means both runs produce the exact same snapshots.
    const a = playGreedy(77, 20);
    const b = playGreedy(77, 20);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(a.length);
    expect(b).toEqual(a);
  });

  it('same seed -> identical trays, rngState, hashes; state stays JSON-safe', () => {
    const a = engine.createGameState({ rows: 8, cols: 8, seed: 1234 });
    const b = engine.createGameState({ rows: 8, cols: 8, seed: 1234 });
    expect(a.tray.map(p => p!.shapeId)).toEqual(b.tray.map(p => p!.shapeId));
    expect(a.tray.map(p => p!.color)).toEqual(b.tray.map(p => p!.color));
    expect(a.rngState).toBe(b.rngState);
    expect(() => JSON.stringify(a)).not.toThrow();
  });

  it('tray: 3 distinct shapes and distinct colors across many seeds', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const s = engine.createGameState({ rows: 8, cols: 8, seed });
      const ids = s.tray.map(p => p!.shapeId);
      const colors = s.tray.map(p => p!.color);
      expect(new Set(ids).size).toBe(3);
      expect(new Set(colors).size).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// placement rules
// ---------------------------------------------------------------------------

describe('placement rules', () => {
  it('rejects off-board, overhang, overlap, used piece, bad trayIndex — state untouched', () => {
    const s = engine.createGameState({ rows: 6, cols: 6, seed: 4 });
    const frozen = JSON.parse(JSON.stringify(s));

    expect(engine.applyMove(s, 0, -1, 0).events.placed).toBe(false);
    expect(engine.applyMove(s, 0, 0, -1).events.placed).toBe(false);
    expect(engine.applyMove(s, -1, 0, 0).events.placed).toBe(false);
    expect(engine.applyMove(s, 3, 0, 0).events.placed).toBe(false);

    const p = s.tray[0]!;
    // piece extends past the bottom/right edge
    expect(engine.applyMove(s, 0, s.rows - p.h + 1, 0).events.placed).toBe(false);
    expect(engine.applyMove(s, 0, 0, s.cols - p.w + 1).events.placed).toBe(false);

    // overlap: pre-fill every target cell of the piece placed at (0,0), on a clone
    const oc = JSON.parse(JSON.stringify(s)) as GameState;
    for (const [dr, dc] of p.cells) oc.board[dr][dc] = 1;
    const ocFrozen = JSON.parse(JSON.stringify(oc));
    expect(engine.canPlaceAt(oc.board, p.cells, 0, 0)).toBe(false);
    expect(engine.applyMove(oc, 0, 0, 0).events.placed).toBe(false);
    expect(oc).toEqual(ocFrozen);

    expect(s).toEqual(frozen);
  });

  it('a used tray slot cannot be used again until refill', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 8 });
    const mv = firstLegal(s);
    expect(mv).not.toBeNull();
    const res = engine.applyMove(s, mv[0], mv[1], mv[2]);
    expect(res.events.placed).toBe(true);
    expect(res.state.tray[mv[0]]).toBeNull();
    const again = engine.applyMove(res.state, mv[0], mv[1], mv[2]);
    expect(again.events.placed).toBe(false);
    expect(again.state).toBe(res.state); // same object, unchanged
  });

  it('legal moves never mutate the input state', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 16 });
    const mv = firstLegal(s)!;
    const frozen = JSON.parse(JSON.stringify(s));
    engine.applyMove(s, mv[0], mv[1], mv[2]);
    expect(s).toEqual(frozen);
  });
});

// ---------------------------------------------------------------------------
// line clears & points
// ---------------------------------------------------------------------------

describe('line clears and scoring through applyMove', () => {
  it('single-line clear: 10/cell + 100/line + no combo bonus at streak start', () => {
    const base = engine.createGameState({ rows: 5, cols: 5, seed: 1 });
    const board = base.board.map(row => row.slice());
    for (let c = 0; c < 4; c++) board[3][c] = 1; // row 3 missing (3,4)
    const st: GameState = { ...base, board, tray: [piece('dot'), piece('sq2', 1), piece('bar3v', 2)] };
    const res = engine.applyMove(st, 0, 3, 4);
    expect(res.events.placed).toBe(true);
    expect(res.events.linesCleared).toBe(1);
    expect(res.events.pointsEarned).toBe(110); // 10 + 100 + 25*0
    expect(res.events.comboBefore).toBe(0);
    expect(res.events.comboAfter).toBe(1);
    expect(res.state.score).toBe(110);
    expect(res.state.combo).toBe(1);
    expect(res.state.linesCleared).toBe(1);
    expect(res.state.board[3].every(c => c === 0)).toBe(true);
  });

  it('multi-line clear point math: 2 lines with and without combo streak', () => {
    const base = engine.createGameState({ rows: 5, cols: 5, seed: 1 });
    const makeState = (combo: number): GameState => {
      const board = base.board.map(row => row.slice());
      for (let c = 0; c < 4; c++) { board[3][c] = 1; board[4][c] = 1; }
      return { ...base, board, combo, tray: [piece('bar2v'), piece('sq2', 1), piece('bar3v', 2)] };
    };

    const res = engine.applyMove(makeState(0), 0, 3, 4); // fills (3,4) and (4,4)
    expect(res.events.linesCleared).toBe(2);
    expect(res.events.clearedCells).toHaveLength(10);
    expect(res.events.pointsEarned).toBe(270); // 20 + 200 + 50 + 25*0
    expect(res.events.comboAfter).toBe(1);

    const res2 = engine.applyMove(makeState(2), 0, 3, 4);
    expect(res2.events.linesCleared).toBe(2);
    expect(res2.events.pointsEarned).toBe(320); // 270 + 25*(3-1)
    expect(res2.events.comboAfter).toBe(3);
    expect(res2.state.longestCombo).toBe(3);
  });

  it('combo chain: back-to-back clears extend the streak and add 25/step', () => {
    const base = engine.createGameState({ rows: 5, cols: 5, seed: 1 });
    const board = base.board.map(row => row.slice());
    for (let c = 0; c < 4; c++) { board[2][c] = 1; board[3][c] = 1; } // two almost-full rows
    const tray = [piece('dot'), piece('sq2', 1), piece('bar3v', 2)];
    let st: GameState = { ...base, board, tray };

    const m1 = engine.applyMove(st, 0, 3, 4); // clears row 3
    expect(m1.events.pointsEarned).toBe(110);
    expect(m1.state.combo).toBe(1);

    st = m1.state;
    st.tray = [piece('dot'), piece('sq2', 1), piece('bar3v', 2)];
    for (let c = 0; c < 4; c++) st.board[2][c] = 1; // row 2 missing (2,4)

    const m2 = engine.applyMove(st, 0, 2, 4); // clears row 2, comboBefore=1
    expect(m2.events.comboBefore).toBe(1);
    expect(m2.events.comboAfter).toBe(2);
    expect(m2.events.pointsEarned).toBe(135); // 10 + 100 + 25*1
    expect(m2.state.score).toBe(245);
  });

  it('a non-clearing move resets the combo streak to 0', () => {
    const base = engine.createGameState({ rows: 8, cols: 8, seed: 2 });
    const mv = firstLegal(base)!;
    const res = engine.applyMove({ ...base, combo: 4, longestCombo: 4 }, mv[0], mv[1], mv[2]);
    expect(res.events.comboBefore).toBe(4);
    expect(res.events.comboAfter).toBe(0);
    expect(res.state.combo).toBe(0);
    expect(res.state.longestCombo).toBe(4); // record kept
    expect(res.state.score).toBe(res.events.cellsPlaced * 10); // placement points only
  });

  it('on a 1-row board every placement immediately clears its column(s)', () => {
    let st = engine.createGameState({ rows: 1, cols: 8, seed: 5 });
    const mv = firstLegal(st);
    expect(mv).not.toBeNull();
    const res = engine.applyMove(st, mv[0], mv[1], mv[2]);
    expect(res.events.placed).toBe(true);
    expect(res.events.linesCleared).toBeGreaterThanOrEqual(1);
    expect(res.events.pointsEarned).toBeGreaterThanOrEqual(res.events.cellsPlaced * 10 + 100);
  });
});

// ---------------------------------------------------------------------------
// obstacles
// ---------------------------------------------------------------------------

describe('obstacles', () => {
  it('start on the board as Cell=2 and block placement', () => {
    const s = engine.createGameState({ rows: 4, cols: 4, seed: 1, obstacles: [[0, 0], [2, 3]] });
    expect(s.board[0][0]).toBe(2);
    expect(s.board[2][3]).toBe(2);
    expect(engine.canPlaceAt(s.board, [[0, 0]], 0, 0)).toBe(false);
    expect(engine.canPlaceAt(s.board, [[0, 0]], 2, 3)).toBe(false);
    expect(engine.canPlaceAt(s.board, [[0, 0], [0, 1]], 0, 0)).toBe(false); // any overlap blocks
  });

  it('a line containing an obstacle never clears and never counts', () => {
    const base = engine.createGameState({ rows: 5, cols: 5, seed: 1, obstacles: [[4, 4]] });
    const board = base.board.map(row => row.slice());
    for (let c = 0; c < 3; c++) board[3][c] = 1;               // row 3 missing (3,3),(3,4)
    for (let c = 0; c < 4; c++) board[4][c] = 1;               // row 4 full except obstacle (4,4)
    const st: GameState = { ...base, board, tray: [piece('bar2h'), piece('sq2', 1), piece('bar3v', 2)] };

    const res = engine.applyMove(st, 0, 3, 3); // bar2h fills (3,3),(3,4)
    expect(res.events.placed).toBe(true);
    expect(res.events.linesCleared).toBe(1);   // row 3 only; row 4 blocked by obstacle
    // obstacle untouched, blocked row untouched
    expect(res.state.board[4][4]).toBe(2);
    expect(res.state.board[4][0]).toBe(1);
    expect(res.state.board[4][1]).toBe(1);
    expect(res.state.board[3].every(c => c === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tray refill
// ---------------------------------------------------------------------------

describe('tray refill', () => {
  it('refills only after all 3 slots are used, deterministically', () => {
    const run = (seed: number) => {
      let st = engine.createGameState({ rows: 8, cols: 8, seed });
      const flags: boolean[] = [];
      for (let i = 0; i < 3; i++) {
        const mv = firstLegal(st);
        if (!mv) break;
        const res = engine.applyMove(st, mv[0], mv[1], mv[2]);
        flags.push(res.events.trayRefilled);
        st = res.state;
      }
      return { st, flags };
    };
    const a = run(31);
    const b = run(31);
    expect(a.flags.length).toBe(3);
    expect(a.flags[0]).toBe(false);
    expect(a.flags[1]).toBe(false);
    expect(a.flags[2]).toBe(true); // third placement empties the tray -> refill
    expect(a.st.tray.filter(Boolean)).toHaveLength(3);
    expect(b.st).toEqual(a.st);
  });
});

// ---------------------------------------------------------------------------
// stuck / game over detection
// ---------------------------------------------------------------------------

describe('stuck detection', () => {
  it('a board with no legal placement for any tray piece is stuck at creation', () => {
    const s = engine.createGameState({ rows: 1, cols: 1, seed: 9, obstacles: [[0, 0]] });
    expect(engine.isStuck(s)).toBe(true);
    expect(s.status).toBe('stuck');
  });

  it('crafted board: only a 1x1 gap and no dot in tray -> stuck', () => {
    const s = engine.createGameState({ rows: 3, cols: 3, seed: 2 });
    setBoard(s, (r, c) => (r === 2 && c === 2 ? 0 : 1));
    s.tray = [piece('sq2'), null, piece('bar3h', 2)];
    expect(engine.anyValidPlacement(s.board, s.tray)).toBe(false);
    expect(engine.isStuck(s)).toBe(true);
    // the same board with a dot in tray is not stuck
    s.tray = [piece('dot'), null, null];
    expect(engine.isStuck(s)).toBe(false);
  });

  it('play on a tiny board until no moves remain -> status stuck; later moves rejected', () => {
    // pick the first seed whose initial tray has a piece that fits (deterministic)
    let seed = 1;
    let st = engine.createGameState({ rows: 2, cols: 2, seed, obstacles: [[0, 0]] });
    while (engine.isStuck(st) && seed < 50) {
      seed++;
      st = engine.createGameState({ rows: 2, cols: 2, seed, obstacles: [[0, 0]] });
    }
    expect(engine.isStuck(st)).toBe(false);

    let iterations = 0;
    while (iterations < 40) {
      const mv = firstLegal(st);
      if (!mv) break;
      st = engine.applyMove(st, mv[0], mv[1], mv[2]).state;
      iterations++;
    }
    expect(iterations).toBeGreaterThan(0);
    expect(st.status).toBe('stuck');
    expect(engine.isStuck(st)).toBe(true);

    const frozen = JSON.parse(JSON.stringify(st));
    const res = engine.applyMove(st, 0, 0, 0);
    expect(res.events.placed).toBe(false);
    expect(res.state).toEqual(frozen);
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip / replay stability
// ---------------------------------------------------------------------------

describe('JSON round-trip stability', () => {
  it('a replayed game from a JSON clone is bit-identical (incl. moveHashes)', () => {
    const original = engine.createGameState({ rows: 8, cols: 8, seed: 21 });
    const moves: [number, number, number][] = [];
    let st = original;
    for (let i = 0; i < 6; i++) {
      const mv = firstLegal(st);
      if (!mv) break;
      moves.push(mv);
      st = engine.applyMove(st, mv[0], mv[1], mv[2]).state;
    }
    expect(moves.length).toBeGreaterThan(0);

    const clone = JSON.parse(JSON.stringify(original)) as GameState;
    let replayed = clone;
    for (const [t, r, c] of moves) {
      replayed = engine.applyMove(replayed, t, r, c).state;
    }
    expect(replayed).toEqual(st);
    expect(replayed.moveHashes).toEqual(st.moveHashes);
    expect(replayed.rngState).toBe(st.rngState);
  });

  it('moveHashes: one deterministic entry per move', () => {
    const s = engine.createGameState({ rows: 8, cols: 8, seed: 33 });
    let st = s;
    for (let i = 0; i < 5; i++) {
      const mv = firstLegal(st);
      if (!mv) break;
      const before = st.moveHashes.length;
      st = engine.applyMove(st, mv[0], mv[1], mv[2]).state;
      expect(st.moveHashes.length).toBe(before + 1);
      expect(st.moveHashes[st.moveHashes.length - 1]).toMatch(/^[0-9a-f]{8}$/);
    }
    // hashes differ across different boards
    expect(new Set(st.moveHashes).size).toBe(st.moveHashes.length);
  });
});

// ---------------------------------------------------------------------------
// objective evaluation
// ---------------------------------------------------------------------------

describe('evaluateObjective', () => {
  const state = () => engine.createGameState({ rows: 8, cols: 8, seed: 1 });

  it('targetScore: complete at/above target (even while active), stars by thresholds', () => {
    const lvl = levelWith({ kind: 'targetScore', target: 100 });
    expect(engine.evaluateObjective(lvl, { ...state(), score: 100 }).complete).toBe(true);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 100 }).stars).toBe(1);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 210 }).stars).toBe(2);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 450 }).stars).toBe(3);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 99 }).complete).toBe(false);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 99 }).stars).toBe(0);
    // complete but under t1 (target < t1 edge) still earns 1 star
    const lvl2 = levelWith({ kind: 'targetScore', target: 50 });
    expect(engine.evaluateObjective(lvl2, { ...state(), score: 60 }).stars).toBe(1);
  });

  it('scoreWithinMoves: complete only when limit reached or game ended', () => {
    const lvl = levelWith({ kind: 'scoreWithinMoves', moveLimit: 10, target: 100 });
    expect(engine.evaluateObjective(lvl, { ...state(), score: 150, moves: 5 }).complete).toBe(false);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 150, moves: 10 }).complete).toBe(true);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 150, moves: 10 }).stars).toBe(1);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 150, moves: 3, status: 'stuck' }).complete).toBe(true);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 99, moves: 10 }).complete).toBe(false);
    expect(engine.evaluateObjective(lvl, { ...state(), score: 99, moves: 10 }).stars).toBe(0);
  });

  it('lineClears and combo objectives read the exposed counters', () => {
    const lc = levelWith({ kind: 'lineClears', requiredLines: 4 });
    expect(engine.evaluateObjective(lc, { ...state(), linesCleared: 4 }).complete).toBe(true);
    expect(engine.evaluateObjective(lc, { ...state(), linesCleared: 4 }).stars).toBe(3);
    expect(engine.evaluateObjective(lc, { ...state(), linesCleared: 3 }).complete).toBe(false);

    const cb = levelWith({ kind: 'combo', comboTarget: 3 });
    expect(engine.evaluateObjective(cb, { ...state(), longestCombo: 3 }).complete).toBe(true);
    expect(engine.evaluateObjective(cb, { ...state(), longestCombo: 2 }).complete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// standalone pickShape helper
// ---------------------------------------------------------------------------

describe('pickShape', () => {
  it('is deterministic per state and stays inside the catalog', () => {
    expect(pickShape(seedToState(5))).toEqual(pickShape(seedToState(5)));
    const ids = new Set(SHAPES.map(s => s.id));
    for (let i = 0; i < 50; i++) {
      expect(ids.has(pickShape(seedToState(i)).shapeId)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// performance
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('300 random games on 8x8 complete well under 30s', () => {
    const t0 = Date.now();
    let gamesPlayed = 0;
    let totalMoves = 0;
    for (let g = 0; g < 300; g++) {
      let st = engine.createGameState({ rows: 8, cols: 8, seed: g + 1 });
      let lcg = (Math.imul(g + 1, 2654435761) + 1) >>> 0;
      gamesPlayed++;
      for (let m = 0; m < 150; m++) {
        const moves: [number, number, number][] = [];
        for (let t = 0; t < 3; t++) {
          const p = st.tray[t];
          if (!p) continue;
          for (let r = 0; r < st.rows; r++) {
            for (let c = 0; c < st.cols; c++) {
              if (engine.canPlaceAt(st.board, p.cells, r, c)) moves.push([t, r, c]);
            }
          }
        }
        if (moves.length === 0) break;
        lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
        const [t, r, c] = moves[lcg % moves.length];
        st = engine.applyMove(st, t, r, c).state;
        totalMoves++;
        if (st.status !== 'active') break;
      }
    }
    const elapsed = Date.now() - t0;
    expect(gamesPlayed).toBe(300);
    expect(totalMoves).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`300 games / ${totalMoves} moves in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(30000);
  });
});
