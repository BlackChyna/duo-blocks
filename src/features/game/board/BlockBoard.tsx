import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { engine } from '../engine';
import { useDrag } from './useDrag';
import { TrayPieces, blockStyle } from './TrayPieces';

const CLEAR_ANIM_MS = 350; // must match the db-clear-burst keyframes in theme.css
const POP_ANIM_MS = 260; // must match the db-pop keyframes
const TAP_FAIL_MS = 300;

/** Grey crosshatch for obstacle cells (Cell = 2). */
const OBSTACLE_STYLE: CSSProperties = {
  backgroundColor: 'var(--db-obstacle)',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(0,0,0,0.38) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.38) 0 2px, transparent 2px 6px)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
};

/** Neutral premium fill for occupied cells (the board does not track colours). */
const FILLED_STYLE: CSSProperties = {
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--db-violet) 72%, white) 0%, var(--db-violet) 55%, color-mix(in srgb, var(--db-violet) 70%, black) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.28)',
};

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/**
 * The interactive puzzle: board grid + tray + drag ghost.
 * Reads the live GameState from gameStore; every successful drop funnels
 * through gameStore.placePiece(trayIndex, r, c). Fits a 360px phone without
 * scrolling — the cell size is a CSS var: min((100vw - 48px)/cols, (100dvh -
 * 330px)/rows, 52px).
 */
