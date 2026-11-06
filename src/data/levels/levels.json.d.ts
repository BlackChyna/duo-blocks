/**
 * Type declaration for the generated levels.json (kept out of tsconfig via
 * resolveJsonModule-free resolution). The file is produced by
 * scripts/generate-levels.mjs and validated by scripts/validate-levels.mjs.
 */
import type { LevelDef } from '../../types/game';

declare const data: { version: string; levels: LevelDef[] };
export default data;
