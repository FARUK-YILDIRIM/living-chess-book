import { describe, expect, it } from 'vitest';
import { formatScore, lineMoves, parseBestMove, parseInfo, positionState, scoreForWhite, toEngineLine } from '../src/core/uci';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('parseInfo', () => {
  it('reads a line of play', () => {
    expect(parseInfo('info depth 18 seldepth 25 multipv 2 score cp -34 nodes 123 nps 9 time 5 pv e2e4 e7e5 g1f3')).toEqual({
      depth: 18,
      rank: 2,
      score: { kind: 'cp', value: -34 },
      pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('reads a mate score, and takes one line when none is named', () => {
    expect(parseInfo('info depth 9 score mate -3 pv h7h6')).toMatchObject({ rank: 1, score: { kind: 'mate', value: -3 } });
  });

  it('reads a bound like any other score', () => {
    expect(parseInfo('info depth 9 multipv 1 score cp 20 lowerbound pv e2e4')?.score).toEqual({ kind: 'cp', value: 20 });
  });

  it('skips what is not a line of play', () => {
    expect(parseInfo('info string NNUE evaluation using nn.bin')).toBeNull();
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('info depth 1 score cp 10 pv')).toBeNull();
    expect(parseInfo('readyok')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('reads the move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4' });
  });

  it('knows when there is none', () => {
    expect(parseBestMove('bestmove (none)')).toEqual({ move: null });
  });

  it('skips anything else', () => {
    expect(parseBestMove('info depth 1')).toBeNull();
  });
});

describe('scores', () => {
  it('turns them to White\'s side', () => {
    expect(scoreForWhite({ kind: 'cp', value: 30 }, START)).toEqual({ kind: 'cp', value: 30 });
    expect(scoreForWhite({ kind: 'cp', value: 30 }, AFTER_E4)).toEqual({ kind: 'cp', value: -30 });
    expect(scoreForWhite({ kind: 'mate', value: 2 }, AFTER_E4)).toEqual({ kind: 'mate', value: -2 });
  });

  it('writes them the way players read them', () => {
    expect(formatScore({ kind: 'cp', value: 35 })).toBe('+0.35');
    expect(formatScore({ kind: 'cp', value: -120 })).toBe('-1.20');
    expect(formatScore({ kind: 'cp', value: 0 })).toBe('0.00');
    expect(formatScore({ kind: 'mate', value: -3 })).toBe('#-3');
  });
});

describe('lineMoves', () => {
  it('writes engine moves as a player would, with the position after each', () => {
    const moves = lineMoves(START, ['e2e4', 'e7e5', 'g1f3']);
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(moves[0]!.fen).toBe(AFTER_E4);
    expect(moves[2]).toMatchObject({ from: 'g1', to: 'f3' });
  });

  it('plays promotions, and tells them apart', () => {
    expect(lineMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'])[0]).toMatchObject({ uci: 'a7a8q' });
    expect(lineMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'])[0]!.san).toContain('a8=Q');
    expect(lineMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8n'])[0]).toMatchObject({ uci: 'a7a8n' });
  });

  it('stops at a move that cannot be played', () => {
    expect(lineMoves(START, ['e2e4', 'e2e4']).map((m) => m.san)).toEqual(['e4']);
  });

  it('gives nothing for an unreadable position', () => {
    expect(lineMoves('nonsense', ['e2e4'])).toEqual([]);
  });
});

describe('toEngineLine', () => {
  it('gives the score from White\'s side', () => {
    const line = toEngineLine({ depth: 5, rank: 1, score: { kind: 'cp', value: 40 }, pv: ['e7e5'] }, AFTER_E4);
    expect(line.score).toEqual({ kind: 'cp', value: -40 });
    expect(line.moves[0]!.san).toBe('e5');
  });
});

describe('positionState', () => {
  it('takes a normal position', () => {
    expect(positionState(START)).toBe('playable');
  });

  it('knows a game that has ended', () => {
    expect(positionState('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('over');
    expect(positionState('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('over');
  });

  it('refuses positions that could crash the engine', () => {
    expect(positionState('8/8/8/8/8/8/8/K7 w - - 0 1')).toBe('impossible');
    expect(positionState('k7/8/8/8/8/8/8/K6Q w - - 0 1')).toBe('impossible');
    expect(positionState('nonsense')).toBe('impossible');
  });

  it('refuses what was measured to crash the engine', () => {
    expect(positionState('k7/8/8/8/P7/8/PPPPPPPP/K7 w - - 0 1')).toBe('impossible');
    expect(positionState('1k6/8/1NNNNNNN/N7/8/8/PPPPPPPP/K7 w - - 0 1')).toBe('impossible');
    expect(positionState('rnbqkbnr/pppppppp/7P/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')).toBe('impossible');
  });

  // A misread bishop in the sample book's first diagram gave White a third rook with all eight pawns.
  it('refuses more promoted pieces than pawns gone, which also crashed the engine', () => {
    expect(positionState('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNRQK2R w KQkq - 0 1')).toBe('impossible');
    expect(positionState('rnbqkbnr/pppppppp/8/8/8/1N6/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('impossible');
    expect(positionState('rnbqkbnr/pppppppp/3q4/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('impossible');
  });

  it('takes a promoted piece once a pawn is gone, as the engine does', () => {
    expect(positionState('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PP1/RNRQK2R w KQkq - 0 1')).toBe('playable');
  });

  it('takes a full board, and many queens', () => {
    expect(positionState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('playable');
    expect(positionState('k7/8/8/8/8/1QQQQ2Q/8/K7 w - - 0 1')).toBe('playable');
  });

  it('refuses a pawn on the first or last rank', () => {
    expect(positionState('P6k/8/8/8/8/8/8/K7 w - - 0 1')).toBe('impossible');
  });
});
