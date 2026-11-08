import { Chess } from 'chess.js';
import { gradeMove, type MoveJudgement } from './guess';
import { positionState, type EngineLine, type EngineScore, type LineMove } from './uci';

/**
 * White's share of a bar from 0 to 1, by Lichess's measure of winning chances, so that a pawn up
 * near equality moves it more than a pawn up when a rook ahead. A mate fills it.
 */
export function whiteShare(score: EngineScore): number {
  if (score.kind === 'mate') return score.value > 0 ? 1 : score.value < 0 ? 0 : 0.5;
  // why: W-C6624F
  const chances = 2 / (1 + Math.exp(-0.00368208 * score.value)) - 1;
  return (chances + 1) / 2;
}

export type Side = 'white' | 'black';

export type Verdict =
  | { kind: 'equal' }
  | { kind: 'better'; side: Side; degree: 'slightly' | 'clearly' | 'winning'; pawns: number }
  | { kind: 'mate'; side: Side; moves: number };

const EQUAL_CENTIPAWNS = 30;
const SLIGHT_CENTIPAWNS = 100;
const CLEAR_CENTIPAWNS = 300;

/** What a score means, in words a reader who does not count in pawns can follow. */
export function verdictOf(score: EngineScore): Verdict {
  if (score.kind === 'mate') return { kind: 'mate', side: score.value >= 0 ? 'white' : 'black', moves: Math.abs(score.value) };
  const size = Math.abs(score.value);
  if (size < EQUAL_CENTIPAWNS) return { kind: 'equal' };
  const degree = size < SLIGHT_CENTIPAWNS ? 'slightly' : size < CLEAR_CENTIPAWNS ? 'clearly' : 'winning';
  return { kind: 'better', side: score.value > 0 ? 'white' : 'black', degree, pawns: Math.round(size / 10) / 10 };
}

/**
 * The position with the other side to move, to see what it threatens. Null when that cannot be a
 * real position, as when the side to move is in check.
 */
export function threatFen(fen: string): string | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  try {
    if (new Chess(fen).inCheck()) return null;
  } catch {
    return null;
  }
  // White moving out of turn after Black is on the next move number, as a book would count it.
  if (parts[1] === 'b' && parts[5]) parts[5] = String((Number(parts[5]) || 1) + 1);
  parts[1] = parts[1] === 'b' ? 'w' : 'b';
  parts[3] = '-';
  const flipped = parts.join(' ');
  return positionState(flipped) === 'playable' ? flipped : null;
}

export interface NumberedMove {
  /** Such as `14.`, or `14...` when a line starts with Black's move. Null between. */
  number: string | null;
  move: LineMove;
  index: number;
}

/** Move numbers as a book writes them: 14. Nf3 Nc6, or 14... Nc6 when Black starts. */
export function numberedLine(fen: string, moves: readonly LineMove[]): NumberedMove[] {
  const parts = fen.split(' ');
  let number = Number(parts[5]) || 1;
  let isWhite = parts[1] !== 'b';
  return moves.map((move, index) => {
    const label = isWhite ? `${number}.` : index === 0 ? `${number}...` : null;
    if (!isWhite) number += 1;
    isWhite = !isWhite;
    return { number: label, move, index };
  });
}

export const lineText = (moves: readonly NumberedMove[]): string => moves.map((m) => (m.number ? `${m.number} ${m.move.san}` : m.move.san)).join(' ');

export interface BookComparison {
  /** The book's move among the engine's lines, from 1, or null if it is not among them. */
  rank: number | null;
  judgement: MoveJudgement;
}

/**
 * How the book's move stands against the engine's best. Its score is needed only when it is not one
 * of `lines`. Scores are from White's side, as in an EngineLine.
 */
export function compareBookMove(lines: readonly EngineLine[], bookUci: string, moverIsWhite: boolean, bookScore?: EngineScore | null): BookComparison | null {
  const best = lines[0];
  if (!best) return null;
  const found = lines.find((line) => line.moves[0]?.uci === bookUci);
  const score = found?.score ?? bookScore;
  if (!score) return null;
  return { rank: found?.rank ?? null, judgement: gradeMove(score, best.score, moverIsWhite) };
}
