import { Chess, type Move } from 'chess.js';
import type { Color, MoveToken } from './types';

const BEAM_WIDTH = 10;
/** Trying every lost reply is slow, so only the likeliest states may do it. */
const INSERTING_STATES = 2;
const SKIP_COST = -7;
const UNLIKELY_USE_COST = -2;
const INSERT_COST = -6;
const WRONG_NUMBER_COST = -6;
const WRONG_COLOR_COST = -2;
const UNMARKED_CAPTURE_COST = -4;
const WRONG_FILE_COST = -2;
const RIGHT_FILE_BONUS = 1;
const MISSING_PROMOTION_COST = -3;
const LOW_CONFIDENCE_SCORE = Math.log(0.25);
const PIECE_COUNT = 6;
const MAX_CACHED_POSITIONS = 20000;
const PRIOR_FOR_LETTERS = 20;
const PRIOR_FOR_NO_PREFIX = 3;

/**
 * Learns what the damaged symbols of one book mean, from the moves that the rest
 * of the line already pinned down. Each book's OCR breaks symbols its own way.
 */
export class GlyphModel {
  private readonly counts = new Map<string, Map<string, number>>();

  constructor() {
    // Plain text is usually right: letters name their piece, and no prefix means a pawn.
    for (const piece of 'nbrqk') this.observe(piece.toUpperCase(), piece, PRIOR_FOR_LETTERS);
    this.observe('', 'p', PRIOR_FOR_NO_PREFIX);
  }

  observe(key: string, piece: string, weight = 1): void {
    const pieces = this.counts.get(key) ?? new Map<string, number>();
    pieces.set(piece, (pieces.get(piece) ?? 0) + weight);
    this.counts.set(key, pieces);
  }

  /** Log probability of a piece given a symbol. Unknown symbols are neutral. */
  score(key: string, piece: string): number {
    const pieces = this.counts.get(key);
    if (!pieces) return 0;
    let total = 0;
    for (const count of pieces.values()) total += count;
    return Math.log(((pieces.get(piece) ?? 0) + 0.3) / (total + 0.3 * PIECE_COUNT));
  }
}

export type DecodedStep =
  | {
      kind: 'move';
      san: string;
      piece: string;
      fen: string;
      token: MoveToken;
      tokenIndex: number;
      lowConfidence: boolean;
    }
  /** A move the text seems to have lost, chosen only to keep the line going. */
  | { kind: 'inserted'; san: string; fen: string }
  /** A token that fits no position on the line. */
  | { kind: 'skip'; token: MoveToken; tokenIndex: number };

export interface DecodedLine {
  steps: DecodedStep[];
  score: number;
  finalFen: string;
}

export interface DecodeOptions {
  /**
   * How likely each token is to belong to this line, from 0 to 1, by index. A likely token
   * costs a lot to skip, and an unlikely one costs a little to use, so that when print
   * weight is unclear the moves around a token can decide. Tokens default to 1.
   */
  membership?: readonly number[];
  model?: GlyphModel;
  cache?: PositionCache;
  /** Added to a position's full move number to get the number printed in the book. */
  offset?: number;
}

/** The offset that makes the first numbered token match a position's move 1. */
export function moveFullNumberOffset(tokens: readonly MoveToken[]): number {
  const first = tokens.find((t) => t.moveNumber !== null);
  return first?.moveNumber ? first.moveNumber - 1 : 0;
}

/**
 * Caches chess.js results, which are slow next to everything else here. Passes over a
 * book revisit the same positions, so sharing one cache saves most of the work.
 */
export class PositionCache {
  private readonly legal = new Map<string, Move[]>();
  private readonly after = new Map<string, string>();

  /** Starts over when full. A whole book can visit millions of positions otherwise. */
  private makeRoom(): void {
    if (this.legal.size >= MAX_CACHED_POSITIONS) this.legal.clear();
    if (this.after.size >= MAX_CACHED_POSITIONS * 4) this.after.clear();
  }

  legalMoves(fen: string): Move[] {
    let moves = this.legal.get(fen);
    if (!moves) {
      try {
        // A diagram with the wrong side to move can allow a king capture.
        moves = new Chess(fen).moves({ verbose: true }).filter((m) => m.captured !== 'k');
      } catch {
        moves = [];
      }
      this.makeRoom();
      this.legal.set(fen, moves);
    }
    return moves;
  }

  fenAfter(fen: string, move: Move): string {
    const key = `${fen}|${move.san}`;
    let next = this.after.get(key);
    if (!next) {
      next = move.after;
      this.after.set(key, next);
    }
    return next;
  }
}

/** Steps are a linked list, so that beam states can share their history. */
interface Trail {
  step: DecodedStep;
  previous: Trail | null;
}

interface BeamState {
  fen: string;
  score: number;
  trail: Trail | null;
}

const colorOf = (fen: string) => fen.split(' ')[1] as Color;
const fullMoveOf = (fen: string) => Number(fen.split(' ')[5]);

