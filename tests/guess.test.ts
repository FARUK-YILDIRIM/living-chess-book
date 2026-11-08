import { describe, expect, it } from 'vitest';
import {
  addToScore,
  bookMovesFrom,
  chapterProgress,
  coverBoxes,
  diagramKey,
  gradeMove,
  judgeGuess,
  movesAhead,
  nextUnsolved,
  NO_SCORE,
  solvableDiagrams,
} from '../src/core/guess';
import type { BookOverlay, Diagram, MoveNode } from '../src/core/types';

const move = (id: string, parentId: string | null, san: string, extra: Partial<MoveNode> = {}): MoveNode => ({
  id,
  parentId,
  diagramId: null,
  san,
  fen: '',
  page: 0,
  box: { x0: 0, y0: 0, x1: 1, y1: 1 },
  isMainLine: true,
  confidence: 'high',
  ...extra,
});

const book: BookOverlay = {
  schemaVersion: 1,
  bookHash: 'h',
  pageCount: 1,
  diagrams: [],
  review: [],
  moves: [
    move('d-side', null, 'c4', { diagramId: 'd', isMainLine: false }),
    move('d-main', null, 'e4', { diagramId: 'd' }),
    move('a', 'd-main', 'e5'),
    move('a-side', 'd-main', 'c5', { isMainLine: false }),
    move('b', 'a', 'Nf3+'),
    move('c', 'a-side', 'Nc3'),
  ],
};

describe('bookMovesFrom', () => {
  it('starts a diagram with its main line', () => {
    expect(bookMovesFrom(book, { moveId: null, diagramId: 'd' }).map((m) => m.id)).toEqual(['d-main', 'd-side']);
  });

  it('continues from a move, main line first', () => {
    expect(bookMovesFrom(book, { moveId: 'd-main', diagramId: 'd' })[0]!.id).toBe('a');
  });

  it('has nothing at the end of a line, or with no place in the book', () => {
    expect(bookMovesFrom(book, { moveId: 'b', diagramId: null })).toEqual([]);
    expect(bookMovesFrom(book, { moveId: null, diagramId: null })).toEqual([]);
  });
});

describe('movesAhead', () => {
  it('holds every move still to come, in side lines too', () => {
    expect([...movesAhead(book, { moveId: 'd-main', diagramId: 'd' })].sort()).toEqual(['a', 'a-side', 'b', 'c']);
  });

  it('holds nothing already played', () => {
    expect(movesAhead(book, { moveId: 'a', diagramId: 'd' }).has('d-main')).toBe(false);
  });

  it('is empty at the end of a line', () => {
    expect(movesAhead(book, { moveId: 'b', diagramId: null }).size).toBe(0);
  });
});

describe('judgeGuess', () => {
  const expected = bookMovesFrom(book, { moveId: 'd-main', diagramId: 'd' });

  it('takes the book\'s move', () => {
    expect(judgeGuess(expected, 'e5')).toMatchObject({ kind: 'right', move: { id: 'a' } });
  });

  it('says when the book only looks at it in a side line', () => {
    expect(judgeGuess(expected, 'c5')).toMatchObject({ kind: 'side-line', move: { id: 'a-side' } });
  });

  it('turns down anything else', () => {
    expect(judgeGuess(expected, 'a6')).toEqual({ kind: 'wrong' });
    expect(judgeGuess([], 'a6')).toEqual({ kind: 'wrong' });
  });

  it('does not mind a check sign', () => {
    expect(judgeGuess(bookMovesFrom(book, { moveId: 'a', diagramId: null }), 'Nf3')).toMatchObject({ kind: 'right' });
  });
});

describe('score', () => {
  it('counts what was found at the first try', () => {
    const score = addToScore(addToScore(NO_SCORE, true), false);
    expect(score).toEqual({ asked: 2, firstTry: 1 });
  });
});

