/**
 * DUO BLOCKS — pure board helpers: placement, clearing, hashing, tray refill.
 * Boards are immutable-by-convention: helpers return new arrays, never mutate.
 * Determinism: no Date.now(), no Math.random() — draws go through prng.next().
 */
import type { Board, Cell, ColorKey, TrayPiece } from '../../../types/game';
import { COLOR_KEYS, SHAPES } from './shapes';
import { next } from './prng';

/** Build an empty board and stamp obstacles as Cell=2 (out-of-range obstacles ignored). */
export function createBoard(rows: number, cols: number, obstacles: [number, number][] = []): Board {
  const board: Board = [];
  for (let r = 0; r < rows; r++) board.push(new Array<Cell>(cols).fill(0));
  for (const [r, c] of obstacles) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) board[r][c] = 2;
  }
  return board;
}

/** True if every cell of the piece fits at (r, c): in bounds and on an empty (0) cell. */
export function canPlaceAt(board: Board, cells: [number, number][], r: number, c: number): boolean {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  for (let i = 0; i < cells.length; i++) {
    const rr = r + cells[i][0];
    const cc = c + cells[i][1];
    if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return false;
    if (board[rr][cc] !== 0) return false;
  }
  return true;
}

/** Place a piece: returns a NEW board with the piece cells set to Cell=1. */
export function place(board: Board, cells: [number, number][], r: number, c: number): Board {
  const nextBoard = board.map(row => row.slice());
  for (let i = 0; i < cells.length; i++) {
    nextBoard[r + cells[i][0]][c + cells[i][1]] = 1;
  }
  return nextBoard;
}

/**
 * Clear full lines. A line (row or column) is complete only when EVERY cell in
 * it is Cell=1 — an obstacle (Cell=2) blocks its line from ever clearing, so
 * obstacles never clear and never count. Returns the cleared cells (row-major,
 * intersections deduped) and how many lines were cleared.
 */
export function clearLines(board: Board): { board: Board; clearedCells: [number, number][]; count: number } {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;

  const fullRows: number[] = [];
  for (let r = 0; r < rows; r++) {
    let full = true;
    for (let c = 0; c < cols; c++) {
      if (board[r][c] !== 1) { full = false; break; }
    }
    if (full) fullRows.push(r);
  }
  const fullCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    let full = true;
    for (let r = 0; r < rows; r++) {
      if (board[r][c] !== 1) { full = false; break; }
    }
    if (full) fullCols.push(c);
  }

  if (fullRows.length === 0 && fullCols.length === 0) {
    return { board, clearedCells: [], count: 0 };
  }

  const cleared = board.map(row => row.slice());
  const clearedCells: [number, number][] = [];
  for (let i = 0; i < fullRows.length; i++) {
    const r = fullRows[i];
    for (let c = 0; c < cols; c++) { cleared[r][c] = 0; clearedCells.push([r, c]); }
  }
  for (let i = 0; i < fullCols.length; i++) {
    const c = fullCols[i];
    for (let r = 0; r < rows; r++) {
      if (cleared[r][c] === 1) { cleared[r][c] = 0; clearedCells.push([r, c]); }
    }
  }
  return { board: cleared, clearedCells, count: fullRows.length + fullCols.length };
}

/** True if the piece has at least one legal placement anywhere on the board. */
export function pieceFitsSomewhere(board: Board, cells: [number, number][]): boolean {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canPlaceAt(board, cells, r, c)) return true;
    }
  }
  return false;
}

/** True if any non-null tray piece has a legal placement (i.e. not stuck). */
export function anyValidPlacement(board: Board, tray: (TrayPiece | null)[]): boolean {
  for (let i = 0; i < tray.length; i++) {
    const p = tray[i];
    if (p && pieceFitsSomewhere(board, p.cells)) return true;
  }
  return false;
}

/** FNV-1a 32-bit hash, hex-encoded — deterministic across devices. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash of the board cells plus the PRNG state — one entry per applied move. */
export function hashState(board: Board, rngState: number): string {
  let text = '';
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) text += row[c];
  }
  return fnv1a(text + '|' + (rngState >>> 0).toString(16));
}

/**
 * Draw the next tray: 3 pieces with DISTINCT shapes and DISTINCT colors,
 * deterministically from the given PRNG state. Returns the advanced state.
 */
export function pickTray(rngState: number): { tray: (TrayPiece | null)[]; rngState: number } {
  let s = rngState;

  const shapeIdx: number[] = [];
  while (shapeIdx.length < 3) {
    const [s2, v] = next(s);
    s = s2;
    const i = Math.min(SHAPES.length - 1, Math.floor(v * SHAPES.length));
    if (!shapeIdx.includes(i)) shapeIdx.push(i);
  }

  const colors: ColorKey[] = [];
  while (colors.length < 3) {
    const [s2, v] = next(s);
    s = s2;
    const color = COLOR_KEYS[Math.min(COLOR_KEYS.length - 1, Math.floor(v * COLOR_KEYS.length))];
    if (!colors.includes(color)) colors.push(color);
  }

  const tray: (TrayPiece | null)[] = shapeIdx.map((shapeIndex, slot) => {
    const sh = SHAPES[shapeIndex];
    return {
      trayIndex: slot,
      shapeId: sh.id,
      color: colors[slot],
      cells: sh.cells.map(([r, c]) => [r, c] as [number, number]),
      w: sh.w,
      h: sh.h,
    };
  });
  return { tray, rngState: s };
}
