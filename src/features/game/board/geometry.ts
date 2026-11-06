/**
 * Pure drag-geometry helpers for the block board.
 * No DOM in here — plain rects/numbers in, plain values out, trivially testable
 * (tests run in the node vitest environment).
 */

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Piece anchor: the board cell (row, col) of the piece's bounding-box top-left. */
export interface PieceAnchor {
  r: number;
  c: number;
}

/**
 * How far outside the board a drop still counts (in cells, measured from the
 * pointer / ghost centre, per axis). Makes edge drops forgiving on touch.
 */
export const CATCH_RADIUS_CELLS = 2;

/** Bounding box (w × h in cells) of a piece's cell list ([row, col] offsets). */
export function boundingBox(cells: ReadonlyArray<[number, number]>): { w: number; h: number } {
  let maxR = -1;
  let maxC = -1;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { w: maxC + 1, h: maxR + 1 };
}

/**
 * Which board cell the dragged piece's anchor (bounding-box top-left) maps to.
 *
 * The ghost floats centred on the pointer. The anchor is the ghost's top-left
 * corner snapped to the nearest cell, clamped so the piece stays fully on the
 * board — engine.canPlaceAt then only has to rule on occupancy and obstacles.
 *
 * Returns null when there is no meaningful drop target: degenerate inputs,
 * a piece larger than the board, or the pointer further than
 * CATCH_RADIUS_CELLS outside the board on either axis.
 */
export function cellsUnderGhost(
  boardRect: BoardRect,
  cellSize: number,
  pieceCells: ReadonlyArray<[number, number]>,
  pointerX: number,
  pointerY: number,
): PieceAnchor | null {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) return null;
  if (!(boardRect.width > 0) || !(boardRect.height > 0)) return null;
  if (pieceCells.length === 0) return null;

  const cols = Math.round(boardRect.width / cellSize);
  const rows = Math.round(boardRect.height / cellSize);
  if (cols <= 0 || rows <= 0) return null;

  const { w, h } = boundingBox(pieceCells);
  if (w > cols || h > rows) return null;

  // Miss entirely when the pointer is well outside the board.
  const catchPx = CATCH_RADIUS_CELLS * cellSize;
  if (
    pointerX < boardRect.left - catchPx ||
    pointerX > boardRect.left + boardRect.width + catchPx ||
    pointerY < boardRect.top - catchPx ||
    pointerY > boardRect.top + boardRect.height + catchPx
  ) {
    return null;
  }

  const ghostLeft = pointerX - (w * cellSize) / 2;
  const ghostTop = pointerY - (h * cellSize) / 2;

  const rawC = Math.round((ghostLeft - boardRect.left) / cellSize);
  const rawR = Math.round((ghostTop - boardRect.top) / cellSize);

  const c = Math.min(Math.max(rawC, 0), cols - w);
  const r = Math.min(Math.max(rawR, 0), rows - h);
  return { r, c };
}
