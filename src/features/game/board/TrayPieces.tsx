import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { ColorKey, TrayPiece } from '../../../types/game';

/** Gradient + inset highlight for one block of a piece colour (theme tokens). */
export function blockStyle(color: ColorKey): CSSProperties {
  const v = `var(--db-${color})`;
  return {
    background: `linear-gradient(180deg, color-mix(in srgb, ${v} 72%, white) 0%, ${v} 55%, color-mix(in srgb, ${v} 70%, black) 100%)`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.28)',
  };
}

interface TrayPiecesProps {
  tray: (TrayPiece | null)[];
  selectedTrayIndex: number | null;
  /** Tray index currently in flight (ghost on screen) — rendered dimmed. */
  liftedIndex?: number | null;
  onPiecePointerDown: (e: ReactPointerEvent, piece: TrayPiece, trayIndex: number) => void;
  /** Tap / keyboard activate a piece (accessibility fallback). */
  onPieceTap?: (trayIndex: number) => void;
  disabled?: boolean;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/**
 * The player's tray of 3 pieces. Mini grids rendered at half the board cell
 * size (var(--db-cell) comes from the parent board). Used-up slots are dimmed
 * placeholders; the selected piece lifts; touch-action:none keeps drags from
 * scrolling the page.
 */
export function TrayPieces({
  tray,
  selectedTrayIndex,
  liftedIndex,
  onPiecePointerDown,
  onPieceTap,
  disabled,
}: TrayPiecesProps) {
  return (
    <div className="flex w-full items-stretch justify-center gap-3 px-2" data-testid="tray">
      {tray.map((piece, i) => {
        const selected = selectedTrayIndex === i;
        const lifted = liftedIndex === i;
        return (
          <div
            key={i}
            className={`flex h-20 min-w-0 flex-1 items-center justify-center rounded-2xl bg-[var(--db-surface)] ring-1 transition-opacity duration-150 ${
              piece === null ? 'opacity-30' : lifted ? 'opacity-35' : 'opacity-100 ring-white/10'
            }`}
          >
            {piece === null ? (
              <div className="h-9 w-9 rounded-lg border border-dashed border-white/15" aria-label="empty slot" />
            ) : (
              <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`Block piece ${i + 1}: ${piece.shapeId}`}
                aria-pressed={selected}
                className="db-no-select cursor-grab touch-none outline-none transition-transform duration-150 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--db-cyan)]"
                style={{
                  transform:
                    selected && !lifted ? 'translateY(-6px) scale(1.05)' : 'translateY(0) scale(1)',
                }}
                onPointerDown={e => {
                  if (!disabled) onPiecePointerDown(e, piece, i);
                }}
                onKeyDown={e => {
                  if (!disabled && onPieceTap && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onPieceTap(i);
                  }
                }}
              >
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${piece.w}, calc(var(--db-cell) / 2))`,
                    gridTemplateRows: `repeat(${piece.h}, calc(var(--db-cell) / 2))`,
                  }}
                >
                  {range(piece.h).flatMap(r =>
                    range(piece.w).map(c => {
                      const filled = piece.cells.some(([pr, pc]) => pr === r && pc === c);
                      return (
                        <div key={`${r}-${c}`} className="p-[2px]">
                          {filled && <div className="h-full w-full rounded-[4px]" style={blockStyle(piece.color)} />}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
