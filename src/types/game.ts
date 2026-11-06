/**
 * DUO BLOCKS — core game type contracts.
 * EVERY module (engine, levels, UI, services) codes against these types.
 * Do not change a contract in one place without updating the other.
 */

// ---------------------------------------------------------------------------
// Board & shapes
// ---------------------------------------------------------------------------

/** Board cell: 0 = empty, 1 = filled block, 2 = obstacle (never cleared, blocks placement). */
export type Cell = 0 | 1 | 2;
export type Board = Cell[][]; // [row][col]

export type ColorKey = 'violet' | 'cyan' | 'coral' | 'yellow' | 'mint';

export interface ShapeDef {
  id: string; // stable id, e.g. 'dot', 'bar2h', 'L3'
  name: string;
  cells: [number, number][]; // [row, col] offsets within the bounding box
  w: number; // bounding-box width
  h: number; // bounding-box height
}

/** A piece instance in the player's tray of 3. */
export interface TrayPiece {
  trayIndex: number; // 0 | 1 | 2
  shapeId: string;
  color: ColorKey;
  cells: [number, number][];
  w: number;
  h: number;
}

export interface MoveRecord {
  trayIndex: number;
  r: number;
  c: number;
  moveNumber: number;
}

// ---------------------------------------------------------------------------
// Scoring (versioned)
// ---------------------------------------------------------------------------

/** SCORING VERSION — bump when rules change; never retroactively edit past rules. */
export const SCORING_VERSION = 1;
/**
 * v1 rules:
 *  - 10 points per placed cell
 *  - 100 points per cleared line
 *  - multi-line bonus: 50 * n(n-1)/2 for n lines cleared in one move  (1 line: 0, 2 lines: 50, 3: 150 …)
 *  - combo bonus: 25 * (combo-1) on a clearing move that extends a combo streak
 */
export interface ScoreRuleVersion {
  version: number;
  cellPoints: number;
  linePoints: number;
  multiLineBonusPerExtraPair: number;
  comboBonusPerStreakStep: number;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export type Objective =
  | { kind: 'targetScore'; target: number }
  | { kind: 'scoreWithinMoves'; moveLimit: number; target: number }
  | { kind: 'lineClears'; requiredLines: number; moveLimit?: number }
  | { kind: 'combo'; comboTarget: number; moveLimit?: number };

export interface LevelDef {
  id: string; // 'L0001' … permanent, never renumbered
  number: number; // 1…500
  chapter: number; // 1…10
  name: string; // from the chapter-word catalogue
  difficulty: 1 | 2 | 3 | 4 | 5;
  objective: Objective;
  boardRows: number;
  boardCols: number;
  obstacles: [number, number][]; // cells pre-filled as Cell=2
  seed: number; // deterministic block sequence seed
  /** [1,2,3]-star thresholds shown for score objectives; lineClears/combo objectives award stars on completion. */
  starThresholds: [number, number, number];
}

export interface Chapter {
  index: number; // 1…10
  title: string;
  blurb: string;
  fromLevel: number; // inclusive level numbers
  toLevel: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type GameStatus = 'active' | 'won' | 'stuck' | 'moves exhausted';

export interface GameEvents {
  placed: boolean;
  cellsPlaced: number;
  linesCleared: number;
  clearedCells: [number, number][];
  pointsEarned: number;
  comboBefore: number;
  comboAfter: number;
  trayRefilled: boolean;
  status: GameStatus;
  objectiveComplete: boolean;
}

export interface GameState {
  rows: number;
  cols: number;
  board: Board;
  tray: (TrayPiece | null)[]; // length 3; null while a refill is conceptually pending
  seed: number; // starting seed
  rngState: number; // current PRNG state — serialize this, not the instance
  score: number;
  moves: number;
  linesCleared: number;
  longestCombo: number;
  combo: number; // current streak
  blocksPlaced: number;
  status: GameStatus;
  history: MoveRecord[];
  /** Hash of the board state after every move — used for result validation. */
  moveHashes: string[];
}

export interface GameConfig {
  rows: number;
  cols: number;
  seed: number;
  obstacles?: [number, number][];
}

export interface EngineApi {
  createGameState(config: GameConfig): GameState;
  /** Returns the SAME state object unchanged (plus an event with placed:false) if the move is illegal. */
  applyMove(state: GameState, trayIndex: number, r: number, c: number): { state: GameState; events: GameEvents };
  canPlaceAt(board: Board, pieceCells: [number, number][], r: number, c: number): boolean;
  anyValidPlacement(board: Board, tray: (TrayPiece | null)[]): boolean;
  isStuck(state: GameState): boolean;
  /** Evaluate an objective against a state; returns stars earned at game end. */
  evaluateObjective(level: LevelDef, state: GameState): { complete: boolean; stars: 0 | 1 | 2 | 3 };
}

// ---------------------------------------------------------------------------
// Services / persistence contracts (src/types/services.ts is authoritative
// for DB shapes, but the cross-cutting ones live here too)
// ---------------------------------------------------------------------------

export type GameMode = 'campaign' | 'endless' | 'duel' | 'daily' | 'challenge';

export interface GameSession {
  mode: GameMode;
  level: LevelDef | null; // null = endless/daily-less modes
  state: GameState;
  finished: boolean;
  won: boolean;
}

export interface PlayerLocalProgress {
  highestScore: number; // all-time, any mode
  levels: Record<string, { completedAt: string; stars: 0 | 1 | 2 | 3; bestScore: number }>; // key = LevelDef.id
  endless: { best: number; blocksPlaced: number; linesCleared: number; longestCombo: number; games: number };
  stats: { totalBlocks: number; totalLines: number; winStreak: number; longestWinStreak: number };
  lastSavedAt: string;
}
