import type { Chapter, LevelDef } from '../../types/game';
import data from './levels.json';

/** The full 500-level campaign catalogue, in order (L0001 … L0500). */
export const LEVELS = data.levels as LevelDef[];

/** Fast lookup by permanent level id. */
export const LEVEL_BY_ID: Map<string, LevelDef> = new Map(LEVELS.map((level) => [level.id, level]));

/** The 10 campaign chapters, 50 levels each. */
export const CHAPTERS: Chapter[] = [
  { index: 1, title: 'Foundations', blurb: 'Learn the grid: place blocks, clear lines, find your rhythm.', fromLevel: 1, toLevel: 50 },
  { index: 2, title: 'Line Logic', blurb: 'Full rows and columns are the goal — chase every clean sweep.', fromLevel: 51, toLevel: 100 },
  { index: 3, title: 'Crossroads', blurb: 'Obstacles appear. Read the board before you commit a piece.', fromLevel: 101, toLevel: 150 },
  { index: 4, title: 'Obstacles', blurb: 'The grid fights back. Route around the stone within a move budget.', fromLevel: 151, toLevel: 200 },
  { index: 5, title: 'Move Masters', blurb: 'Every move counts. Spend them like gold and make each one matter.', fromLevel: 201, toLevel: 250 },
  { index: 6, title: 'Combo Lab', blurb: 'Chain clears back to back and keep the streak burning.', fromLevel: 251, toLevel: 300 },
  { index: 7, title: 'Precision Play', blurb: 'Small boards, tighter targets, zero wasted cells.', fromLevel: 301, toLevel: 350 },
  { index: 8, title: 'Advanced Tactics', blurb: 'Dense, blocked grids that demand multi-move plans.', fromLevel: 351, toLevel: 400 },
  { index: 9, title: 'Expert Grid', blurb: 'Tall targets and tight limits. No mercy, no filler.', fromLevel: 401, toLevel: 450 },
  { index: 10, title: 'Duo Legends', blurb: 'Everything at once, at maximum intensity. Become a legend.', fromLevel: 451, toLevel: 500 },
];