interface Candidate {
  move: Move;
  score: number;
}

function candidatesFor(fen: string, token: MoveToken, cache: PositionCache, model: GlyphModel): Candidate[] {
  const candidates: Candidate[] = [];
  for (const move of cache.legalMoves(fen)) {
    if (move.promotion && move.promotion !== 'q') continue;

    if (token.castle) {
      const isLong = move.san.startsWith('O-O-O');
      if (move.san.startsWith('O-O') && isLong === (token.castle === 'q')) {
        candidates.push({ move, score: 0 });
      }
      continue;
    }

    if (move.to !== token.to) continue;
    if (token.capture && !move.captured) continue;

    let score = model.score(token.key, move.piece);
    if (!token.capture && move.captured) score += UNMARKED_CAPTURE_COST;
    if (token.fromFile) score += move.from[0] === token.fromFile ? RIGHT_FILE_BONUS : WRONG_FILE_COST;
    if (token.promotion && !move.promotion) score += MISSING_PROMOTION_COST;
    candidates.push({ move, score });
  }
  return candidates;
}

function numberPenalty(token: MoveToken, fen: string, offset: number): number {
  if (token.moveNumber === null) return 0;
  let penalty = fullMoveOf(fen) + offset === token.moveNumber ? 0 : WRONG_NUMBER_COST;
  // `3.` and `3...` are unreliable in OCR, so a mismatch only costs a little.
  if (token.dots >= 3 && colorOf(fen) === 'w') penalty += WRONG_COLOR_COST;
  if (token.dots === 1 && colorOf(fen) === 'b') penalty += WRONG_COLOR_COST;
  return penalty;
}

/** True when the token's number says a move is missing just before it. */
function isReplyMissing(token: MoveToken, fen: string, offset: number): boolean {
  if (token.moveNumber === null) return false;
  const here = fullMoveOf(fen) + offset;
  const tokenColor: Color = token.dots >= 3 ? 'b' : 'w';
  if (here > token.moveNumber) return false;
  return !(here === token.moveNumber && colorOf(fen) === tokenColor);
}

function keepBest(states: BeamState[]): BeamState[] {
  states.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const best: BeamState[] = [];
  for (const state of states) {
    if (seen.has(state.fen)) continue;
    seen.add(state.fen);
    best.push(state);
    if (best.length >= BEAM_WIDTH) break;
  }
  return best;
}

function toSteps(trail: Trail | null): DecodedStep[] {
  const steps: DecodedStep[] = [];
  for (let t = trail; t; t = t.previous) steps.push(t.step);
  return steps.reverse();
}

/**
 * Finds the most likely sequence of legal moves for a line of damaged tokens.
 *
 * A single token is often ambiguous, and a legal move can still be the wrong one.
 * Searching over the whole line lets later moves settle earlier ones.
 */
export function decodeLine(
  startFen: string,
  tokens: readonly MoveToken[],
  options: DecodeOptions = {},
): DecodedLine {
  const { model = new GlyphModel(), offset = moveFullNumberOffset(tokens), cache = new PositionCache(), membership } = options;
  let beam: BeamState[] = [{ fen: startFen, score: 0, trail: null }];

  tokens.forEach((token, tokenIndex) => {
    const next: BeamState[] = [];
    const belonging = membership?.[tokenIndex] ?? 1;
    const skipCost = SKIP_COST * belonging;
    const useCost = UNLIKELY_USE_COST * (1 - belonging);

    const addMoves = (state: BeamState, fen: string, extra: number, trail: Trail | null) => {
      for (const { move, score } of candidatesFor(fen, token, cache, model)) {
        const after = cache.fenAfter(fen, move);
        const step: DecodedStep = {
          kind: 'move',
          san: move.san,
          piece: move.piece,
          fen: after,
          token,
          tokenIndex,
          lowConfidence: score < LOW_CONFIDENCE_SCORE,
        };
        next.push({
          fen: after,
          score: state.score + score + extra + useCost + numberPenalty(token, fen, offset),
          trail: { step, previous: trail },
        });
      }
    };

    beam.forEach((state, rank) => {
      next.push({
        fen: state.fen,
        score: state.score + skipCost,
        trail: { step: { kind: 'skip', token, tokenIndex }, previous: state.trail },
      });

      addMoves(state, state.fen, 0, state.trail);

      if (rank < INSERTING_STATES && isReplyMissing(token, state.fen, offset)) {
        for (const reply of cache.legalMoves(state.fen)) {
          if (reply.promotion && reply.promotion !== 'q') continue;
          const after = cache.fenAfter(state.fen, reply);
          const inserted: Trail = {
            step: { kind: 'inserted', san: reply.san, fen: after },
            previous: state.trail,
          };
          addMoves(state, after, INSERT_COST, inserted);
        }
      }
    });
    beam = keepBest(next);
  });

  const best = beam[0]!;
  return { steps: toSteps(best.trail), score: best.score, finalFen: best.fen };
}
