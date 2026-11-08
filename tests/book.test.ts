import { describe, expect, it } from 'vitest';
import { analyzeWords, boldThreshold, fenFromDiagram, labelFromWords, sideToMoveFromWords } from '../src/core/book';
import type { Box, Diagram, Word } from '../src/core/types';

let x = 50;
function words(page: number, y: number, text: string, ink = 0.2): Word[] {
  x = 50;
  return text.split(' ').map((t) => {
    const box: Box = { x0: x, y0: y, x1: x + t.length * 5, y1: y + 10 };
    x += t.length * 5 + 4;
    return { text: t, page, box, ink };
  });
}

function diagram(id: string, page: number, y: number, placement: string, extra: Partial<Diagram> = {}): Diagram {
  return {
    id,
    page,
    box: { x0: 100, y0: y, x1: 220, y1: y + 120 },
    placement,
    sideToMove: 'w',
    label: null,
    issues: [],
    confidence: 0.9,
    ...extra,
  };
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const sans = (moves: { san: string }[]) => moves.map((m) => m.san);

describe('fenFromDiagram', () => {
  it('infers castling rights from where the kings and rooks stand', () => {
    expect(fenFromDiagram('r3k2r/8/8/8/8/8/8/R3K2R', 'w')).toBe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(fenFromDiagram('4k3/8/8/8/8/8/8/5K2', 'b')).toBe('4k3/8/8/8/8/8/8/5K2 b - - 0 1');
  });
});

describe('boldThreshold', () => {
  it('separates bold from regular text', () => {
    const threshold = boldThreshold([0.15, 0.16, 0.17, 0.3, 0.31, 0.32]);
    expect(threshold).toBeGreaterThan(0.17);
    expect(threshold).toBeLessThan(0.3);
  });

  it('returns null when the book has only one weight', () => {
    expect(boldThreshold([0.2, 0.21, 0.2, 0.22])).toBeNull();
  });
});

describe('labelFromWords', () => {
  it('reads a label despite OCR damage', () => {
    expect(labelFromWords(words(0, 0, 'Problem #17'))).toBe('problem 17');
    expect(labelFromWords(words(0, 0, 'ProbJem #18'))).toBe('problem 18');
    expect(labelFromWords(words(0, 0, 'Exercise 4'))).toBe('exercise 4');
  });

  it('ignores other text', () => {
    expect(labelFromWords(words(0, 0, 'The problem with this'))).toBeNull();
  });
});

describe('sideToMoveFromWords', () => {
  it('reads the caption', () => {
    expect(sideToMoveFromWords(words(0, 0, 'Black to move.'))).toBe('b');
    expect(sideToMoveFromWords(words(0, 0, 'White to play'))).toBe('w');
    expect(sideToMoveFromWords(words(0, 0, 'A quiet position'))).toBeNull();
  });
});

describe('a new game after one that began mid-way', () => {
  it('keeps them apart', () => {
    const text = '25.Ke1 Ke8 26.Kd1 Kd8 27.Ke1 Ke8 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6';
    const placed = text.split(' ').map((word, i): Word => ({ text: word, page: 0, ink: 0.3, box: { x0: 20 + (i % 8) * 60, y0: 300 + Math.floor(i / 8) * 20, x1: 70 + (i % 8) * 60, y1: 312 + Math.floor(i / 8) * 20 } }));
    const diagram = { id: 'd0', page: 0, box: { x0: 50, y0: 10, x1: 250, y1: 210 }, placement: '3k4/8/8/8/8/8/8/3K4', sideToMove: 'w' as const, label: null, issues: [], confidence: 1 };
    const { moves } = analyzeWords({ pages: [placed], diagrams: [diagram] });
    const roots = moves.filter((m) => m.parentId === null && m.isMainLine);
    expect(roots.map((m) => m.san)).toEqual(['Ke1', 'e4']);
    expect(moves.find((m) => m.san === 'Ke1')!.diagramId).toBe('d0');
    expect(moves.find((m) => m.san === 'Bb5')!.diagramId).toBeNull();
  });
});

describe('a diagram that cannot be real', () => {
  const impossible = { id: 'bad', page: 0, box: { x0: 50, y0: 10, x1: 250, y1: 210 }, placement: '8/8/8/8/8/8/8/8', sideToMove: 'w' as const, label: null, issues: ['white king count is 0'], confidence: 1 };
  const place = (text: string) => text.split(' ').map((word, i): Word => ({ text: word, page: 0, ink: 0.3, box: { x0: 20 + i * 40, y0: 300, x1: 55 + i * 40, y1: 312 } }));

  it('does not stop a whole game from being read', () => {
    const { moves } = analyzeWords({ pages: [place('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6')], diagrams: [impossible] });
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']);
    expect(moves[0]!.diagramId).toBeNull();
  });

  it('flags such a line, since no diagram confirms where it starts', () => {
    const { moves, review } = analyzeWords({ pages: [place('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6')], diagrams: [impossible] });
    expect(moves.every((m) => m.confidence === 'low')).toBe(true);
    expect(review.some((r) => r.reason === 'low-confidence-move')).toBe(true);
  });

  it.each(['1.Nf3 Nf6', '1.a4 a5 2.b4 axb4', '1.g4 g5 2.h4 gxh4 3.g5 h3'])('does not accept a short line like %s', (text) => {
    expect(analyzeWords({ pages: [place(text)], diagrams: [impossible] }).moves).toEqual([]);
  });

  it('does not guess at moves from mid-game', () => {
    const { moves } = analyzeWords({ pages: [place('25.Ke2 Kd7 26.Ke3 Kd6')], diagrams: [impossible] });
    expect(moves).toEqual([]);
  });

  it('does not accept a few moves that fit by chance', () => {
    const { moves } = analyzeWords({ pages: [place('1.Kd5 Kd4 2.Kc5 Kc4')], diagrams: [impossible] });
    expect(moves).toEqual([]);
  });
});

describe('a game with no diagram of its own', () => {
  it('starts from the initial position when numbered from move 1', () => {
    const line = ['1.e4', 'e5', '2.Nf3', 'Nc6', '3.Bb5', 'a6', '4.Ba4', 'Nf6'];
    const pages = [line.map((text, i): Word => ({ text, page: 0, ink: 0.3, box: { x0: 20 + i * 40, y0: 500, x1: 55 + i * 40, y1: 512 } }))];
    const diagram = {
      id: 'd0',
      page: 0,
      box: { x0: 50, y0: 10, x1: 250, y1: 210 },
      placement: '7k/8/8/8/8/8/8/2B1KB2',
      sideToMove: 'w' as const,
      label: null,
      issues: [],
      confidence: 1,
    };
    const { moves } = analyzeWords({ pages, diagrams: [diagram] });
    expect(moves.filter((m) => m.isMainLine).map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']);
    expect(moves[0]!.diagramId).toBeNull();
  });
});

describe('analyzeWords', () => {
  it('reads a game from the initial position when no diagram came first', () => {
    const { moves } = analyzeWords({ pages: [words(0, 100, '1.e4 e5 2.Nf3 Nc6 is a fine start')], diagrams: [] });
    expect(sans(moves)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(moves[0]).toMatchObject({ parentId: null, diagramId: null, page: 0 });
    expect(moves[1]!.parentId).toBe(moves[0]!.id);
  });

  it('starts a line from the diagram just above it', () => {
    const d = diagram('d1', 0, 50, '4k3/8/8/8/8/8/4P3/4K1N1');
    const { moves } = analyzeWords({ pages: [words(0, 200, '1.Nf3 Kd7 2.e4 Kc6')], diagrams: [d] });
    expect(sans(moves)).toEqual(['Nf3', 'Kd7', 'e4', 'Kc6']);
    expect(moves[0]!.diagramId).toBe('d1');
  });

  it('does not use a diagram that comes after the text', () => {
    const d = diagram('d1', 0, 300, '4k3/8/8/8/8/8/4P3/4K1N1');
    const { moves } = analyzeWords({ pages: [words(0, 100, '1.e4 e5')], diagrams: [d] });
    expect(moves[0]!.diagramId).toBeNull();
  });

  it('links a solution in a later chapter to its labelled diagram', () => {
    const problem = diagram('p7', 0, 50, '4k3/8/8/8/8/8/4P3/4K1N1', { label: 'problem 7' });
    const other = diagram('p8', 1, 50, '8/8/4k3/8/8/4K3/8/8', { label: 'problem 8' });
    const { moves } = analyzeWords({
      pages: [[], [], [...words(2, 100, 'Problem #7'), ...words(2, 120, '1.Nf3 Kd7')]],
      diagrams: [problem, other],
    });
    expect(sans(moves)).toEqual(['Nf3', 'Kd7']);
    expect(moves[0]!.diagramId).toBe('p7');
  });

  it('builds side lines as branches of the main line', () => {
    const page = [
      ...words(0, 100, '1.e4', 0.3),
      ...words(0, 120, 'e5', 0.3),
      ...words(0, 140, 'If', 0.15),
      ...words(0, 160, '1...c5 2.Nf3', 0.15),
      ...words(0, 180, 'then', 0.15),
      ...words(0, 200, '2.Nf3', 0.3),
      ...words(0, 220, 'Nc6', 0.3),
    ];
    const { moves } = analyzeWords({ pages: [page], diagrams: [] });
    const main = moves.filter((m) => m.isMainLine);
    const side = moves.filter((m) => !m.isMainLine);
    expect(sans(main)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(sans(side)).toEqual(['c5', 'Nf3']);
    expect(side[0]!.parentId).toBe(main[0]!.id);
  });

  it('sends a move it cannot place to the review queue', () => {
    const { review } = analyzeWords({ pages: [words(0, 100, '1.e4 e5 2.Qh7')], diagrams: [] });
    expect(review.some((r) => r.reason === 'unresolved-move')).toBe(true);
  });

  it('sends invalid and uncertain diagrams to the review queue', () => {
    const bad = diagram('bad', 0, 50, '8/8/8/8/8/8/8/8', { issues: ['white king count is 0'] });
    const unsure = diagram('unsure', 0, 300, '4k3/8/8/8/8/8/8/4K3', { confidence: 0.01 });
    const { review } = analyzeWords({ pages: [[]], diagrams: [bad, unsure] });
    expect(review.map((r) => r.reason).sort()).toEqual(['invalid-diagram', 'low-confidence-diagram']);
  });

  it('learns a damaged symbol from the rest of the book', () => {
    const lines: Word[] = [];
    for (let i = 0; i < 12; i++) lines.push(...words(0, 100 + i * 20, '1.e4 e5 2.§f3 Nc6 3.§xe5 Nxe5'));
    const { moves } = analyzeWords({ pages: [lines], diagrams: [] });
    expect(sans(moves.slice(0, 3))).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('never returns any text from the book', () => {
    const { moves, review } = analyzeWords({ pages: [words(0, 100, 'SECRETWORD 1.e4 e5 SECRETWORD')], diagrams: [] });
    expect(JSON.stringify({ moves, review })).not.toContain('SECRETWORD');
  });

  it('keeps the page coordinates of each move', () => {
    const { moves } = analyzeWords({ pages: [[], words(1, 100, '1.e4 e5')], diagrams: [] });
    expect(moves[0]!.page).toBe(1);
    expect(moves[0]!.box.y0).toBe(100);
  });

  it('skips the moves printed before a diagram when they do not fit it', () => {
    const d = diagram('d', 0, 50, 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R');
    const text = '1.d4 d5 2.c4 c6 3.a3 a6 4.Bb5 a6 5.Ba4 Nf6 6.O-O Be7 7.d3 b5';
    const { moves } = analyzeWords({ pages: [words(0, 200, text)], diagrams: [d] });
    expect(moves.map((m) => m.san).slice(-4)).toEqual(['O-O', 'Be7', 'd3', 'b5']);
    expect(moves[0]!.diagramId).toBe('d');
  });

  it('does not treat a side line going back a few moves as a new game', () => {
    const page = [
      ...words(0, 100, '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6', 0.3),
      ...words(0, 120, 'if', 0.15),
      ...words(0, 140, '2.d4 exd4', 0.3),
      ...words(0, 160, 'but', 0.15),
      ...words(0, 180, '5.O-O Be7', 0.3),
    ];
    const main = analyzeWords({ pages: [page], diagrams: [] }).moves.filter((m) => m.isMainLine).map((m) => m.san);
    expect(main.slice(-2)).toEqual(['O-O', 'Be7']);
  });

  it('remembers the move number printed in the book', () => {
    const d = diagram('d', 0, 50, '4k3/8/8/8/8/8/4P3/4K1N1');
    const { moves } = analyzeWords({ pages: [words(0, 200, '23.Nf3 Kd7')], diagrams: [d] });
    expect(moves[0]!.numberOffset).toBe(22);
  });

  it('accepts the initial position as a diagram', () => {
    const d = diagram('d', 0, 50, START);
    const { moves } = analyzeWords({ pages: [words(0, 200, '1.d4 d5')], diagrams: [d] });
    expect(sans(moves)).toEqual(['d4', 'd5']);
  });
});
