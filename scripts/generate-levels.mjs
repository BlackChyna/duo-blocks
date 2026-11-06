#!/usr/bin/env node
/**
 * DUO BLOCKS — deterministic level catalogue generator.
 *
 *   node scripts/generate-levels.mjs
 *
 * Writes src/data/levels/levels.json = { "version": "1.0.0", "levels": LevelDef[500] }.
 *
 * Fully deterministic: fixed word pools + mulberry32 PRNG. Every per-level
 * choice (board dims, obstacles, objective numbers, name order) is driven by
 * that level's seed = 100000 + number * 7919 (unique per level), so re-running
 * this script reproduces byte-identical output. No Math.random, no Date.now.
 *
 * Chapter plan (50 levels each, difficulty cap rising 2→5):
 *   1 Foundations      targetScore 300-800, no obstacles
 *   2 Line Logic       lineClears 3-10
 *   3 Crossroads       targetScore + light obstacles (4-10)
 *   4 Obstacles        scoreWithinMoves, obstacles 10-25
 *   5 Move Masters     scoreWithinMoves, 15-40 moves
 *   6 Combo Lab        combo 2-4 with moveLimit
 *   7 Precision Play   compact 6x6/7x7 boards, tight targets
 *   8 Advanced Tactics scoreWithinMoves, obstacles 15-25
 *   9 Expert Grid      expert mix: high targets, tight move limits
 *  10 Duo Legends      combination extremes of everything
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'data', 'levels', 'levels.json');

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) + integer helpers
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max] inclusive. */
const ri = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/** Deterministic Fisher-Yates shuffle (returns a copy). */
function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Max obstacles allowed: strictly under 40% of cells. */
const maxObstacles = (rows, cols) => Math.ceil(rows * cols * 0.4) - 1;

// ---------------------------------------------------------------------------
// Chapter titles (must match src/data/levels/index.ts CHAPTERS)
// ---------------------------------------------------------------------------
const CHAPTER_TITLES = [
  'Foundations', 'Line Logic', 'Crossroads', 'Obstacles', 'Move Masters',
  'Combo Lab', 'Precision Play', 'Advanced Tactics', 'Expert Grid', 'Duo Legends',
];

/** Difficulty may never exceed this per chapter (validator enforces). */
const CHAPTER_MAX_DIFF = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];

// Board rotation lists (dims in {6,7,8} x {6,7,8}; even-size boards first).
const DEFAULT_DIMS = [[8, 8], [6, 6], [8, 6], [6, 8], [7, 7], [7, 8], [8, 7]];
const COMPACT_DIMS = [[6, 6], [7, 7], [6, 7], [7, 6]];

/**
 * Per-chapter generator spec.
 * score/moves/lines/combo are [min, max] ranges; obstacles is [min, max].
 * `variants` (for ch9/ch10) rotates the objective kind across levels.
 */
