import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Board, ColorKey, TrayPiece } from '../../../types/game';
import { engine } from '../engine';
import { cellsUnderGhost, type PieceAnchor } from './geometry';

export interface GhostState {
  trayIndex: number;
  color: ColorKey;
  cells: [number, number][];
  w: number;
  h: number;
  /** Pointer position in viewport coordinates (clientX / clientY). */
  x: number;
  y: number;
}

interface DragSession {
  trayIndex: number;
  piece: TrayPiece;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export interface UseDragOptions {
  /** The board grid element — measured every animation frame during a drag. */
  boardRef: RefObject<HTMLDivElement | null>;
  /** Board column count (derives the rendered cell size from the measured rect). */
  cols: number;
  /** Live board matrix for legality checks. */
  getBoard: () => Board | null;
  /** Successful drop → forward to gameStore.placePiece. */
  onDrop: (trayIndex: number, r: number, c: number) => void;
  /** Pointer released without a drag (or keyboard activate) → tap-to-select. */
  onTap: (trayIndex: number) => void;
  /** When true (paused / finished) dragging is disabled. */
  disabled?: boolean;
}

export interface DragApi {
  ghost: GhostState | null;
  /** Current snap anchor while dragging; null when the pointer is off-board. */
  anchor: PieceAnchor | null;
  /** Legal placement at the current anchor? null when there is no anchor. */
  anchorValid: boolean | null;
  /** True between pointerdown and pointerup while a drag is in flight. */
  dragging: boolean;
  onTrayPointerDown: (e: ReactPointerEvent, piece: TrayPiece, trayIndex: number) => void;
  /** Abort an in-flight drag without dropping (pause, unmount, game end). */
  cancelDrag: () => void;
}

/** Pointer travel below which a pointerup counts as a tap, not a drop. */
const TAP_SLOP_PX = 8;

/**
 * Pointer-events drag engine for tray pieces.
 *
 * onTrayPointerDown starts a session; window-level pointermove/up listeners
 * track it (works on touch thanks to implicit pointer capture + bubbling).
 * Position updates are throttled to one rAF per frame; each frame measures the
 * board rect, snaps the ghost with cellsUnderGhost and asks the engine whether
 * the anchor is legal. A release over a valid target fires onDrop; a release
 * without movement fires onTap (tap-to-select fallback). No page scrolling:
 * the ghost is position:fixed and the tray/board are touch-action:none.
 */
export function useDrag(options: UseDragOptions): DragApi {
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [anchor, setAnchor] = useState<PieceAnchor | null>(null);
  const [anchorValid, setAnchorValid] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);

  // Always-current options without re-binding listeners mid-drag.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sessionRef = useRef<DragSession | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const anchorRef = useRef<PieceAnchor | null>(null);
  const validRef = useRef<boolean | null>(null);

  const scheduleFrame = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingRef.current;
      const session = sessionRef.current;
      if (!p || !session) return;
      const opts = optionsRef.current;
      const rect = opts.boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const board = opts.getBoard();
      const cellSize = opts.cols > 0 ? rect.width / opts.cols : 0;
      const a = board && cellSize > 0 ? cellsUnderGhost(rect, cellSize, session.piece.cells, p.x, p.y) : null;
      const valid = a && board ? engine.canPlaceAt(board, session.piece.cells, a.r, a.c) : null;
      anchorRef.current = a;
      validRef.current = valid;
      setGhost({
        trayIndex: session.trayIndex,
        color: session.piece.color,
        cells: session.piece.cells,
        w: session.piece.w,
        h: session.piece.h,
        x: p.x,
        y: p.y,
      });
      setAnchor(a);
      setAnchorValid(valid);
    });
  }, []);

  /** End the session. drop=true + moved → drop at the last anchor; !moved → tap. */
  const endDrag = useCallback((drop: boolean, allowTap: boolean) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    const session = sessionRef.current;
    sessionRef.current = null;
    pendingRef.current = null;
    setDragging(false);
    setGhost(null);
    setAnchor(null);
    setAnchorValid(null);
    if (!session) return;
    const opts = optionsRef.current;
    if (drop && session.moved && anchorRef.current && validRef.current) {
      opts.onDrop(session.trayIndex, anchorRef.current.r, anchorRef.current.c);
    } else if (allowTap && !session.moved) {
      opts.onTap(session.trayIndex);
    }
    anchorRef.current = null;
    validRef.current = null;
  }, []);

  // Handlers are declared after endDrag but bound by it; keep a stable ref.
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;

  const onMove = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      e.preventDefault();
      if (!session.moved && Math.hypot(e.clientX - session.startX, e.clientY - session.startY) > TAP_SLOP_PX) {
        session.moved = true;
      }
      pendingRef.current = { x: e.clientX, y: e.clientY };
      scheduleFrame();
    },
    [scheduleFrame],
  );

  const onUp = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    endDragRef.current(true, true);
  }, []);

  const onCancel = useCallback((e: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    endDragRef.current(false, false);
  }, []);

  const onTrayPointerDown = useCallback(
    (e: ReactPointerEvent, piece: TrayPiece, trayIndex: number) => {
      if (optionsRef.current.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      sessionRef.current = {
        trayIndex,
        piece,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      pendingRef.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
      // Paint the ghost at once (un-anchored); the first frame refines it.
      setGhost({
        trayIndex,
        color: piece.color,
        cells: piece.cells,
        w: piece.w,
        h: piece.h,
        x: e.clientX,
        y: e.clientY,
      });
      setAnchor(null);
      setAnchorValid(null);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      scheduleFrame();
    },
    [onMove, onUp, onCancel, scheduleFrame],
  );

  const cancelDrag = useCallback(() => endDragRef.current(false, false), []);

  // Unmount / option-change safety: abort cleanly, never fire a phantom drop.
  useEffect(() => () => endDragRef.current(false, false), []);

  return { ghost, anchor, anchorValid, dragging, onTrayPointerDown, cancelDrag };
}
