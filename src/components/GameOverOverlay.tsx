/**
 * DUO BLOCKS — game-over overlay.
 * Presentational only: the GameScreen (separate workstream) decides when to
 * mount it and wires Retry / Next Level / Exit to the game store.
 * Confetti + star animations reuse the keyframes in theme.css.
 */
import { useMemo } from 'react';
import type { GameMode, GameStatus, LevelDef } from '../types/game';
import { usePlayerStore } from '../store/playerStore';
import { PrimaryButton } from './Shared';

export interface GameOverOverlayProps {
  /** Render when true; defaults to true (GameScreen mounts conditionally). */
  open?: boolean;
  /** Force win/loss; when omitted, derived from `status` ('won' = win). */
  won?: boolean;
  /** Engine end status of the finished game. */
  status?: GameStatus;
  score: number;
  /** 0–3 stars; rendered for campaign results and for wins in other modes. */
  stars?: 0 | 1 | 2 | 3;
  mode: GameMode;
  /** Campaign level just played (shown as subtitle). */
  level?: LevelDef | null;
  /** Optional stat chips (GameScreen passes the engine totals). */
  lines?: number;
  blocks?: number;
  combo?: number;
  isNewBest?: boolean;
  bestScore?: number;
  onRetry: () => void;
  /** Campaign only — advance to the next level; omit to hide the button. */
  onNext?: () => void;
  /** Leave the game. `onHome` is an alias used by the GameScreen workstream. */
  onExit?: () => void;
  onHome?: () => void;
}

const CONFETTI_COLORS = [
  'var(--db-violet)',
  'var(--db-cyan)',
  'var(--db-coral)',
  'var(--db-yellow)',
  'var(--db-mint)',
];

export function GameOverOverlay({
  open,
  won,
  status,
  score,
  stars,
  mode,
  level,
  lines,
  blocks,
  combo,
  isNewBest = false,
  bestScore,
  onRetry,
  onNext,
  onExit,
  onHome,
}: GameOverOverlayProps) {
  const progressLevels = usePlayerStore(s => s.progress.levels);
  // Deterministic pseudo-random confetti layout (stable per open/close cycle).
  const confetti = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: (i * 3.9 + (i % 5) * 1.7) % 100,
        delay: ((i * 37) % 60) / 100,
        duration: 0.9 + ((i * 53) % 70) / 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tall: i % 3 === 0,
      })),
    [],
  );

  const shown = open ?? true;
  const didWin = won ?? status === 'won';
  // Star fallback: recordResult has already merged the finished run into the
  // player store, so campaign wins can read the earned stars from progress.
  const starsShown =
    stars ?? (didWin && mode === 'campaign' && level ? (progressLevels[level.id]?.stars ?? 0) : undefined);
  const showStars = typeof starsShown === 'number' && (mode === 'campaign' || didWin);
  const exit = onExit ?? onHome;

  if (!shown) return null;

  const title = didWin
    ? mode === 'campaign'
      ? 'LEVEL CLEAR!'
      : 'VICTORY!'
    : status === 'moves exhausted'
      ? 'OUT OF MOVES!'
      : mode === 'endless'
        ? 'RUN OVER'
        : 'SO CLOSE!';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,7,22,0.82)] px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={didWin ? 'Victory screen' : 'Game over screen'}
    >
      {didWin && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-28 h-44">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="absolute bottom-0 rounded-[2px]"
              style={{
                left: `${c.left}%`,
                width: c.tall ? 8 : 6,
                height: c.tall ? 14 : 10,
                background: c.color,
                animation: `db-confetti ${c.duration}s ease-out ${c.delay}s both`,
              }}
            />
          ))}
        </div>
      )}

      <div className="db-float-in relative w-full max-w-[340px] rounded-3xl border border-white/10 bg-[var(--db-bg-1)] p-6 text-center shadow-[var(--db-shadow)]">
        <p className={`db-pop text-2xl font-black tracking-wide ${didWin ? 'text-[var(--db-mint)]' : 'text-[var(--db-coral)]'}`}>
          {title}
        </p>
        {level && (
          <p className="mt-1 text-xs font-semibold text-[var(--db-text-dim)]">
            {level.number}. {level.name}
          </p>
        )}

        {showStars && (
          <div className="mt-4 flex justify-center gap-2 text-3xl">
            {([1, 2, 3] as const).map(n => (
              <span
                key={n}
                className={(starsShown ?? 0) >= n ? 'db-pop text-[var(--db-yellow)]' : 'text-white/15'}
                style={{ animationDelay: `${n * 120}ms` }}
              >
                ★
              </span>
            ))}
          </div>
        )}

        <div className="mt-5">
          <p className="text-[0.62rem] font-bold tracking-[0.2em] text-[var(--db-text-dim)] uppercase">Score</p>
          <p className="text-4xl font-black text-[var(--db-text)]">{score.toLocaleString()}</p>
          {isNewBest && (
            <p className="db-pop mt-1 text-[0.68rem] font-black tracking-[0.16em] text-[var(--db-yellow)] uppercase">
              ✨ New personal best
            </p>
          )}
          {!isNewBest && typeof bestScore === 'number' && bestScore > 0 && (
            <p className="mt-1 text-[0.7rem] text-[var(--db-text-dim)]">Best {bestScore.toLocaleString()}</p>
          )}
        </div>

        {(lines !== undefined || blocks !== undefined || (combo !== undefined && combo > 1)) && (
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-[0.62rem] font-bold text-[var(--db-text-dim)]">
            {blocks !== undefined && <span className="rounded-full bg-white/5 px-2.5 py-1">🧱 {blocks} blocks</span>}
            {lines !== undefined && <span className="rounded-full bg-white/5 px-2.5 py-1">🧹 {lines} lines</span>}
            {combo !== undefined && combo > 1 && (
              <span className="rounded-full bg-[var(--db-coral)]/15 px-2.5 py-1 text-[var(--db-coral)]">🔥 ×{combo} combo</span>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {didWin && mode === 'campaign' && onNext && (
            <PrimaryButton tone="mint" onClick={onNext}>
              Next level →
            </PrimaryButton>
          )}
          <PrimaryButton tone="violet" onClick={onRetry}>
            Retry
          </PrimaryButton>
          {exit && (
            <button
              type="button"
              onClick={exit}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[0.7rem] font-black tracking-[0.16em] text-[var(--db-text-dim)] uppercase transition active:scale-[0.97]"
            >
              Exit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameOverOverlay;