export function BlockBoard({ disabled = false }: { disabled?: boolean }) {
  const state = useGameStore(s => s.state);
  const lastEvents = useGameStore(s => s.lastEvents);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const [cellPx, setCellPx] = useState(0);
  const [clearing, setClearing] = useState<Set<string>>(new Set());
  const [popping, setPopping] = useState<Set<string>>(new Set());
  const [selectedTrayIndex, setSelectedTrayIndex] = useState<number | null>(null);
  const [tapRejected, setTapRejected] = useState(false);

  const blocked = disabled || !state || state.status !== 'active';

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // ---- clearing animation: cells from lastEvents.clearedCells burst 350ms ---
  useEffect(() => {
    if (!lastEvents || lastEvents.clearedCells.length === 0) return;
    const keys = lastEvents.clearedCells.map(([r, c]) => `${r}:${c}`);
    setClearing(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      return next;
    });
    later(() => {
      setClearing(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
    }, CLEAR_ANIM_MS);
  }, [lastEvents, later]);

  // Reset transient UI when a fresh game starts (restart / new session).
  useEffect(() => {
    if (state && state.history.length === 0) {
      setSelectedTrayIndex(null);
      setClearing(new Set());
      setPopping(new Set());
    }
  }, [state]);

  // ---- measured cell size (exact — the grid has no gaps or padding) --------
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !state) return;
    const update = () => setCellPx(el.getBoundingClientRect().width / state.cols);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-subscribe when the board size changes
  }, [state?.cols, state?.rows]);

  const handleDrop = useCallback(
    (trayIndex: number, r: number, c: number) => {
      const st = useGameStore.getState().state;
      const piece = st?.tray[trayIndex];
      if (!st || !piece) return;
      const keys = piece.cells.map(([dr, dc]) => `${r + dr}:${c + dc}`);
      setPopping(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.add(k));
        return next;
      });
      later(
        () =>
          setPopping(prev => {
            const next = new Set(prev);
            keys.forEach(k => next.delete(k));
            return next;
          }),
        POP_ANIM_MS,
      );
      setSelectedTrayIndex(null);
      useGameStore.getState().placePiece(trayIndex, r, c);
    },
    [later],
  );

  const toggleSelect = useCallback((trayIndex: number) => {
    setSelectedTrayIndex(prev => (prev === trayIndex ? null : trayIndex));
  }, []);

  const drag = useDrag({
    boardRef: gridRef,
    cols: state?.cols ?? 8,
    getBoard: () => useGameStore.getState().state?.board ?? null,
    onDrop: handleDrop,
    onTap: toggleSelect,
    disabled: blocked,
  });

  // ---- tap-to-select placement: tapped cell = piece top-left ---------------
  const handleBoardTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (selectedTrayIndex == null || blocked || !state) return;
    const piece = state.tray[selectedTrayIndex];
    const rect = gridRef.current?.getBoundingClientRect();
    if (!piece || !rect) return;
    const size = cellPx > 0 ? cellPx : rect.width / state.cols;
    const c = Math.floor((e.clientX - rect.left) / size);
    const r = Math.floor((e.clientY - rect.top) / size);
    if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return;
    if (engine.canPlaceAt(state.board, piece.cells, r, c)) {
      handleDrop(selectedTrayIndex, r, c);
    } else {
      setTapRejected(true);
      later(() => setTapRejected(false), TAP_FAIL_MS);
    }
  };

  // Cells the in-flight ghost would cover + validity, for the tint overlay.
  const ghostCoverage = useMemo(() => {
    if (!drag.anchor || !drag.ghost) return null;
    const set = new Set<string>();
    for (const [dr, dc] of drag.ghost.cells) set.add(`${drag.anchor.r + dr}:${drag.anchor.c + dc}`);
    return { set, valid: drag.anchorValid === true };
  }, [drag.anchor, drag.anchorValid, drag.ghost]);

  // All legal anchor cells for the selected piece (tap-mode aiming aid).
  const validAnchors = useMemo(() => {
    if (selectedTrayIndex == null || !state || blocked) return null;
    const piece = state.tray[selectedTrayIndex];
    if (!piece) return null;
    const set = new Set<string>();
    for (let r = 0; r <= state.rows - piece.h; r++) {
      for (let c = 0; c <= state.cols - piece.w; c++) {
        if (engine.canPlaceAt(state.board, piece.cells, r, c)) set.add(`${r}:${c}`);
      }
    }
    return set;
  }, [selectedTrayIndex, state, blocked]);

  if (!state) return null;

  const cellCss = `min(calc((100vw - 48px) / ${state.cols}), calc((100dvh - 330px) / ${state.rows}), 52px)`;
  const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
  const ghost = drag.ghost;

  return (
    <div
      className="flex w-full flex-col items-center gap-3 px-2"
      style={{ '--db-cell': cellCss } as CSSProperties}
    >
      {/* Board */}
      <div
        className={cx(
          'rounded-2xl bg-[var(--db-bg-1)] p-[3px] shadow-[var(--db-shadow)] ring-1 transition-colors',
          tapRejected ? 'ring-rose-400/70' : 'ring-white/10',
        )}
      >
        <div
          ref={gridRef}
          role="grid"
          aria-label="Puzzle board"
          className="db-no-select relative grid touch-none"
          style={{
            gridTemplateColumns: `repeat(${state.cols}, var(--db-cell))`,
            gridTemplateRows: `repeat(${state.rows}, var(--db-cell))`,
            width: `calc(var(--db-cell) * ${state.cols})`,
          }}
          onPointerDown={handleBoardTap}
        >
          {state.board.flatMap((row, r) =>
            row.map((v, c) => {
              const key = `${r}:${c}`;
              const isClearing = clearing.has(key);
              const isPopping = popping.has(key);
              const covered = ghostCoverage?.set.has(key) ?? false;
              const showDot = validAnchors?.has(key) ?? false;
              return (
                <div key={key} role="gridcell" className="relative">
                  <div className="absolute inset-[1.5px] rounded-[4px] bg-white/[0.04]" />
                  {v === 2 && <div className="absolute inset-[1.5px] rounded-[4px]" style={OBSTACLE_STYLE} />}
                  {v === 1 && (
                    <div
                      className={cx(
                        'absolute inset-[1.5px] rounded-[4px]',
                        isClearing && 'db-clear-burst',
                        isPopping && 'db-pop',
                      )}
                      style={FILLED_STYLE}
                    />
                  )}
                  {covered && !isClearing && (
                    <div
                      className={cx(
                        'absolute inset-[1.5px] rounded-[4px]',
                        ghostCoverage?.valid ? 'bg-emerald-400/55' : 'bg-rose-500/55',
                      )}
                    />
                  )}
                  {showDot && !covered && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    </div>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* Tray */}
      <TrayPieces
        tray={state.tray}
        selectedTrayIndex={selectedTrayIndex}
        liftedIndex={drag.ghost?.trayIndex ?? null}
        onPiecePointerDown={drag.onTrayPointerDown}
        onPieceTap={toggleSelect}
        disabled={blocked}
      />

      {/* Floating drag ghost — fixed so it follows the pointer over everything */}
      {ghost && cellPx > 0 && (
        <div
          className="pointer-events-none fixed z-50 opacity-95 drop-shadow-[0_14px_18px_rgba(0,0,0,0.5)]"
          style={{
            left: ghost.x - (ghost.w * cellPx) / 2,
            top: ghost.y - (ghost.h * cellPx) / 2,
            transform: 'scale(1.06)',
            willChange: 'transform',
          }}
          data-testid="drag-ghost"
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${ghost.w}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${ghost.h}, ${cellPx}px)`,
            }}
          >
            {range(ghost.h).flatMap(r =>
              range(ghost.w).map(c => {
                const filled = ghost.cells.some(([pr, pc]) => pr === r && pc === c);
                return (
                  <div key={`${r}-${c}`} className="p-[2px]">
                    {filled && <div className="h-full w-full rounded-[4px]" style={blockStyle(ghost.color)} />}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
