import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, GameMode, LevelDef, Objective } from '../types/game';
import { useAppStore } from '../store/appStore';
import { useGameStore, type SessionMeta } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { engine } from '../features/game/engine';
import { nextCampaignLevel } from './levelState';
import { BlockBoard } from '../features/game/board/BlockBoard';
import { audio } from '../features/game/audio/audioEngine';
import { AudioToggle } from '../components/AudioToggle';
import GameOverOverlay from '../components/GameOverOverlay';

/**
 * DUO BLOCKS — the playable puzzle screen for every mode
 * (campaign / duel / daily / endless / challenge). Reads the session from
 * useGameStore; navigation home goes through useAppStore.
 */
export function GameScreen() {
  const meta = useGameStore(s => s.meta);
  const state = useGameStore(s => s.state);
  const lastEvents = useGameStore(s => s.lastEvents);

  const opponent = usePlayerStore(s => s.opponent);
  const endlessBest = usePlayerStore(s => s.progress.endless.best);

  const [paused, setPaused] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);

  const score = state?.score ?? 0;
  const displayScore = useCountUp(score);

  // Score pop + floating "+N" whenever a move earns points.
  useEffect(() => {
    if (!lastEvents || !lastEvents.placed || lastEvents.pointsEarned <= 0) return;
    setPulseKey(k => k + 1);
    const g = { amount: lastEvents.pointsEarned, key: Date.now() };
    setGain(g);
    const t = window.setTimeout(() => {
      setGain(cur => (cur && cur.key === g.key ? null : cur));
    }, 700);
    return () => clearTimeout(t);
  }, [lastEvents]);

  const combo = state?.combo ?? 0;

  // Game over: engine-declared end state, or a genuine no-moves-left deadlock.
  const trayHasPieces = state?.tray.some(Boolean) ?? false;
  const gameOver =
    !!state &&
    (state.status !== 'active' ||
      (state.status === 'active' && trayHasPieces && !engine.anyValidPlacement(state.board, state.tray)) ||
      lastEvents?.objectiveComplete === true);

  // Objective evaluation for the overlay (stars / won) once the game is over.
  const endlessBestAtStartRef = useRef(endlessBest);
  const evaluation = useMemo(() => {
    if (!state || !gameOver) return null;
    const level =
      meta?.level ??
      ({
        id: 'UNBOUNDED', number: 0, chapter: 0, name: 'Endless', difficulty: 3,
        objective: { kind: 'targetScore', target: 0 },
        boardRows: state.rows, boardCols: state.cols,
        obstacles: [], seed: state.seed, starThresholds: [0, 0, 0],
      } satisfies LevelDef);
    return engine.evaluateObjective(level, state);
  }, [state, meta, gameOver]);

  // Sound: mallet placement + line-clear/combo sparkles on every move.
  useEffect(() => {
    if (!lastEvents || !lastEvents.placed) return;
    audio.place();
    if (lastEvents.linesCleared > 0) {
      audio.clear(lastEvents.linesCleared, lastEvents.comboAfter);
    }
  }, [lastEvents]);

  // Sound: victory fanfare or defeat sting when the game ends.
  useEffect(() => {
    if (!gameOver || !evaluation) return;
    const newBest = meta?.mode === 'endless' && !!state && state.score > endlessBestAtStartRef.current;
    if (evaluation.complete || newBest) audio.victory();
    else audio.defeat();
  }, [gameOver, evaluation, meta, state]);

  // Seamless flow: on a cleared campaign level, offer the next one directly
  // from the overlay — no exit → mode → level-select round-trip.
  const nextLevel = useMemo(() => {
    if (!gameOver || !evaluation?.complete) return null;
    if (!meta || meta.mode !== 'campaign' || !meta.level) return null;
    return nextCampaignLevel(meta.level.number);
  }, [gameOver, evaluation, meta]);

  // Live-clear: objective already met while still playing — the target glows
  // and a floating NEXT LEVEL pill lets the player skip ahead instantly.
  const targetCleared = useMemo(() => {
    if (gameOver || !state || !meta?.level || meta.mode !== 'campaign') return false;
    return engine.evaluateObjective(meta.level, state).complete;
  }, [gameOver, state, meta]);

  // bank the cleared result once, the moment it happens (idempotent merge)
  const recordedSetRef = useRef<Set<string>>(new Set());
  const clearKey = state ? `${state.seed}:${targetCleared}` : 'none';
  useEffect(() => {
    if (!targetCleared || recordedSetRef.current.has(clearKey)) return;
    recordedSetRef.current.add(clearKey);
    useGameStore.getState().recordLiveClear();
    audio.objectiveGlow();
  }, [targetCleared, clearKey]);

  const handleLiveNextLevel = () => {
    if (!meta || meta.mode !== 'campaign' || !meta.level) return;
    const n = nextCampaignLevel(meta.level.number);
    if (!n) return;
    useGameStore.getState().startGame({ mode: 'campaign', level: n });
  };

  const handleNextLevel = () => {
    if (!nextLevel) return;
    useGameStore.getState().startGame({ mode: 'campaign', level: nextLevel });
    // state/meta are replaced → gameOver flips false → overlay unmounts
  };

  const handleExit = () => {
    useAppStore.getState().navigate('home');
    useGameStore.getState().exitGame();
  };

  const handleRestart = () => {
    setPaused(false);
    setGain(null);
    endlessBestAtStartRef.current = endlessBest;
    useGameStore.getState().restart();
  };

  if (!meta || !state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-sm text-[var(--db-text-dim)]">No active game session.</p>
        <button
          type="button"
          onClick={handleExit}
          className="rounded-full bg-[var(--db-violet)] px-6 py-3 font-bold shadow-[var(--db-shadow)]"
        >
          BACK TO HOME
        </button>
      </div>
    );
  }

  return (
    <div className="db-no-select relative flex min-h-screen flex-col">
      {/* ---------------- HUD ---------------- */}
      <header className="safe-top px-4 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[0.22em] text-[var(--db-text-dim)]">
            {modeLabel(meta.mode, meta.level)}
          </span>
          {!gameOver && (
            <div className="flex items-center gap-2">
              <AudioToggle />
              <button
                type="button"
                aria-label="Pause game"
                onClick={() => setPaused(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--db-surface)] text-base ring-1 ring-white/10 active:scale-95"
              >
                ⏸
              </button>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="relative" aria-live="polite">
            <div key={pulseKey} className="db-pop text-4xl font-black leading-none tabular-nums">
              {displayScore}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-[var(--db-text-dim)]">
              score
            </div>
            {gain && (
              <div
                key={gain.key}
                className="db-float-in pointer-events-none absolute -top-5 right-0 text-base font-black text-[var(--db-mint)]"
              >
                +{gain.amount}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="relative">
              <div
                className={`rounded-full bg-[var(--db-surface)] px-3 py-1.5 text-xs font-bold ring-1 ring-white/10 ${
                  targetCleared ? 'db-target-glow' : ''
                }`}
              >
                {objectiveText(meta, state)}
              </div>
              {targetCleared && (
                <button
                  type="button"
                  onClick={handleLiveNextLevel}
                  aria-label="Target cleared — go to next level"
                  className="db-pop absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-full bg-[var(--db-mint)] px-3.5 py-2 text-[11px] font-black text-[#0b1026] shadow-lg shadow-[var(--db-mint)]/20 active:scale-95"
                >
                  NEXT LEVEL ▶
                </button>
              )}
            </div>
            {combo >= 2 && (
              <div
                key={combo}
                className="db-pop rounded-full bg-[rgba(250,204,21,0.14)] px-3 py-1 text-xs font-black text-[var(--db-yellow)] ring-1 ring-[var(--db-yellow)]/40"
              >
                🔥 COMBO ×{combo}
              </div>
            )}
          </div>
        </div>

        {meta.mode === 'duel' && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--db-surface-strong)] text-[11px] font-bold ring-1 ring-white/10">
              {(opponent?.username ?? 'OPPONENT').slice(0, 1).toUpperCase()}
            </div>
            <span className="font-semibold">{opponent?.username ?? 'OPPONENT'}</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--db-surface)] px-2.5 py-1 text-[var(--db-text-dim)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--db-cyan)]" />
              waiting…
            </span>
          </div>
        )}

        {meta.mode === 'endless' && (
          <div className="mt-2 text-right text-xs text-[var(--db-text-dim)]">BEST {endlessBest}</div>
        )}
      </header>

      {/* ---------------- Board + tray ---------------- */}
      <main className="flex flex-1 flex-col items-center justify-start gap-2 pt-3">
        <BlockBoard disabled={paused || gameOver} />
      </main>

      {/* ---------------- Pause menu ---------------- */}
      {paused && !gameOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="db-float-in flex w-64 flex-col gap-3 rounded-3xl bg-[var(--db-bg-1)] p-6 shadow-[var(--db-shadow)] ring-1 ring-white/10">
            <h2 className="text-center text-lg font-black tracking-[0.2em]">PAUSED</h2>
            <button
              type="button"
              onClick={() => setPaused(false)}
              className="rounded-full bg-[var(--db-violet)] py-3 font-bold active:scale-95"
            >
              RESUME
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-full bg-[var(--db-surface-strong)] py-3 font-bold ring-1 ring-white/10 active:scale-95"
            >
              RESTART
            </button>
            <button
              type="button"
              onClick={handleExit}
              className="rounded-full py-3 font-bold text-[var(--db-text-dim)] active:scale-95"
            >
              EXIT
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Game over ---------------- */}
      {gameOver && state && (
        <GameOverOverlay
          open
          won={evaluation?.complete ?? state.status === 'won'}
          score={state.score}
          stars={evaluation?.stars ?? 0}
          mode={meta.mode}
          level={meta.level}
          isNewBest={meta.mode === 'endless' && state.score > endlessBestAtStartRef.current}
          bestScore={meta.mode === 'endless' ? Math.max(endlessBest, state.score) : undefined}
          onRetry={handleRestart}
          onExit={handleExit}
          onNext={nextLevel ? handleNextLevel : undefined}
        />
      )}
    </div>
  );
}