describe('gradeMove', () => {
  const cp = (value: number) => ({ kind: 'cp' as const, value });

  it('does not call a move as good as the book\'s wrong', () => {
    expect(gradeMove(cp(20), cp(35), true)).toEqual({ grade: 'as-good', lossInPawns: 0.15 });
  });

  it('gives credit for a move better than the book\'s', () => {
    expect(gradeMove(cp(90), cp(20), true)).toEqual({ grade: 'as-good', lossInPawns: 0 });
  });

  it('grades by how much is lost', () => {
    expect(gradeMove(cp(-40), cp(30), true).grade).toBe('playable');
    expect(gradeMove(cp(-170), cp(30), true).grade).toBe('worse');
    expect(gradeMove(cp(-600), cp(30), true)).toEqual({ grade: 'losing', lossInPawns: 6.3 });
  });

  it('reads scores the other way for Black', () => {
    expect(gradeMove(cp(300), cp(-30), false).grade).toBe('losing');
    expect(gradeMove(cp(-60), cp(-30), false).grade).toBe('as-good');
  });

  it('counts missing a mate as losing', () => {
    expect(gradeMove(cp(50), { kind: 'mate', value: 2 }, true).grade).toBe('losing');
  });

  it('counts two mates as about the same', () => {
    expect(gradeMove({ kind: 'mate', value: 3 }, { kind: 'mate', value: 2 }, true).grade).toBe('as-good');
  });
});

describe('coverBoxes', () => {
  it('covers the rest of the row and all below', () => {
    expect(coverBoxes(600, 800, { x0: 100, y0: 200, x1: 150, y1: 220 })).toEqual([
      { x0: 150, y0: 200, x1: 600, y1: 220 },
      { x0: 0, y0: 220, x1: 600, y1: 800 },
    ]);
  });

  it('leaves out what has no size', () => {
    expect(coverBoxes(600, 800, { x0: 100, y0: 780, x1: 600, y1: 800 })).toEqual([]);
  });
});

describe('solving diagrams', () => {
  const diagram = (id: string, page: number, y0 = 0): Diagram => ({
    id,
    page,
    box: { x0: 0, y0, x1: 1, y1: y0 + 1 },
    placement: `placement-${id}`,
    sideToMove: 'w',
    label: null,
    issues: [],
    confidence: 1,
  });
  const study: BookOverlay = {
    ...book,
    diagrams: [diagram('late', 9), diagram('none', 2), diagram('a', 2, 50), diagram('b', 5)],
    moves: ['late', 'a', 'b'].map((id) => move(`m-${id}`, null, 'e4', { diagramId: id })),
  };
  const solved = (...ids: string[]) => new Set(ids.map((id) => diagramKey(study.diagrams.find((d) => d.id === id)!)));

  it('takes only diagrams the book plays moves from, in reading order', () => {
    expect(solvableDiagrams(study).map((d) => d.id)).toEqual(['a', 'b', 'late']);
  });

  it('finds the next one from a page', () => {
    expect(nextUnsolved(study, new Set(), 3)?.id).toBe('b');
  });

  it('skips what is solved', () => {
    expect(nextUnsolved(study, solved('b'), 3)?.id).toBe('late');
  });

  it('goes on from the one just done', () => {
    expect(nextUnsolved(study, new Set(), 2, study.diagrams.find((d) => d.id === 'a'))?.id).toBe('b');
  });

  it('follows the page being read, when the board is elsewhere', () => {
    expect(nextUnsolved(study, new Set(), 7, study.diagrams.find((d) => d.id === 'a'))?.id).toBe('late');
  });

  it('offers the current one again when it is the last unsolved', () => {
    expect(nextUnsolved(study, solved('a', 'b'), 9, study.diagrams.find((d) => d.id === 'late'))?.id).toBe('late');
  });

  it('goes back to the start after the last', () => {
    expect(nextUnsolved(study, solved('late'), 8)?.id).toBe('a');
  });

  it('has nothing left when all are solved', () => {
    expect(nextUnsolved(study, solved('a', 'b', 'late'), 0)).toBeNull();
  });

  it('counts each chapter up to the next', () => {
    const chapters = [{ title: 'Two', page: 5 }, { title: 'One', page: 0 }];
    expect(chapterProgress(chapters, study, solved('a'))).toEqual([
      { title: 'One', page: 0, solved: 1, total: 1 },
      { title: 'Two', page: 5, solved: 0, total: 2 },
    ]);
  });
});
