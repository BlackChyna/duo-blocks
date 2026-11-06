/**
 * DUO BLOCKS — shape catalog (original, deterministic cell offsets).
 * No third-party/block-blast assets: every shape is defined by its own
 * [row, col] offsets inside a w x h bounding box anchored at (0, 0).
 */
import type { ColorKey, ShapeDef } from '../../../types/game';

/** Palette keys used for tray pieces. */
export const COLOR_KEYS: ColorKey[] = ['violet', 'cyan', 'coral', 'yellow', 'mint'];

/**
 * The catalog. Order matters: tray draws pick indexes uniformly, so the
 * order is part of the deterministic block sequence for a given seed.
 */
export const SHAPES: ShapeDef[] = [
  { id: 'dot',     name: 'Dot',        cells: [[0, 0]],                             w: 1, h: 1 },
  { id: 'bar2h',   name: 'Bar 2',      cells: [[0, 0], [0, 1]],                     w: 2, h: 1 },
  { id: 'bar2v',   name: 'Bar 2',      cells: [[0, 0], [1, 0]],                     w: 1, h: 2 },
  { id: 'bar3h',   name: 'Bar 3',      cells: [[0, 0], [0, 1], [0, 2]],             w: 3, h: 1 },
  { id: 'bar3v',   name: 'Bar 3',      cells: [[0, 0], [1, 0], [2, 0]],             w: 1, h: 3 },
  { id: 'bar4h',   name: 'Bar 4',      cells: [[0, 0], [0, 1], [0, 2], [0, 3]],     w: 4, h: 1 },
  { id: 'bar4v',   name: 'Bar 4',      cells: [[0, 0], [1, 0], [2, 0], [3, 0]],     w: 1, h: 4 },
  { id: 'sq2',     name: 'Square',     cells: [[0, 0], [0, 1], [1, 0], [1, 1]],     w: 2, h: 2 },
  { id: 'L3a',     name: 'Corner',     cells: [[0, 0], [1, 0], [1, 1]],             w: 2, h: 2 },
  { id: 'L3b',     name: 'Corner',     cells: [[0, 0], [0, 1], [1, 0]],             w: 2, h: 2 },
  { id: 'L3c',     name: 'Corner',     cells: [[0, 0], [0, 1], [1, 1]],             w: 2, h: 2 },
  { id: 'L3d',     name: 'Corner',     cells: [[0, 1], [1, 0], [1, 1]],             w: 2, h: 2 },
  { id: 'T4a',     name: 'Tee',        cells: [[0, 0], [0, 1], [0, 2], [1, 1]],     w: 3, h: 2 },
  { id: 'T4b',     name: 'Tee',        cells: [[0, 1], [1, 0], [1, 1], [1, 2]],     w: 3, h: 2 },
  { id: 'S4',      name: 'Ess',        cells: [[0, 1], [0, 2], [1, 0], [1, 1]],     w: 3, h: 2 },
  { id: 'Z4',      name: 'Zee',        cells: [[0, 0], [0, 1], [1, 1], [1, 2]],     w: 3, h: 2 },
  { id: 'L4',      name: 'Ell',        cells: [[0, 0], [1, 0], [2, 0], [2, 1]],     w: 2, h: 3 },
  { id: 'J4',      name: 'Jay',        cells: [[0, 1], [1, 1], [2, 0], [2, 1]],     w: 2, h: 3 },
  { id: 'corner5', name: 'Big Corner', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], w: 3, h: 3 },
  { id: 'cross5',  name: 'Cross',      cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], w: 3, h: 3 },
];

/** Look a shape up by its stable id. */
export function shapeById(id: string): ShapeDef | undefined {
  return SHAPES.find(s => s.id === id);
}
