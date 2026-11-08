import { Chess, type Color, type Square } from 'chess.js';

/** How good a position is, for the side to move, as the engine reports it. */
export type EngineScore = { kind: 'cp'; value: number } | { kind: 'mate'; value: number };

export interface EngineInfo {
  depth: number;
  /** Which of the best lines this is, from 1. */
  rank: number;
  score: EngineScore;
  /** Moves in the engine's notation, such as `e2e4`. */
  pv: string[];
}

export interface EngineLine {
  rank: number;
  depth: number;
  /** From White's side, so that the sign means the same whoever is to move. */
  score: EngineScore;
  moves: readonly LineMove[];
}

export interface LineMove {
  san: string;
  /** The position after this move. */
  fen: string;
  from: string;
  to: string;
  /** In the engine's notation, such as `e7e8n`, which tells apart what a pawn promotes to. */
  uci: string;
}

/** Reads one `info` line, or null if it does not describe a line of play. */
export function parseInfo(text: string): EngineInfo | null {
  if (!text.startsWith('info ')) return null;
  const words = text.split(/\s+/);
  const after = (word: string) => {
    const index = words.indexOf(word);
    return index === -1 ? undefined : words[index + 1];
  };
  const depth = Number(after('depth'));
  const pvStart = words.indexOf('pv');
  const scoreStart = words.indexOf('score');
  if (!Number.isInteger(depth) || pvStart === -1 || scoreStart === -1) return null;

  const value = Number(words[scoreStart + 2]);
  const kind = words[scoreStart + 1];
  if (!Number.isFinite(value) || (kind !== 'cp' && kind !== 'mate')) return null;

  const pv = words.slice(pvStart + 1).filter(Boolean);
  if (!pv.length) return null;
  return { depth, rank: Number(after('multipv') ?? 1), score: { kind, value }, pv };
}

/** Reads a `bestmove` line. The move is null when there is none to play. */
export function parseBestMove(text: string): { move: string | null } | null {
  const match = /^bestmove\s+(\S+)/.exec(text);
  if (!match) return null;
  return { move: match[1] === '(none)' ? null : match[1]! };
}

export function scoreForWhite(score: EngineScore, fen: string): EngineScore {
  return fen.split(' ')[1] === 'b' ? { ...score, value: -score.value } : score;
}

/** Such as `+0.35`, `-1.20` or `#-3`, always from White's side. */
export function formatScore(score: EngineScore): string {
  if (score.kind === 'mate') return `#${score.value}`;
  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

/** Writes an engine line as moves, stopping at the first that cannot be played. */
export function lineMoves(fen: string, pv: readonly string[]): LineMove[] {
  const moves: LineMove[] = [];
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return moves;
  }
  for (const uci of pv) {
    try {
      const played = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
      moves.push({ san: played.san, fen: chess.fen(), from: played.from, to: played.to, uci: `${played.from}${played.to}${played.promotion ?? ''}` });
    } catch {
      break;
    }
  }
  return moves;
}

export function toEngineLine(info: EngineInfo, fen: string): EngineLine {
  return { rank: info.rank, depth: info.depth, score: scoreForWhite(info.score, fen), moves: lineMoves(fen, info.pv) };
}

function findKing(chess: Chess, color: Color): Square | null {
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (piece?.type === 'k' && piece.color === color) return piece.square;
    }
  }
  return null;
}

export type PositionState = 'playable' | 'over' | 'impossible';

/**
 * Stockfish can crash on a position that cannot occur, and a misread diagram often is one. So
 * nothing goes to the engine until it has been checked, including the case chess.js allows of the
 * side that just moved standing in check.
 */
export function positionState(fen: string): PositionState {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return 'impossible';
  }
  const mover = chess.turn();
  const other: Color = mover === 'w' ? 'b' : 'w';
  const otherKing = findKing(chess, other);
  if (!otherKing || !findKing(chess, mover) || chess.isAttacked(otherKing, mover)) return 'impossible';
  const hasPawnOnEdge = chess.board().some((rank, row) => (row === 0 || row === 7) && rank.some((piece) => piece?.type === 'p'));
  if (hasPawnOnEdge) return 'impossible';
  // Measured: Stockfish crashes on a ninth pawn, or on more than 16 pieces a side.
  for (const color of ['w', 'b'] as const) {
    const pieces = chess.board().flat().filter((piece) => piece?.color === color);
    if (pieces.length > 16 || pieces.filter((piece) => piece?.type === 'p').length > 8) return 'impossible';
  }
  return chess.moves().length ? 'playable' : 'over';
}