export default GameScreen;

// ---------------------------------------------------------------------------
// HUD helpers
// ---------------------------------------------------------------------------

function modeLabel(mode: GameMode, level: LevelDef | null): string {
  switch (mode) {
    case 'campaign':
      return level ? `CH ${level.chapter} · LV ${level.number}` : 'CAMPAIGN';
    case 'duel':
      return 'DUEL';
    case 'daily':
      return 'DAILY';
    case 'challenge':
      return 'CHALLENGE';
    case 'endless':
      return 'ENDLESS';
  }
}

/** Objective chip text, derived from meta.level.objective + live state. */
function objectiveText(meta: SessionMeta, state: GameState): string {
  const level = meta.level;
  if (!level) return 'ENDLESS';
  const o: Objective = level.objective;
  const movesLeft = (limit: number) => `${Math.max(0, limit - state.moves)} MOVES`;
  switch (o.kind) {
    case 'targetScore':
      return `TARGET ${o.target}`;
    case 'scoreWithinMoves':
      return `${o.target} PTS · ${movesLeft(o.moveLimit)}`;
    case 'lineClears': {
      const left = Math.max(0, o.requiredLines - state.linesCleared);
      const linePart = `${left} LINE${left === 1 ? '' : 'S'}`;
      return o.moveLimit ? `${linePart} · ${movesLeft(o.moveLimit)}` : linePart;
    }
    case 'combo': {
      const comboPart = `COMBO ×${o.comboTarget}`;
      return o.moveLimit ? `${comboPart} · ${movesLeft(o.moveLimit)}` : comboPart;
    }
  }
}

/** Animated score count-up (ease-out, ~450ms per change). */
function useCountUp(target: number, durationMs = 450): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = durationMs > 0 ? Math.min(1, (now - t0) / durationMs) : 1;
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      valueRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