const SPECS = [
  { ch: 1, kind: 'targetScore', obstacles: [0, 0], score: [300, 800], dims: DEFAULT_DIMS },
  { ch: 2, kind: 'lineClears', obstacles: [0, 0], lines: [3, 10], dims: DEFAULT_DIMS },
  { ch: 3, kind: 'targetScore', obstacles: [4, 10], score: [600, 1400], dims: DEFAULT_DIMS },
  { ch: 4, kind: 'scoreWithinMoves', obstacles: [10, 25], score: [700, 1600], moves: [20, 40], dims: DEFAULT_DIMS },
  { ch: 5, kind: 'scoreWithinMoves', obstacles: [0, 0], score: [900, 2000], moves: [15, 40], dims: DEFAULT_DIMS },
  { ch: 6, kind: 'combo', obstacles: [0, 0], combo: [2, 4], moves: [20, 40], dims: DEFAULT_DIMS },
  { ch: 7, kind: 'targetScore', obstacles: [0, 0], score: [500, 1100], dims: COMPACT_DIMS },
  { ch: 8, kind: 'scoreWithinMoves', obstacles: [15, 25], score: [1200, 2400], moves: [18, 32], dims: DEFAULT_DIMS },
  {
    ch: 9, kind: 'rotate', dims: DEFAULT_DIMS, variants: [
      { kind: 'scoreWithinMoves', score: [1500, 2800], moves: [12, 22], obstacles: [8, 18] },
      { kind: 'targetScore', score: [1800, 3600], obstacles: [6, 14] },
      { kind: 'lineClears', lines: [8, 14], moves: [24, 40], obstacles: [4, 12] },
      { kind: 'combo', combo: [3, 5], moves: [18, 30], obstacles: [0, 8] },
    ],
  },
  {
    ch: 10, kind: 'rotate', dims: DEFAULT_DIMS, variants: [
      { kind: 'scoreWithinMoves', score: [2200, 3800], moves: [10, 20], obstacles: [15, 25] },
      { kind: 'combo', combo: [4, 5], moves: [14, 24], obstacles: [8, 16] },
      { kind: 'lineClears', lines: [10, 16], moves: [20, 32], obstacles: [8, 16] },
      { kind: 'targetScore', score: [2800, 4500], obstacles: [12, 22] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Themed name pools — 50 evocative names per chapter.
// If a pool ever runs short (or a cross-chapter collision occurs) the
// uniqueName() helper suffixes with a number, keeping the catalogue unique.
// ---------------------------------------------------------------------------
const NAME_POOLS = [
  /* 1 Foundations */
  ['First Steps', 'Warm Cells', 'Open Grid', 'Soft Landing', 'Gentle Rows', 'Easy Corners', 'Calm Start', 'Plain Sailing', 'Early Light', 'Quiet Board', 'Slow Lane', 'Baby Blocks', 'Fresh Paint', 'Morning Grid', 'Kind Spaces', 'Simple Lines', 'Clear Skies', 'Friendly Gaps', 'Low Stakes', 'Smooth Moves', 'Home Row', 'Light Work', 'Steady Hand', 'Wide Open', 'Soft Focus', 'Easy Does It', 'First Light', 'Gentle Breeze', 'Level Ground', 'Clean Slate', 'Room to Grow', 'Safe Harbor', 'Neat Edges', 'Cozy Grid', 'Bare Minimum', 'Slow Burn', 'Quiet Corners', 'Open Field', 'Calm Waters', 'Small Wins', 'Soft Start', 'Warm Up', 'Flat Terrain', 'Easy Street', 'Fresh Start', 'Primer', 'Day One', 'Green Lights', 'Sure Footing', 'Bedrock'],
  /* 2 Line Logic */
  ['Row Runner', 'Line Drive', 'Straight Flush', 'Bar None', 'Row by Row', 'Line Whisperer', 'Streak Maker', 'Lane Keeper', 'Full Width', 'Straight Shooter', 'Line Dancer', 'Row Lock', 'Parallel Paths', 'Clean Sweep', 'Line Art', 'Bar Hopper', 'Row Maker', 'Linear Thinker', 'Strike a Line', 'Line Catcher', 'Wire Walker', 'Straight Ahead', 'Row Ruler', 'Linebound', 'Bar Bell', 'Line Pilot', 'Rowsmith', 'Streak Keeper', 'Lane Changer', 'Full Row', 'Line Catalyst', 'Row Rider', 'Tidy Lines', 'Bar Code', 'Row Garden', 'Line Storm', 'Sweep Dreams', 'Line Ladder', 'Row Momentum', 'Chain Reaction', 'Lane Discipline', 'Line Harvest', 'Row Tempo', 'Straight and Narrow', 'Bar Balance', 'Line Frequency', 'Row Cadence', 'Streak Builder', 'Line Contour', 'Domino Row'],
  /* 3 Crossroads */
  ['Crossroads', 'Junction', 'Crossfire', 'Crossing Guard', 'Intersection', 'Cross Wind', 'Cross Wire', 'Cross Cut', 'Cross Check', 'Cross Current', 'Cross Hatch', 'Cross Beam', 'Cross Section', 'Cross Stitch', 'Cross Walk', 'Cross Fade', 'Cross Grain', 'Cross Tie', 'Cross Word', 'Cross Purpose', 'Crosshair', 'Median', 'Cross Flow', 'Cross Fill', 'Cross Link', 'Cross Match', 'Cross Piece', 'Cross Point', 'Cross Rail', 'Cross Span', 'Cross Track', 'Cross Vent', 'Junction Box', 'Switch Point', 'Cross Node', 'Crossways', 'Crosswise', 'Meeting Point', 'Confluence', 'Fork in the Road', 'Split Decision', 'Four Ways', 'T Junction', 'Y Junction', 'Roundabout', 'Overpass', 'Underpass', 'Dead End', 'Cul de Sac', 'Cross Over'],
  /* 4 Obstacles */
  ['Block Party', 'Roadblock', 'Stone Garden', 'Rock Slide', 'Boulder Field', 'Wall Street', 'Barrier Reef', 'Stone Wall', 'Hard Place', 'Rough Terrain', 'Rocky Road', 'Stumbling Block', 'Dead Weight', 'Dead Zone', 'Lockdown', 'Gridlock', 'Standoff', 'Blockade Run', 'Stone Throw', 'Heavy Weather', 'Iron Grid', 'Stone Circle', 'Wallflower', 'Block Rock', 'Rough Edges', 'Hard Count', 'Stone Cold', 'Wall Crawler', 'Blockbuster', 'Obstacle Course', 'Bolder Moves', 'Rock Garden', 'Wall to Wall', 'Hard Lines', 'Stone Age', 'Blockade Runner', 'Rough Cut', 'Dead Stop', 'Heavy Grid', 'Rock Solid', 'Stone Soup', 'Wall Banger', 'Log Jam', 'Sand Trap', 'Weight Zone', 'Iron Curtain', 'Stone Forest', 'Rough Waters', 'Hard Target', 'Granite Grip'],
  /* 5 Move Masters */
  ['Move Master', 'Efficiency', 'Economy Size', 'Frugal Moves', 'Budget Builder', 'Thrifty Grid', 'Parsimony', 'Lean Machine', 'Minimal Moves', 'Metered Play', 'Counting House', 'Abacus', 'Bean Counter', 'Move Budget', 'Tight Quota', 'Pinch Penny', 'Penny Wise', 'Frugal Flag', 'Thrift Scale', 'Ration Card', 'Coupon Grid', 'Discount Dash', 'Bargain Block', 'Value Meal', 'Cost Cutter', 'Thrift Store', 'Overdraft', 'Break Even', 'Net Gain', 'Margin Call', 'Compound Move', 'Interest Paid', 'Ledger Line', 'Balance Due', 'Credit Limit', 'Cash Flow', 'Liquid Assets', 'Fixed Cost', 'Prime Rate', 'Slippery Count', 'Exact Change', 'Small Print', 'Fine Print', 'Zero Waste', 'Waste Not', 'Last Penny', 'Closing Bell', 'Final Tally', 'Bottom Line', 'Fee Waived'],
  /* 6 Combo Lab */
  ['Combo Lab', 'Chain Gang', 'Streak House', 'Domino Day', 'Ripple Effect', 'Snowball', 'Avalanche', 'Cascade', 'Waterfall', 'Loop de Loop', 'Follow Through', 'Keep It Rolling', 'Hot Streak', 'On a Roll', 'Wildfire', 'Tumbleweed', 'Double Trouble', 'Two Step', 'Triple Play', 'Encore', 'Relay Race', 'Momentum', 'Perpetuum', 'Flywheel', 'Ratchet', 'Resonance', 'Echo Chamber', 'Feedback Loop', 'Amplifier', 'Overdrive', 'Turbo Charge', 'Chain Letter', 'Link Up', 'Caravan', 'Conveyor', 'Assembly Line', 'Reaction Rate', 'Catalyst', 'Chain Mail', 'Zipper', 'Button Hook', 'Slingshot', 'Boomerang', 'Rebound', 'Ricochet', 'Pinball', 'Pendulum', 'Metronome', 'Drum Roll', 'Climax'],
  /* 7 Precision Play */
  ['Precision Play', 'Tight Quarters', 'Close Quarters', 'Fine Margin', 'Hairline', 'Needle Point', 'Laser Focus', 'Steady Eye', 'Sure Shot', 'Dead Eye', 'Bullseye', 'Snipers Nest', 'Marksmanship', 'Calibrated', 'Micro Scope', 'Nano Meter', 'Fine Tuning', 'Jewel Box', 'Watchmaker', 'Silversmith', 'Gold Leaf', 'Filigree', 'Lace Work', 'Embroidery', 'Origami', 'Paper Cut', 'Scalpel', 'Surgeon', 'Swiss Watch', 'Clockwork', 'Gear Tooth', 'Detent', 'Caliper', 'Micrometer', 'Vernier', 'Plumb Line', 'Spirit Level', 'True Vertical', 'Square Deal', 'Right Angle', 'Acute Angle', 'Isosceles', 'Protractor', 'Compass Point', 'Drafting Board', 'Blueprint', 'Graph Paper', 'Ruled Line', 'T Square', 'Set Square'],
  /* 8 Advanced Tactics */
  ['Advanced Tactics', 'Grand Plan', 'Master Plan', 'Battle Plan', 'War Room', 'Chess Master', 'Gambit', 'End Game', 'Middle Game', 'Opening Book', 'Fork Attack', 'Pin and Skewer', 'Flank Guard', 'Pincer Move', 'Siege Line', 'Last Stand', 'Front Line', 'Rear Guard', 'Vantage Point', 'High Ground', 'Fortified', 'Bastion', 'Rampart', 'Redoubt', 'Citadel', 'Kings Keep', 'Castle Doctrine', 'Moat', 'Drawbridge', 'Portcullis', 'Barbican', 'Lookout', 'Watchtower', 'Beacon', 'Signal Fire', 'Drumbeat', 'Marching Order', 'Tactician', 'Strategist', 'Field Marshal', 'General Staff', 'War College', 'Doctrine', 'Feint and Thrust', 'Counter Attack', 'Outflank', 'Encircle', 'Barrage', 'Salvo', 'Volley Fire'],
  /* 9 Expert Grid */
  ['Expert Grid', 'Grand Master', 'Deep Calculate', 'Cold Logic', 'Pure Reason', 'Hard Mode', 'Iron Will', 'Steel Nerve', 'Diamond Edge', 'Crystal Clear', 'Pressure Vessel', 'High Wire', 'Tight Rope', 'Knife Edge', 'Razor Thin', 'Vertigo', 'Free Fall', 'Black Diamond', 'Double Black', 'Summit Push', 'Crampon', 'Ice Axe', 'Thin Air', 'Rarefied', 'Peak Zone', 'Final Exam', 'Pop Quiz', 'Dissertation', 'Master Class', 'Graduation', 'Thesis Defense', 'Peer Review', 'Laboratory', 'Case Study', 'Field Test', 'Stress Test', 'Load Bearing', 'Tension Test', 'Shear Force', 'Torque', 'Gravity Well', 'Event Horizon', 'Singularity', 'Quantum Grid', 'Neutron Star', 'Supernova', 'Pulsar', 'Quasar', 'Magnetar', 'Photon Storm'],
  /* 10 Duo Legends */
  ['Duo Legends', 'Hall of Fame', 'Myth Maker', 'Epic Scale', 'Saga', 'Odyssey', 'Beowulf', 'Legend Born', 'Final Boss', 'Crown Jewel', 'Gold Standard', 'Platinum', 'Titanium', 'Adamant', 'Invincible', 'Unbeaten', 'Perfect Run', 'Flawless', 'Immaculate', 'Zenith', 'Apogee', 'Pinnacle', 'Apex', 'Acme', 'Everest', 'K2', 'Mont Blanc', 'Kilimanjaro', 'Olympus', 'Asgard', 'Valhalla', 'Ragnarok', 'Titan', 'Colossus', 'Leviathan', 'Behemoth', 'Hydra', 'Phoenix', 'Griffin', 'Kraken', 'Minotaur', 'Chimera', 'Sphinx', 'Golem', 'Last Hurrah', 'Swan Song', 'Grand Finale', 'Curtain Call', 'Standing Ovation', 'One More Time'],
];

/** Globally-unique level name; suffixes with a number if the pool exhausts. */
function uniqueName(base, used) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  const name = `${base} ${n}`;
  used.add(name);
  return name;
}

// ---------------------------------------------------------------------------
// Deterministic piece generators
// ---------------------------------------------------------------------------

/**
 * Pick board dims from the chapter's rotation list. Advances the rotation
 * pointer until dims differ from the previous level AND the board can hold
 * the chapter's minimum obstacle count (<40% cells rule).
 */
function pickDims(rng, dimList, minObstacles, prevDims) {
  let idx = Math.floor(rng() * dimList.length);
  let dims = dimList[idx];
  for (let guard = 0; guard < dimList.length * 2; guard++) {
    const repeatsPrev = prevDims && dims[0] === prevDims[0] && dims[1] === prevDims[1];
    const tooSmallForObstacles = maxObstacles(dims[0], dims[1]) < minObstacles;
    if (!repeatsPrev && !tooSmallForObstacles) return dims;
    idx = (idx + 1) % dimList.length;
    dims = dimList[idx];
  }
  return dims; // unreachable for our lists; rotation always terminates
}

/** Distinct in-bounds obstacle positions; avoids repeating the previous set. */
function genObstacles(rng, rows, cols, [min, max], prevKey) {
  const cap = Math.min(max, maxObstacles(rows, cols));
  const count = ri(rng, min, cap);
  let key = '';
  let cells = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    cells = [];
    const seen = new Set();
    while (cells.length < count) {
      const r = ri(rng, 0, rows - 1);
      const c = ri(rng, 0, cols - 1);
      const k = r * cols + c;
      if (!seen.has(k)) {
        seen.add(k);
        cells.push([r, c]);
      }
    }
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    key = JSON.stringify(cells);
    if (count === 0 || key !== prevKey) break; // empty-vs-empty is fine: dims/objective differ
  }
  return { cells, key };
}

/** Score target as a tidy multiple of 25 inside [min, max]. */
const scoreTarget = (rng, [min, max]) => ri(rng, min / 25, max / 25) * 25;

/** Build the objective, nudging numbers if the previous objective is identical. */
function genObjective(rng, spec, prevObjective) {
  const kind = spec.kind === 'rotate' ? spec.variants[spec._variant].kind : spec.kind;
  if (kind === 'targetScore') {
    const range = spec.kind === 'rotate' ? spec.variants[spec._variant].score : spec.score;
    let target = scoreTarget(rng, range);
    if (prevObjective && prevObjective.kind === 'targetScore' && prevObjective.target === target) {
      target = target < range[1] ? target + 25 : target - 25;
    }
    return { kind, target };
  }
  if (kind === 'scoreWithinMoves') {
    const v = spec.kind === 'rotate' ? spec.variants[spec._variant] : spec;
    let moveLimit = ri(rng, v.moves[0], v.moves[1]);
    let target = scoreTarget(rng, v.score);
    if (
      prevObjective && prevObjective.kind === 'scoreWithinMoves' &&
      prevObjective.moveLimit === moveLimit && prevObjective.target === target
    ) {
      moveLimit = moveLimit < v.moves[1] ? moveLimit + 1 : moveLimit - 1;
    }
    return { kind, moveLimit, target };
  }
  if (kind === 'lineClears') {
    const v = spec.kind === 'rotate' ? spec.variants[spec._variant] : spec;
    let requiredLines = ri(rng, v.lines[0], v.lines[1]);
    if (prevObjective && prevObjective.kind === 'lineClears' && prevObjective.requiredLines === requiredLines) {
      requiredLines = requiredLines < v.lines[1] ? requiredLines + 1 : requiredLines - 1;
    }
    const objective = { kind, requiredLines };
    if (v.moves) objective.moveLimit = ri(rng, v.moves[0], v.moves[1]);
    return objective;
  }
  // combo
  const v = spec.kind === 'rotate' ? spec.variants[spec._variant] : spec;
  let comboTarget = ri(rng, v.combo[0], v.combo[1]);
  if (prevObjective && prevObjective.kind === 'combo' && prevObjective.comboTarget === comboTarget) {
    comboTarget = comboTarget < v.combo[1] ? comboTarget + 1 : comboTarget - 1;
  }
  const objective = { kind, comboTarget };
  if (v.moves) objective.moveLimit = ri(rng, v.moves[0], v.moves[1]);
  return objective;
}

/** Stars: [0.6x, 1.0x, 1.5x] for score goals; completion-based otherwise. */
function starThresholdsFor(objective) {
  if (objective.kind === 'targetScore' || objective.kind === 'scoreWithinMoves') {
    const t = objective.target;
    return [Math.round(t * 0.6), t, Math.round(t * 1.5)];
  }
  const req = objective.kind === 'lineClears' ? objective.requiredLines : objective.comboTarget;
  return [req, req, req]; // UI awards stars on completion for these
}

// ---------------------------------------------------------------------------
// Catalogue generation
// ---------------------------------------------------------------------------
const levels = [];
const usedNames = new Set();
let prevDims = null;
let prevObstacleKey = '';
let prevObjective = null;

for (let number = 1; number <= 500; number++) {
  const chapter = Math.floor((number - 1) / 50) + 1;
  const spec = SPECS[chapter - 1];
  const seed = 100000 + number * 7919;
  const rng = mulberry32(seed);

  // Rotate the objective variant for ch9/ch10 BEFORE picking dims (min obstacle
  // size depends on the variant).
  spec._variant = spec.kind === 'rotate' ? number % spec.variants.length : 0;
  const variant = spec.kind === 'rotate' ? spec.variants[spec._variant] : spec;
  const minObstacles = variant.obstacles[0];

  const [boardRows, boardCols] = pickDims(rng, spec.dims, minObstacles, prevDims);
  const { cells: obstacles, key: obstacleKey } = genObstacles(rng, boardRows, boardCols, variant.obstacles, prevObstacleKey);
  const objective = genObjective(rng, spec, prevObjective);

  // Difficulty rises 1→5 across the catalogue, jittered, capped per chapter.
  const linear = 1 + ((number - 1) * 4) / 499;
  let difficulty = Math.round(linear);
  if (rng() < 0.2) difficulty += 1;
  difficulty = Math.max(1, Math.min(CHAPTER_MAX_DIFF[chapter - 1], Math.min(5, difficulty)));

  // Name: chapter pool, deterministically shuffled once per chapter.
  const i = (number - 1) % 50;
  const name = uniqueName(NAME_POOLS[chapter - 1][i], usedNames);

  levels.push({
    id: `L${String(number).padStart(4, '0')}`,
    number,
    chapter,
    name,
    difficulty,
    objective,
    boardRows,
    boardCols,
    obstacles,
    seed,
    starThresholds: starThresholdsFor(objective),
  });

  prevDims = [boardRows, boardCols];
  prevObstacleKey = obstacleKey;
  prevObjective = objective;
  delete spec._variant;
}

// ---------------------------------------------------------------------------
// Write compact JSON (integers only — no verbose fields, no floats)
// ---------------------------------------------------------------------------
mkdirSync(path.dirname(OUT), { recursive: true });
const json = JSON.stringify({ version: '1.0.0', levels });
writeFileSync(OUT, json, 'utf8');

const kb = statSync(OUT).size / 1024;
const objDist = {};
for (const lv of levels) objDist[lv.objective.kind] = (objDist[lv.objective.kind] ?? 0) + 1;
console.log(`generated ${levels.length} levels -> ${path.relative(process.cwd(), OUT)} (${kb.toFixed(1)} KB)`);
console.log(`objective distribution: ${JSON.stringify(objDist)}`);
console.log('deterministic: re-running reproduces identical output');
