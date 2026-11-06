import { create } from 'zustand';
import type {
  GameConfig,
  GameEvents,
  GameMode,
  GameStatus,
  GameState,
  LevelDef,
} from '../types/game';
import { engine } from '../features/game/engine';
import { audio } from '../features/game/audio/audioEngine';
import { usePlayerStore } from './playerStore';

export interface SessionMeta {
  mode: GameMode;
  level: LevelDef | null; // null for endless
  /** For duel/challenge/daily: the shared seed both players must use. */
  sharedSeed?: number;
  matchId?: string; // duel match being played
  challengeId?: string;
}

interface GameStoreState {
  active: boolean;
  meta: SessionMeta | null;
  state: GameState | null;
  lastEvents: GameEvents | null;
  status: GameStatus | 'idle';

  startGame: (meta: SessionMeta, config?: GameConfig) => void;
  placePiece: (trayIndex: number, r: number, c: number) => void;
  /** Records the completed objective while the game is still active (live-clear skip-ahead). */
  recordLiveClear: () => void;
  restart: () => void;
  exitGame: () => void;
}

/**
 * Bridges the pure engine to React. The board screen calls placePiece().
 * On game end the store records campaign progress / endless bests via
 * usePlayerStore — the only place progress recording happens.
 */
export const useGameStore = create<GameStoreState>((set, get) => ({
  active: false,
  meta: null,
  state: null,
  lastEvents: null,
  status: 'idle',

  startGame: (meta, config) => {
    const rows = meta.level?.boardRows ?? 8;
    const cols = meta.level?.boardCols ?? 8;
    const seed = meta.sharedSeed ?? meta.level?.seed ?? Date.now() >>> 0;
    // entering a game gets music rolling regardless of where the user came from
    audio.startMusic();
    audio.armAutoplay();
    const st = engine.createGameState({
      rows,
      cols,
      seed,
      obstacles: meta.level?.obstacles ?? [],
    });
    set({ active: true, meta, state: st, lastEvents: null, status: 'active' });
  },

  placePiece: (trayIndex, r, c) => {
    const { state, meta } = get();
    if (!state || !meta || state.status !== 'active') return;
    const { state: next, events } = engine.applyMove(state, trayIndex, r, c);
    set({ state: next, lastEvents: events });

    if (events.status !== 'active') {
      // objective evaluation + progress recording
      finishIfDue(next);
    }
  },

  /** Live-clear: the campaign objective is already met while play continues —
   *  bank the result now so skipping ahead via the glowing NEXT button can't
   *  lose progress. Later records (same seed) just merge better scores. */
  recordLiveClear: () => {
    const { state, meta } = get();
    if (!state || !meta?.level) return;
    const finished = engine.evaluateObjective(meta.level, state);
    if (!finished.complete) return;
    usePlayerStore.getState().recordResult({
      mode: meta.mode,
      levelId: meta.level.id,
      stars: finished.stars,
      score: state.score,
      lines: state.linesCleared,
      blocks: state.blocksPlaced,
      combo: state.longestCombo,
      matched: false, // campaign-only path
      matchId: undefined,
      challengeId: undefined,
    });
  },

  restart: () => {
    const { meta } = get();
    if (meta) get().startGame(meta);
  },

  exitGame: () => set({ active: false, meta: null, state: null, lastEvents: null, status: 'idle' }),
}));

/** Called when engine reports a non-active status — evaluates objective, saves progress. */
function finishIfDue(nextState: GameState) {
  const s = useGameStore.getState();
  if (!s.meta) return;
  const { meta } = s;
  const level = meta.level;
  const finished = engine.evaluateObjective(
    level ?? ({
      id: 'UNBOUNDED', number: 0, chapter: 0, name: 'Endless', difficulty: 3,
      objective: { kind: 'targetScore', target: 0 },
      boardRows: nextState.rows, boardCols: nextState.cols,
      obstacles: [], seed: nextState.seed, starThresholds: [0, 0, 0],
    } satisfies LevelDef),
    nextState,
  );
  usePlayerStore.getState().recordResult({
    mode: meta.mode,
    levelId: level?.id ?? null,
    stars: finished.stars,
    score: nextState.score,
    lines: nextState.linesCleared,
    blocks: nextState.blocksPlaced,
    combo: nextState.longestCombo,
    matched: meta.mode === 'duel' || meta.mode === 'daily' || meta.mode === 'challenge' ? true : false,
    matchId: meta.matchId,
    challengeId: meta.challengeId,
  });
}
