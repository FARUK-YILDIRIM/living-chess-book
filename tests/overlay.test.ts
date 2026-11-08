import { describe, expect, it } from 'vitest';
import {
  correctDiagram,
  correctMove,
  diagramFen,
  dismissReview,
  findBookLine,
  legalAlternatives,
  nextMoves,
  overlayFromJson,
  overlayToJson,
  previousMove,
  startFenOf,
} from '../src/core/overlay';
import { firstReviewFrom, placeIn, reviewInOrder } from '../src/core/overlay';
import type { BookOverlay, Diagram, MoveNode, ReviewItem } from '../src/core/types';

const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
const INITIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function move(id: string, parentId: string | null, san: string, fen: string, extra: Partial<MoveNode> = {}): MoveNode {
  return { id, parentId, diagramId: null, san, fen, page: 0, box, isMainLine: true, confidence: 'high', ...extra };
}

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

function overlay(): BookOverlay {
  return {
    schemaVersion: 1,
    bookHash: 'hash',
    pageCount: 1,
    diagrams: [],
    moves: [
      move('a', null, 'e4', AFTER_E4),
      move('b', 'a', 'e5', AFTER_E5, { confidence: 'low' }),
      move('c', 'b', 'Nf3', AFTER_NF3),
      move('side', 'a', 'c5', AFTER_C5, { isMainLine: false }),
    ],
    review: [{ id: 'r1', reason: 'low-confidence-move', page: 0, box, targetId: 'b' }],
  };
}

