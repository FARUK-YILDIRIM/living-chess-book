import { nextMoves } from './overlay';
import type { EngineScore } from './uci';
import type { BookOverlay, Box, Diagram, MoveNode } from './types';

/** Where the board stands in the book. */
export interface BookPlace {
  moveId: string | null;
  diagramId: string | null;
}

/** The moves the book gives from here, main line first. */
export function bookMovesFrom(overlay: BookOverlay, { moveId, diagramId }: BookPlace): MoveNode[] {
  if (moveId) return nextMoves(overlay, moveId);
  if (!diagramId) return [];
  return overlay.moves
    .filter((m) => m.parentId === null && m.diagramId === diagramId)
    .sort((a, b) => Number(b.isMainLine) - Number(a.isMainLine));
}

/** The moves still ahead in the book, which must stay out of sight while the reader guesses. */
export function movesAhead(overlay: BookOverlay, place: BookPlace): Set<string> {
  const ahead = new Set<string>();
  const waiting = bookMovesFrom(overlay, place);
  while (waiting.length) {
    const move = waiting.pop()!;
    if (ahead.has(move.id)) continue;
    ahead.add(move.id);
    waiting.push(...nextMoves(overlay, move.id));
  }
  return ahead;
}

export type Verdict =
  /** The book's own move. */
  | { kind: 'right'; move: MoveNode }
  /** The book looks at this move too, in a side line, but prefers another. */
  | { kind: 'side-line'; move: MoveNode }
  | { kind: 'wrong' };

const plain = (san: string) => san.replace(/[+#!?]+$/, '');

export function judgeGuess(expected: readonly MoveNode[], san: string): Verdict {
  const match = expected.find((m) => plain(m.san) === plain(san));
  if (!match) return { kind: 'wrong' };
  return match === expected[0] ? { kind: 'right', move: match } : { kind: 'side-line', move: match };
}

export interface GuessScore {
  /** Moves the reader has been asked for. */
  asked: number;
  /** Moves they found with no wrong try and no help. */
  firstTry: number;
}

export const NO_SCORE: GuessScore = { asked: 0, firstTry: 0 };

export function addToScore(score: GuessScore, wasFirstTry: boolean): GuessScore {
  return { asked: score.asked + 1, firstTry: score.firstTry + (wasFirstTry ? 1 : 0) };
}

/** How a move compares with the book's, by the engine. */
export type MoveGrade = 'as-good' | 'playable' | 'worse' | 'losing';

export interface MoveJudgement {
  grade: MoveGrade;
  /** How much worse than the book's move, in pawns. Never below zero. */
  lossInPawns: number;
}

const MATE_AS_CENTIPAWNS = 10_000;
const AS_GOOD_CENTIPAWNS = 30;
const PLAYABLE_CENTIPAWNS = 100;
const WORSE_CENTIPAWNS = 300;

const asCentipawns = (score: EngineScore) =>
  score.kind === 'cp' ? score.value : Math.sign(score.value || 1) * (MATE_AS_CENTIPAWNS - Math.abs(score.value));

/** A good move is not a wrong one just because the book chose another. */
export function gradeMove(reader: EngineScore, book: EngineScore, moverIsWhite: boolean): MoveJudgement {
  const difference = asCentipawns(book) - asCentipawns(reader);
  const loss = Math.max(0, moverIsWhite ? difference : -difference);
  const grade: MoveGrade = loss <= AS_GOOD_CENTIPAWNS ? 'as-good' : loss <= PLAYABLE_CENTIPAWNS ? 'playable' : loss <= WORSE_CENTIPAWNS ? 'worse' : 'losing';
  return { grade, lossInPawns: Math.round(loss) / 100 };
}

/**
 * What to cover on a page while the reader works out what follows a place on it: the rest of its
 * row, and all below. Words above it have already been read.
 */
export function coverBoxes(pageWidth: number, pageHeight: number, place: Box): Box[] {
  return [
    { x0: place.x1, y0: place.y0, x1: pageWidth, y1: place.y1 },
    { x0: 0, y0: place.y1, x1: pageWidth, y1: pageHeight },
  ].filter((box) => box.x1 > box.x0 && box.y1 > box.y0);
}

/** Survives a new analysis, unlike the id of a diagram. */
export const diagramKey = (diagram: Pick<Diagram, 'page' | 'placement'>) => `${diagram.page}|${diagram.placement}`;

/** The diagrams that can be solved, because the book plays moves from them, in reading order. */
export function solvableDiagrams(overlay: BookOverlay): Diagram[] {
  const withMoves = new Set(overlay.moves.filter((m) => m.parentId === null && m.diagramId).map((m) => m.diagramId));
  return overlay.diagrams.filter((d) => withMoves.has(d.id)).sort((a, b) => a.page - b.page || a.box.y0 - b.box.y0);
}

/** The next one not yet solved, from a page on, and then from the start of the book. */
export function nextUnsolved(overlay: BookOverlay, solved: ReadonlySet<string>, fromPage: number, after?: Diagram | null): Diagram | null {
  const open = solvableDiagrams(overlay).filter((d) => !solved.has(diagramKey(d)));
  const others = open.filter((d) => d.id !== after?.id);
  // The board can be far from the page being read, and the page is what the reader is looking at.
  const isOnSamePage = after?.page === fromPage;
  const isLater = (d: Diagram) => (isOnSamePage ? d.page > fromPage || (d.page === fromPage && d.box.y0 > after!.box.y0) : d.page >= fromPage);
  return others.find(isLater) ?? others[0] ?? open[0] ?? null;
}

export interface Chapter {
  title: string;
  /** Counted from 0. */
  page: number;
}

export interface ChapterProgress extends Chapter {
  solved: number;
  total: number;
}

/** A chapter runs up to the start of the next. Diagrams before the first are left out of them. */
export function chapterProgress(chapters: readonly Chapter[], overlay: BookOverlay, solved: ReadonlySet<string>): ChapterProgress[] {
  const diagrams = solvableDiagrams(overlay);
  const inOrder = chapters.slice().sort((a, b) => a.page - b.page);
  return inOrder.map((chapter, index) => {
    const end = inOrder[index + 1]?.page ?? Number.POSITIVE_INFINITY;
    const own = diagrams.filter((d) => d.page >= chapter.page && d.page < end);
    return { ...chapter, total: own.length, solved: own.filter((d) => solved.has(diagramKey(d))).length };
  });
}
