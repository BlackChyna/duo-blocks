/**
 * DUO BLOCKS — scoring rules, versioned (SCORING_VERSION from types/game.ts).
 *
 * v1 rules:
 *  - 10 points per placed cell
 *  - 100 points per cleared line
 *  - multi-line bonus: 50 * n(n-1)/2 for n lines cleared in one move
 *    (1 line: 0, 2 lines: 50, 3 lines: 150, ...)
 *  - combo bonus: 25 * (combo - 1) on a clearing move, where combo is the
 *    streak value AFTER the move (comboBefore + 1). First clearing move of a
 *    streak (comboBefore = 0) earns no combo bonus.
 */
import { SCORING_VERSION } from '../../../types/game';
import type { ScoreRuleVersion } from '../../../types/game';

export const SCORING_RULES: ScoreRuleVersion = {
  version: SCORING_VERSION,
  cellPoints: 10,
  linePoints: 100,
  multiLineBonusPerExtraPair: 50,
  comboBonusPerStreakStep: 25,
};

/**
 * Points earned by one move.
 * @param cellsPlaced number of board cells the piece filled
 * @param linesCleared number of full rows+cols cleared by the move
 * @param comboBefore combo streak value before the move
 */
export function scoreMove(cellsPlaced: number, linesCleared: number, comboBefore: number): number {
  const r = SCORING_RULES;
  let points = cellsPlaced * r.cellPoints;
  if (linesCleared > 0) {
    points += linesCleared * r.linePoints;
    points += r.multiLineBonusPerExtraPair * ((linesCleared * (linesCleared - 1)) / 2);
    points += r.comboBonusPerStreakStep * comboBefore; // 25 * (comboAfter - 1)
  }
  return points;
}
