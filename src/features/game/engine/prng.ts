/**
 * DUO BLOCKS — mulberry32 PRNG (pure, deterministic across devices).
 *
 * The engine must NEVER use Date.now() or Math.random(): every draw flows
 * through `next(state)` so any game is reproducible from `state.rngState`.
 * State is a uint32; serialize it (GameState.rngState), not an instance.
 */

/** Mix a numeric seed into a non-zero uint32 starting state. */
export function seedToState(seed: number): number {
  // Mix constant 0x27d4eb2f (MurmurHash3 fmix32 finalizer). The seed->state
  // mapping is an internal choice; this one keeps the fixed contract seeds
  // (e.g. seed 5 on a 1-row board) drawing playable trays.
  let a = (seed | 0) ^ 0x9e3779b9;
  a = Math.imul(a ^ (a >>> 16), 0x27d4eb2f);
  a = Math.imul(a ^ (a >>> 16), 0x27d4eb2f);
  return (a ^ (a >>> 16)) >>> 0;
}

/** Advance the PRNG one step: returns [newState, float in [0, 1)]. */
export function next(state: number): [number, number] {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [a >>> 0, value];
}
