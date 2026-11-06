/**
 * DUO BLOCKS — the pure game engine (no React, no I/O, no wall-clock).
 *
 * Semantics:
 *  - applyMove returns the SAME state object (unchanged) plus placed:false for
 *    illegal moves; legal moves return a brand-new state (input never mutated).
 *  - The engine only ever sets status 'active' | 'stuck'; 'won' and
 *    'moves exhausted' are decided by the gameStore, which owns the level
 *    context (move limits, early win detection).
 *  - events.objectiveComplete is always false from the engine: it has no level
 *    context. Callers evaluate objectives via evaluateObjective(level, state).
 *    lineClears/combo objectives are trackable through the state counters.
 */
import type { EngineApi, GameConfig, GameEvents, GameStatus, GameState, LevelDef, TrayPiece } from '../../../types/game';
import { SHAPES } from './shapes';
import { next, seedToState } from './prng';
import { SCORING_RULES, scoreMove } from './scoring';
import {
  anyValidPlacement,
  canPlaceAt,
  clearLines,
  createBoard,
  hashState,
  pickTray,
  place,
} from './core';

export { SHAPES };
export { SCORING_RULES, scoreMove };
export { next, seedToState };

/** Draw a single shape id from a PRNG state (standalone helper for other modules). */
export function pickShape(rngState: number): { shapeId: string } {
  const [, v] = next(rngState);
  const idx = Math.min(SHAPES.length - 1, Math.floor(v * SHAPES.length));
  return { shapeId: SHAPES[idx].id };
}

function statusFor(board: GameState['board'], tray: (TrayPiece | null)[]): GameStatus {
  return anyValidPlacement(board, tray) ? 'active' : 'stuck';
}

function starsForScore(score: number, thresholds: [number, number, number], complete: boolean): 0 | 1 | 2 | 3 {
  const [t1, t2, t3] = thresholds;
  if (score >= t3) return 3;
  if (score >= t2) return 2;
  if (score >= t1) return 1;
  return complete ? 1 : 0;
}

export const engine: EngineApi = {
  createGameState(config: GameConfig): GameState {
    const board = createBoard(config.rows, config.cols, config.obstacles ?? []);
    const picked = pickTray(seedToState(config.seed));
    const state: GameState = {
      rows: config.rows,
      cols: config.cols,
      board,
      tray: picked.tray,
      seed: config.seed,
      rngState: picked.rngState,
      score: 0,
      moves: 0,
      linesCleared: 0,
      longestCombo: 0,
      combo: 0,
      blocksPlaced: 0,
      status: statusFor(board, picked.tray),
      history: [],
      moveHashes: [],
    };
    return state;
  },

  applyMove(state: GameState, trayIndex: number, r: number, c: number): { state: GameState; events: GameEvents } {
    const piece = trayIndex >= 0 && trayIndex < state.tray.length ? state.tray[trayIndex] : null;
    if (!piece || !canPlaceAt(state.board, piece.cells, r, c)) {
      const events: GameEvents = {
        placed: false,
        cellsPlaced: 0,
        linesCleared: 0,
        clearedCells: [],
        pointsEarned: 0,
        comboBefore: state.combo,
        comboAfter: state.combo,
        trayRefilled: false,
        status: state.status,
        objectiveComplete: false,
      };
      return { state, events }; // SAME object, unchanged
    }

    // --- legal move: build the next state immutably ---
    const cellsPlaced = piece.cells.length;
    const comboBefore = state.combo;

    let board = place(state.board, piece.cells, r, c);
    const { board: clearedBoard, clearedCells, count } = clearLines(board);
    board = clearedBoard;
    const lines = count;

    const pointsEarned = scoreMove(cellsPlaced, lines, comboBefore);
    const comboAfter = lines > 0 ? comboBefore + 1 : 0;

    const tray: (TrayPiece | null)[] = state.tray.slice();
    tray[trayIndex] = null;

    let trayRefilled = false;
    let rngState = state.rngState;
    let trayOut: (TrayPiece | null)[] = tray;
    if (tray.every(t => t === null)) {
      const picked = pickTray(rngState);
      trayOut = picked.tray;
      rngState = picked.rngState;
      trayRefilled = true;
    }

    const status = statusFor(board, trayOut);
    const moveNumber = state.moves + 1;
    const hash = hashState(board, rngState);

    const newState: GameState = {
      ...state,
      board,
      tray: trayOut,
      rngState,
      score: state.score + pointsEarned,
      moves: moveNumber,
      linesCleared: state.linesCleared + lines,
      longestCombo: Math.max(state.longestCombo, comboAfter),
      combo: comboAfter,
      blocksPlaced: state.blocksPlaced + cellsPlaced,
      status,
      history: [...state.history, { trayIndex, r, c, moveNumber }],
      moveHashes: [...state.moveHashes, hash],
    };

    const events: GameEvents = {
      placed: true,
      cellsPlaced,
      linesCleared: lines,
      clearedCells,
      pointsEarned,
      comboBefore,
      comboAfter,
      trayRefilled,
      status,
      objectiveComplete: false, // engine has no level context; gameStore decides
    };
    return { state: newState, events };
  },

  canPlaceAt,

  anyValidPlacement,

  isStuck(state: GameState): boolean {
    return !anyValidPlacement(state.board, state.tray);
  },

  evaluateObjective(level: LevelDef, state: GameState): { complete: boolean; stars: 0 | 1 | 2 | 3 } {
    const obj = level.objective;
    let complete = false;
    let stars: 0 | 1 | 2 | 3 = 0;

    switch (obj.kind) {
      case 'targetScore': {
        // Reached the target -> complete, whether the game is still active or over.
        complete = state.score >= obj.target;
        stars = starsForScore(state.score, level.starThresholds, complete);
        break;
      }
      case 'scoreWithinMoves': {
        // Complete only once the attempt has ended (move limit reached or the
        // player is stuck/won) AND the score target is met.
        const ended = state.status !== 'active' || state.moves >= obj.moveLimit;
        complete = ended && state.score >= obj.target;
        stars = complete ? starsForScore(state.score, level.starThresholds, true) : 0;
        break;
      }
      case 'lineClears': {
        complete = state.linesCleared >= obj.requiredLines;
        stars = complete ? 3 : 0;
        break;
      }
      case 'combo': {
        complete = state.longestCombo >= obj.comboTarget;
        stars = complete ? 3 : 0;
        break;
      }
    }
    return { complete, stars };
  },
};
