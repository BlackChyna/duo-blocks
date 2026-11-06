#!/usr/bin/env node
/**
 * DUO BLOCKS — structural level-catalogue validator.
 *
 *   node scripts/validate-levels.mjs
 *
 * Exits non-zero on any violation. Checks:
 *   - exactly 500 levels; ids L0001…L0500 zero-padded, unique, number === index+1
 *   - chapter window matches 1-10 x 50 levels
 *   - boardRows/boardCols in 6..8
 *   - obstacles in bounds, unique, count < 40% of cells
 *   - starThresholds [t1,t2,t3] non-descending, integer, t3 > 0
 *   - objective fields valid (target > 0, moveLimit > 0, 1 <= requiredLines <= 16,
 *     2 <= comboTarget <= 5)
 *   - difficulty 1..5 and <= chapter difficulty progression (ch1 max 2, ch10 max 5)
 *   - seeds unique; level names unique; no two consecutive levels identical in
 *     (board dims, obstacle set, objective)
 * Prints summary stats on success.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, '..', 'src', 'data', 'levels', 'levels.json');

const errors = [];
const fail = (msg) => errors.push(msg);

const CHAPTER_TITLES = [
  'Foundations', 'Line Logic', 'Crossroads', 'Obstacles', 'Move Masters',
  'Combo Lab', 'Precision Play', 'Advanced Tactics', 'Expert Grid', 'Duo Legends',
];
const CHAPTER_MAX_DIFF = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];

const stat = statSync(FILE);
const sizeKB = stat.size / 1024;
const raw = readFileSync(FILE, 'utf8');

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`FATAL: levels.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const levels = data?.levels;
if (data?.version !== '1.0.0') fail(`version must be "1.0.0", got ${JSON.stringify(data?.version)}`);
if (!Array.isArray(levels)) {
  fail('levels must be an array');
} else if (levels.length !== 500) {
  fail(`expected exactly 500 levels, got ${levels.length}`);
}

const sameObstacleSet = (a, b) =>
  a.length === b.length && a.every((o, i) => o[0] === b[i][0] && o[1] === b[i][1]);

const ids = new Set();
const seeds = new Set();
const names = new Set();
const objDist = {};
const chapterObstacles = Array.from({ length: 10 }, () => []);
const chapterKinds = Array.from({ length: 10 }, () => ({}));
const diffDist = [0, 0, 0, 0, 0, 0]; // index 1..5
const boardDist = {};
let prev = null;

if (Array.isArray(levels)) {
  levels.forEach((lv, i) => {
    const n = i + 1;
    const label = `L${String(n).padStart(4, '0')}`;

    // --- id / number / chapter window -------------------------------------
    if (lv?.id !== label) fail(`${label}: id must be "${label}", got ${JSON.stringify(lv?.id)}`);
    if (ids.has(lv?.id)) fail(`${label}: duplicate id`);
    ids.add(lv?.id);
    if (lv?.number !== n) fail(`${label}: number must be ${n}, got ${JSON.stringify(lv?.number)}`);
    const chapter = Math.floor((n - 1) / 50) + 1;
    if (lv?.chapter !== chapter) fail(`${label}: chapter must be ${chapter} (window 1-10 x 50), got ${lv?.chapter}`);

    // --- difficulty ---------------------------------------------------------
    const d = lv?.difficulty;
    if (!Number.isInteger(d) || d < 1 || d > 5) {
      fail(`${label}: difficulty must be an integer 1..5, got ${JSON.stringify(d)}`);
    } else if (d > CHAPTER_MAX_DIFF[chapter - 1]) {
      fail(`${label}: difficulty ${d} exceeds chapter ${chapter} max ${CHAPTER_MAX_DIFF[chapter - 1]}`);
    } else {
      diffDist[d] += 1;
    }

    // --- board dims ---------------------------------------------------------
    const rows = lv?.boardRows;
    const cols = lv?.boardCols;
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 6 || rows > 8 || cols < 6 || cols > 8) {
      fail(`${label}: boardRows/boardCols must be integers in 6..8, got ${rows}x${cols}`);
    }
    const boardKey = `${rows}x${cols}`;
    boardDist[boardKey] = (boardDist[boardKey] ?? 0) + 1;

    // --- obstacles ----------------------------------------------------------
    const obstacles = lv?.obstacles;
    if (!Array.isArray(obstacles)) {
      fail(`${label}: obstacles must be an array`);
    } else {
      const seen = new Set();
      let bad = false;
      for (const o of obstacles) {
        if (!Array.isArray(o) || o.length !== 2 || !Number.isInteger(o[0]) || !Number.isInteger(o[1])) {
          fail(`${label}: obstacle must be an [int, int] pair, got ${JSON.stringify(o)}`);
          bad = true;
          break;
        }
        const [r, c] = o;
        if (r < 0 || r >= rows || c < 0 || c >= cols) {
          fail(`${label}: obstacle ${JSON.stringify(o)} out of bounds for ${rows}x${cols} board`);
          bad = true;
          break;
        }
        const k = r * 100 + c;
        if (seen.has(k)) {
          fail(`${label}: duplicate obstacle ${JSON.stringify(o)}`);
          bad = true;
          break;
        }
        seen.add(k);
      }
      if (!bad && obstacles.length * 100 >= rows * cols * 40) {
        fail(`${label}: obstacle count ${obstacles.length} is not < 40% of ${rows * cols} cells`);
      }
      chapterObstacles[chapter - 1].push(obstacles.length);
    }

    // --- objective ----------------------------------------------------------
    const o = lv?.objective;
    let kindKey = 'unknown';
    if (!o || typeof o !== 'object') {
      fail(`${label}: objective missing`);
    } else {
      kindKey = o.kind;
      switch (o.kind) {
        case 'targetScore':
          if (!Number.isInteger(o.target) || o.target <= 0) fail(`${label}: targetScore.target must be a positive integer, got ${JSON.stringify(o.target)}`);
          break;
        case 'scoreWithinMoves':
          if (!Number.isInteger(o.moveLimit) || o.moveLimit <= 0) fail(`${label}: scoreWithinMoves.moveLimit must be a positive integer, got ${JSON.stringify(o.moveLimit)}`);
          if (!Number.isInteger(o.target) || o.target <= 0) fail(`${label}: scoreWithinMoves.target must be a positive integer, got ${JSON.stringify(o.target)}`);
          break;
        case 'lineClears':
          if (!Number.isInteger(o.requiredLines) || o.requiredLines < 1 || o.requiredLines > 16) fail(`${label}: lineClears.requiredLines must be an integer 1..16, got ${JSON.stringify(o.requiredLines)}`);
          if (o.moveLimit !== undefined && (!Number.isInteger(o.moveLimit) || o.moveLimit <= 0)) fail(`${label}: lineClears.moveLimit must be a positive integer when present`);
          break;
        case 'combo':
          if (!Number.isInteger(o.comboTarget) || o.comboTarget < 2 || o.comboTarget > 5) fail(`${label}: combo.comboTarget must be an integer 2..5, got ${JSON.stringify(o.comboTarget)}`);
          if (o.moveLimit !== undefined && (!Number.isInteger(o.moveLimit) || o.moveLimit <= 0)) fail(`${label}: combo.moveLimit must be a positive integer when present`);
          break;
        default:
          fail(`${label}: unknown objective kind ${JSON.stringify(o.kind)}`);
      }
      objDist[kindKey] = (objDist[kindKey] ?? 0) + 1;
      const ck = chapterKinds[chapter - 1];
      ck[kindKey] = (ck[kindKey] ?? 0) + 1;
    }

    // --- starThresholds -----------------------------------------------------
    const st = lv?.starThresholds;
    if (!Array.isArray(st) || st.length !== 3 || !st.every((x) => Number.isInteger(x))) {
      fail(`${label}: starThresholds must be [int, int, int], got ${JSON.stringify(st)}`);
    } else if (!(st[0] <= st[1] && st[1] <= st[2])) {
      fail(`${label}: starThresholds must be non-descending, got ${JSON.stringify(st)}`);
    } else if (st[2] <= 0) {
      fail(`${label}: starThresholds[2] must be > 0`);
    }

    // --- names & seeds ------------------------------------------------------
    if (typeof lv?.name !== 'string' || lv.name.length === 0) fail(`${label}: name must be a non-empty string`);
    else if (names.has(lv.name)) fail(`${label}: duplicate level name ${JSON.stringify(lv.name)}`);
    else names.add(lv.name);

    if (!Number.isInteger(lv?.seed)) fail(`${label}: seed must be an integer, got ${JSON.stringify(lv?.seed)}`);
    else if (seeds.has(lv.seed)) fail(`${label}: duplicate seed ${lv.seed}`);
    else seeds.add(lv.seed);

    // --- no two consecutive identical levels --------------------------------
    if (prev) {
      const sameDims = prev.boardRows === rows && prev.boardCols === cols;
      const sameObstacles = sameObstacleSet(prev.obstacles ?? [], obstacles ?? []);
      const sameObjective = JSON.stringify(prev.objective) === JSON.stringify(o);
      if (sameDims && sameObstacles && sameObjective) {
        fail(`${label}: identical to previous level (board dims, obstacle set and objective all equal)`);
      }
    }
    prev = lv;
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('=== DUO BLOCKS level catalogue — validation ===');
console.log(`file: src/data/levels/levels.json (${sizeKB.toFixed(1)} KB)`);
console.log(`levels: ${levels?.length ?? 0} | version: ${JSON.stringify(data?.version)}`);

if (Array.isArray(levels) && errors.length === 0) {
  console.log('objective distribution:');
  const total = levels.length;
  for (const [kind, count] of Object.entries(objDist)) {
    console.log(`  ${kind.padEnd(16)} ${String(count).padStart(4)}  (${((count / total) * 100).toFixed(1)}%)`);
  }
  console.log('obstacles per chapter (min / avg / max):');
  CHAPTER_TITLES.forEach((title, idx) => {
    const counts = chapterObstacles[idx];
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const kinds = Object.entries(chapterKinds[idx]).map(([k, c]) => `${k}:${c}`).join(', ');
    console.log(`  ch${String(idx + 1).padStart(2)} ${title.padEnd(16)} ${String(min).padStart(3)} / ${avg.toFixed(1).padStart(5)} / ${String(max).padStart(3)}   [${kinds}]`);
  });
  console.log(`difficulty distribution: ${diffDist.map((c, i) => (i > 0 ? `d${i}=${c}` : '')).filter(Boolean).join(' ')}`);
  console.log(`board sizes: ${Object.entries(boardDist).map(([k, c]) => `${k}=${c}`).join(' ')}`);
  console.log('names unique: yes | seeds unique: yes');
  console.log(`OK: ${levels.length} levels across 10 chapters — all structural checks passed.`);
}

if (errors.length > 0) {
  console.log('');
  for (const e of errors.slice(0, 50)) console.error(`FAIL ${e}`);
  if (errors.length > 50) console.error(`FAIL … and ${errors.length - 50} more`);
  console.error(`FAILED: ${errors.length} violation(s).`);
  process.exit(1);
}