describe('navigation', () => {
  it('finds the moves after a move, with the main line first', () => {
    const o = overlay();
    expect(nextMoves(o, 'a').map((m) => m.san)).toEqual(['e5', 'c5']);
    expect(nextMoves(o, 'c')).toEqual([]);
  });

  it('finds the move before a move', () => {
    const o = overlay();
    expect(previousMove(o, 'b')?.id).toBe('a');
    expect(previousMove(o, 'a')).toBeNull();
  });

  it('lists a whole line through a move', () => {
    const o = overlay();
    expect(findBookLine(o, 'b').map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(findBookLine(o, 'side').map((m) => m.san)).toEqual(['e4', 'c5']);
  });

  it('knows the starting position of a line', () => {
    const o = overlay();
    expect(startFenOf(o, o.moves[0]!)).toBe(INITIAL);
  });
});

describe('correctMove', () => {
  it('offers the legal moves of the position before a move', () => {
    const options = legalAlternatives(overlay(), 'b');
    expect(options).toContain('c5');
    expect(options).toContain('e5');
    expect(options).not.toContain('e4');
  });

  it('replaces a move, replays what follows, and clears its review item', () => {
    const fixed = correctMove(overlay(), 'b', 'e6');
    const b = fixed.moves.find((m) => m.id === 'b')!;
    expect(b.san).toBe('e6');
    expect(b.confidence).toBe('high');
    expect(fixed.moves.find((m) => m.id === 'c')!.fen).toContain('5N2');
    expect(fixed.review.some((r) => r.targetId === 'b')).toBe(false);
  });

  it('drops moves that the correction makes impossible, and asks for a review', () => {
    const o = overlay();
    // Nf3 stops being possible once the knight has already gone to f3 in this line.
    o.moves = [
      move('a', null, 'Nf3', 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'),
      move('b', 'a', 'e5', 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2'),
      move('c', 'b', 'Nxe5', 'rnbqkbnr/pppp1ppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R b KQkq - 0 2'),
    ];
    const fixed = correctMove(o, 'a', 'e4');
    expect(fixed.moves.map((m) => m.id)).toEqual(['a', 'b']);
    expect(fixed.review.some((r) => r.reason === 'unresolved-move')).toBe(true);
  });

  it('rejects an illegal correction', () => {
    expect(() => correctMove(overlay(), 'b', 'Qh7')).toThrow();
  });

  it('does not change the original', () => {
    const o = overlay();
    correctMove(o, 'b', 'e6');
    expect(o.moves.find((m) => m.id === 'b')!.san).toBe('e5');
  });
});

describe('correctDiagram', () => {
  const diagram: Diagram = {
    id: 'd',
    page: 0,
    box,
    placement: '8/8/8/8/8/8/8/8',
    sideToMove: 'w',
    label: null,
    issues: ['white king count is 0'],
    confidence: 0.5,
  };

  it('stores the corrected position, and clears the review item when it is valid', () => {
    const o = overlay();
    o.diagrams = [diagram];
    o.review = [{ id: 'rd', reason: 'invalid-diagram', page: 0, box, targetId: 'd' }];
    const fixed = correctDiagram(o, 'd', '4k3/8/8/8/8/8/8/4K3', 'b');
    expect(fixed.diagrams[0]).toMatchObject({ placement: '4k3/8/8/8/8/8/8/4K3', sideToMove: 'b', issues: [] });
    expect(fixed.review).toEqual([]);
  });

  it('keeps asking when the correction is still invalid', () => {
    const o = overlay();
    o.diagrams = [diagram];
    o.review = [{ id: 'rd', reason: 'invalid-diagram', page: 0, box, targetId: 'd' }];
    const fixed = correctDiagram(o, 'd', '8/8/8/8/8/8/8/4K3', 'w');
    expect(fixed.diagrams[0]!.issues.length).toBeGreaterThan(0);
    expect(fixed.review).toHaveLength(1);
  });

  it('replays the moves that start from the diagram', () => {
    const o = overlay();
    o.diagrams = [{ ...diagram, placement: '4k3/8/8/8/8/8/4P3/4K3', issues: [] }];
    o.moves = [move('a', null, 'e4', '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1', { diagramId: 'd' })];
    const fixed = correctDiagram(o, 'd', '3k4/8/8/8/8/8/4P3/4K3', 'w');
    expect(fixed.moves[0]!.fen.startsWith('3k4/8/8/8/4P3/8/8/4K3')).toBe(true);
  });
});

describe('review after a correction', () => {
  it('forgets notes about moves that were dropped', () => {
    const o = overlay();
    o.moves = [
      move('a', null, 'Nf3', 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'),
      move('b', 'a', 'e5', 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2'),
      move('c', 'b', 'Nxe5', 'rnbqkbnr/pppp1ppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R b KQkq - 0 2'),
    ];
    o.review = [{ id: 'old', reason: 'low-confidence-move', page: 0, box, targetId: 'c' }];
    const fixed = correctMove(o, 'a', 'e4');
    expect(fixed.review.some((r) => r.id === 'old')).toBe(false);
    expect(fixed.review.filter((r) => r.reason === 'unresolved-move')).toHaveLength(1);
  });

  it('does not drop the lines of a diagram corrected to an impossible position', () => {
    const o = overlay();
    o.diagrams = [{ id: 'd', page: 0, box, placement: '4k3/8/8/8/8/8/4P3/4K3', sideToMove: 'w', label: null, issues: [], confidence: 1 }];
    o.moves = [move('a', null, 'e4', '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1', { diagramId: 'd' })];
    const fixed = correctDiagram(o, 'd', '4k4/8/8/8/8/8/4P3/4K3', 'w');
    expect(fixed.moves).toHaveLength(1);
    expect(fixed.diagrams[0]!.issues).toContain('rank 8 does not have 8 squares');
  });
});

describe('diagramFen', () => {
  const unlabelled: Diagram = { id: 'd', page: 0, box, placement: '4k3/8/8/8/8/8/4P3/4K3', sideToMove: null, label: null, issues: [], confidence: 1 };

  it('takes the side to move from the first move when none is printed', () => {
    const o = overlay();
    o.diagrams = [unlabelled];
    o.moves = [move('a', null, 'Kd7', '8/3k4/8/8/8/8/4P3/4K3 w - - 1 2', { diagramId: 'd' })];
    expect(diagramFen(o, 'd')?.split(' ')[1]).toBe('b');
  });

  it('prefers the printed side, and returns null for an unknown diagram', () => {
    const o = overlay();
    o.diagrams = [{ ...unlabelled, sideToMove: 'w' }];
    expect(diagramFen(o, 'd')?.split(' ')[1]).toBe('w');
    expect(diagramFen(o, 'nope')).toBeNull();
  });
});

describe('review and storage', () => {
  it('dismisses a review item', () => {
    expect(dismissReview(overlay(), 'r1').review).toEqual([]);
  });

  it('round-trips through JSON', () => {
    const o = overlay();
    expect(overlayFromJson(overlayToJson(o))).toEqual(o);
  });

  it('rejects JSON that is not an overlay', () => {
    expect(() => overlayFromJson('{"hello":1}')).toThrow();
    expect(() => overlayFromJson('not json')).toThrow();
  });

  it('rejects an overlay that contains extra text fields', () => {
    const tampered = JSON.stringify({ ...overlay(), bookText: 'a chapter of a book' });
    expect(() => overlayFromJson(tampered)).toThrow(/unexpected/i);
  });

  it('rejects book text hidden in a nested field', () => {
    const o = overlay();
    const tampered = { ...o, moves: [{ ...o.moves[0], text: 'a chapter of a book' }] };
    expect(() => overlayFromJson(JSON.stringify(tampered))).toThrow(/unexpected/i);
  });

  it('rejects book text hidden in a field that should hold a move', () => {
    const o = overlay();
    const tampered = { ...o, moves: [{ ...o.moves[0], san: 'a chapter of a book that goes on' }] };
    expect(() => overlayFromJson(JSON.stringify(tampered))).toThrow(/unexpected/i);
  });

  it('accepts an overlay with diagrams, labels and promotions', () => {
    const o = overlay();
    o.diagrams = [{ id: 'd0-1', page: 0, box, placement: '4k3/8/8/8/8/8/4P3/4K3', sideToMove: null, label: 'problem 17', issues: ['white king count is 0'], confidence: 0.4 }];
    o.moves.push(move('p', 'c', 'fxg8=Q+', '4k1Q1/8/8/8/8/8/8/4K3 b - - 0 9', { numberOffset: 22 }));
    expect(overlayFromJson(overlayToJson(o))).toEqual(o);
  });
});

describe('checking in order', () => {
  const item = (id: string, page: number, y0 = 0): ReviewItem => ({ id, reason: 'unresolved-move', page, box: { x0: 0, y0, x1: 1, y1: y0 + 1 }, targetId: null });
  const overlay: BookOverlay = { schemaVersion: 1, bookHash: 'h', pageCount: 9, diagrams: [], moves: [], review: [item('c', 7), item('b', 2, 50), item('a', 2, 10)] };

  it('goes by page, then down the page', () => {
    expect(reviewInOrder(overlay).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('starts at the page being read', () => {
    expect(firstReviewFrom(reviewInOrder(overlay), 3)?.id).toBe('c');
  });

  it('goes back to the start after the last', () => {
    expect(firstReviewFrom(reviewInOrder(overlay), 8)?.id).toBe('a');
  });

  it('has nothing when all is checked', () => {
    expect(firstReviewFrom([], 0)).toBeNull();
  });
});

describe('placeIn', () => {
  const overlay: BookOverlay = {
    schemaVersion: 1,
    bookHash: 'h',
    pageCount: 1,
    review: [],
    diagrams: [{ id: 'd', page: 0, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, placement: '8/8/8/8/8/8/8/8', sideToMove: 'w', label: null, issues: [], confidence: 1 }],
    moves: [{ id: 'm', parentId: null, diagramId: 'd', san: 'e4', fen: '', page: 0, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, isMainLine: true, confidence: 'high' }],
  };

  it('finds a move again, with its diagram', () => {
    expect(placeIn(overlay, { moveId: 'm', diagramId: null })).toEqual({ moveId: 'm', diagramId: 'd' });
  });

  it('finds a diagram before its moves', () => {
    expect(placeIn(overlay, { moveId: null, diagramId: 'd' })).toEqual({ moveId: null, diagramId: 'd' });
  });

  it('gives up on a place a new analysis has removed', () => {
    expect(placeIn(overlay, { moveId: 'gone', diagramId: 'd' })).toBeNull();
    expect(placeIn(overlay, { moveId: null, diagramId: 'gone' })).toBeNull();
    expect(placeIn(overlay, { moveId: null, diagramId: null })).toBeNull();
  });
});
