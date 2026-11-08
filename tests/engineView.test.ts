import { describe, expect, it } from 'vitest';
import { compareBookMove, lineText, numberedLine, threatFen, verdictOf, whiteShare } from '../src/core/engineView';
import { lineMoves, type EngineLine } from '../src/core/uci';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const cp = (value: number) => ({ kind: 'cp' as const, value });

describe('whiteShare', () => {
  it('is even at equality, and moves toward the side ahead', () => {
    expect(whiteShare(cp(0))).toBe(0.5);
    expect(whiteShare(cp(200))).toBeGreaterThan(0.6);
    expect(whiteShare(cp(-200))).toBeLessThan(0.4);
  });

  it('is full for a mate', () => {
    expect(whiteShare({ kind: 'mate', value: 3 })).toBe(1);
    expect(whiteShare({ kind: 'mate', value: -2 })).toBe(0);
  });

  it('moves less for the same pawn when far ahead', () => {
    expect(whiteShare(cp(100)) - whiteShare(cp(0))).toBeGreaterThan(whiteShare(cp(900)) - whiteShare(cp(800)));
  });
});

describe('verdictOf', () => {
  it('puts a score in words', () => {
    expect(verdictOf(cp(10))).toEqual({ kind: 'equal' });
    expect(verdictOf(cp(60))).toEqual({ kind: 'better', side: 'white', degree: 'slightly', pawns: 0.6 });
    expect(verdictOf(cp(-180))).toEqual({ kind: 'better', side: 'black', degree: 'clearly', pawns: 1.8 });
    expect(verdictOf(cp(450)).kind === 'better' && verdictOf(cp(450))).toMatchObject({ degree: 'winning' });
    expect(verdictOf({ kind: 'mate', value: -3 })).toEqual({ kind: 'mate', side: 'black', moves: 3 });
  });
});

describe('threatFen', () => {
  it('lets the other side move', () => {
    expect(threatFen('4k3/8/8/8/8/8/8/4K2R w K - 0 10')).toBe('4k3/8/8/8/8/8/8/4K2R b K - 0 10');
  });

  it('has nothing while the side to move is in check', () => {
    expect(threatFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeNull();
  });
});

describe('numberedLine', () => {
  it('numbers from White', () => {
    expect(lineText(numberedLine(START, lineMoves(START, ['e2e4', 'e7e5', 'g1f3'])))).toBe('1. e4 e5 2. Nf3');
  });

  it('numbers from Black, as a book does', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(lineText(numberedLine(fen, lineMoves(fen, ['e7e5', 'g1f3'])))).toBe('1... e5 2. Nf3');
  });
});

describe('compareBookMove', () => {
  const line = (rank: number, uci: string, value: number): EngineLine => ({ rank, depth: 18, score: cp(value), moves: lineMoves(START, [uci]) });
  const lines = [line(1, 'e2e4', 40), line(2, 'd2d4', 30), line(3, 'g1f3', 20)];

  it('finds the book move among the lines', () => {
    expect(compareBookMove(lines, 'd2d4', true)).toEqual({ rank: 2, judgement: { grade: 'as-good', lossInPawns: 0.1 } });
  });

  it('uses a score of its own when the move is not among them', () => {
    expect(compareBookMove(lines, 'g2g4', true, cp(-120))).toEqual({ rank: null, judgement: { grade: 'worse', lossInPawns: 1.6 } });
  });

  it('reads the loss the other way for Black', () => {
    expect(compareBookMove([line(1, 'e2e4', -50)], 'x', false, cp(100))?.judgement.grade).toBe('worse');
  });

  it('says nothing without lines or a score', () => {
    expect(compareBookMove([], 'e2e4', true)).toBeNull();
    expect(compareBookMove(lines, 'g2g4', true)).toBeNull();
  });
});

describe('threatFen and en passant', () => {
  it('drops a capture square that was only for the side to move', () => {
    expect(threatFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2')).toBe('4k3/8/8/3pP3/8/8/8/4K3 b - - 0 2');
  });

  it('counts White moving out of turn as the next move', () => {
    expect(threatFen('4k3/8/8/8/8/8/8/4K2R b K - 0 10')).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 11');
  });
});
