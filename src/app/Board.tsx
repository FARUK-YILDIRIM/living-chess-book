import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef } from 'react';

interface BoardProps {
  fen: string;
  lastMove?: [string, string] | undefined;
  onUserMove: (from: string, to: string) => void;
  /** A change puts the board back on `fen`, after a move that did not count. */
  resetKey?: number;
  orientation?: 'white' | 'black';
  /** Arrows the app draws, such as the engine's best moves. */
  arrows?: readonly DrawShape[];
  /** A position only looked at, as while a line is pointed at. Nothing can be moved then. */
  isPreview?: boolean;
}

function legalDestinations(fen: string): Map<Key, Key[]> {
  const destinations = new Map<Key, Key[]>();
  try {
    const chess = new Chess(fen);
    for (const move of chess.moves({ verbose: true })) {
      const list = destinations.get(move.from as Square as Key) ?? [];
      list.push(move.to as Square as Key);
      destinations.set(move.from as Square as Key, list);
    }
  } catch {
    // An unreadable diagram can be shown, but no moves can be tried on it.
  }
  return destinations;
}

/** The live board. Readers can try their own moves on it from any position. */
export function Board({ fen, lastMove, onUserMove, resetKey = 0, orientation = 'white', arrows = NO_ARROWS, isPreview = false }: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onUserMove);
  onMoveRef.current = onUserMove;

  useEffect(() => {
    if (!element.current) return;
    api.current = Chessground(element.current, {
      coordinates: true,
      movable: {
        free: false,
        showDests: true,
        events: { after: (from, to) => onMoveRef.current(from, to) },
      },
      animation: { enabled: true, duration: 150 },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const side = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    api.current?.set({
      fen: fen.split(' ')[0]!,
      turnColor: side,
      orientation,
      check: isInCheck(fen),
      lastMove: lastMove as [Key, Key] | undefined,
      movable: { color: isPreview ? undefined : side, dests: isPreview ? new Map() : legalDestinations(fen) },
    });
  }, [fen, lastMove, resetKey, orientation, isPreview]);

  useEffect(() => {
    api.current?.setAutoShapes([...arrows]);
  }, [arrows]);

  // Chessground puts classes of its own on this element, which a className from here would wipe out.
  // why: W-00C9B8
  useEffect(() => {
    element.current?.classList.toggle('previewing', isPreview);
  }, [isPreview]);

  return <div className="board" ref={element} />;
}

const NO_ARROWS: readonly DrawShape[] = [];

function isInCheck(fen: string): boolean {
  try {
    return new Chess(fen).inCheck();
  } catch {
    return false;
  }
}
