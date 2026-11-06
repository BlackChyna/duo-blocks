import { describe, expect, it } from 'vitest';
import {
  CATCH_RADIUS_CELLS,
  boundingBox,
  cellsUnderGhost,
  type BoardRect,
} from '../../src/features/game/board/geometry';

/** 8×8 board whose top-left sits at (100, 100), rendered at 40px cells → 320×320. */
const RECT: BoardRect = { left: 100, top: 100, width: 320, height: 320 };
const CELL = 40;

/** Anchor expected for a 1×1 dot piece at pointer (x, y) over RECT. */
function dotAnchor(x: number, y: number): { r: number; c: number } {
  return {
    r: Math.min(Math.max(Math.round((y - 20 - 100) / CELL), 0), 7),
    c: Math.min(Math.max(Math.round((x - 20 - 100) / CELL), 0), 7),
  };
}

describe('boundingBox', () => {
  it('measures the bounding box of cell offsets', () => {
    expect(boundingBox([[0, 0]])).toEqual({ w: 1, h: 1 });
    expect(boundingBox([
      [0, 0],
      [0, 1],
      [0, 2],
    ])).toEqual({ w: 3, h: 1 });
    expect(boundingBox([
      [0, 1],
      [2, 0],
    ])).toEqual({ w: 2, h: 3 });
  });

  it('handles offsets that do not start at the origin', () => {
    expect(boundingBox([
      [0, 2],
      [1, 2],
    ])).toEqual({ w: 3, h: 2 });
  });
});

describe('cellsUnderGhost', () => {
  const dot: [number, number][] = [[0, 0]];

  it('returns null for degenerate inputs', () => {
    expect(cellsUnderGhost(RECT, 0, dot, 240, 240)).toBeNull();
    expect(cellsUnderGhost(RECT, -5, dot, 240, 240)).toBeNull();
    expect(cellsUnderGhost(RECT, CELL, [], 240, 240)).toBeNull();
    expect(cellsUnderGhost({ left: 0, top: 0, width: 0, height: 0 }, CELL, dot, 0, 0)).toBeNull();
  });

  it('returns null when the piece cannot fit the board at all', () => {
    const huge: [number, number][] = [
      [0, 0],
      [0, 8],
    ]; // 9 wide > 8 cols
    expect(cellsUnderGhost(RECT, CELL, huge, 260, 260)).toBeNull();
  });

  it('centres the ghost on the pointer and snaps to the nearest cell', () => {
    // pointer at the centre of cell (3,3): client coords 100+3*40+20 = 240
    expect(cellsUnderGhost(RECT, CELL, dot, 240, 240)).toEqual({ r: 3, c: 3 });
    // centre of cell (1,7): x = 100+1*40+20 = 160, y = 100+7*40+20 = 400
    expect(cellsUnderGhost(RECT, CELL, dot, 160, 400)).toEqual({ r: 7, c: 1 });
  });

  it('keeps the anchor consistent across the whole cell the pointer is over', () => {
    // Any pointer position inside cell (2,5) must anchor at (2,5) for a dot.
    for (const dx of [2, 20, 38]) {
      for (const dy of [2, 20, 38]) {
        const x = 100 + 5 * CELL + dx;
        const y = 100 + 2 * CELL + dy;
        expect(cellsUnderGhost(RECT, CELL, dot, x, y)).toEqual(dotAnchor(x, y));
        expect(cellsUnderGhost(RECT, CELL, dot, x, y)).toEqual({ r: 2, c: 5 });
      }
    }
  });

  it('is forgiving at the edges: clamps instead of losing the drop', () => {
    // 3-wide bar dragged half off the left edge still anchors at c=0.
    const bar3: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    expect(cellsUnderGhost(RECT, CELL, bar3, 115, 260)).toEqual({ r: 4, c: 0 });
    // Dragged past the right edge (within catch radius) clamps to c = cols-w.
    expect(cellsUnderGhost(RECT, CELL, bar3, 500, 260)).toEqual({ r: 4, c: 5 });
  });

  it('returns null beyond the catch radius around the board', () => {
    const catchPx = CATCH_RADIUS_CELLS * CELL;
    expect(cellsUnderGhost(RECT, CELL, dot, 100 - catchPx - 1, 260)).toBeNull();
    expect(cellsUnderGhost(RECT, CELL, dot, 420 + catchPx + 1, 260)).toBeNull();
    expect(cellsUnderGhost(RECT, CELL, dot, 240, 100 - catchPx - 1)).toBeNull();
    expect(cellsUnderGhost(RECT, CELL, dot, 240, 420 + catchPx + 1)).toBeNull();
    // Just inside the radius it still resolves (clamped anchor).
    expect(cellsUnderGhost(RECT, CELL, dot, 240, 100 - catchPx + 1)).toEqual({ r: 0, c: 3 });
  });

  it('works on non-square boards with taller-than-wide pieces', () => {
    const rect: BoardRect = { left: 0, top: 0, width: 320, height: 160 }; // 8 cols × 4 rows @ 40px
    const vbar: [number, number][] = [
      [0, 0],
      [1, 0],
    ]; // 1 wide, 2 tall
    // ghostTop = 80 - (2*40)/2 = 40 → rawR = 1, within [0, rows-h=2]
    expect(cellsUnderGhost(rect, CELL, vbar, 20, 80)).toEqual({ r: 1, c: 0 });
  });
});
