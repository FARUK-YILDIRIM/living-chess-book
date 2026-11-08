import { describe, expect, it } from 'vitest';
import { decodeLine, GlyphModel, moveFullNumberOffset, PositionCache, type DecodedStep } from '../src/core/decoder';
import { parseToken } from '../src/core/tokens';
import type { MoveToken } from '../src/core/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const tokens = (...texts: string[]): MoveToken[] => texts.map((t) => parseToken(t)!);
const sans = (steps: DecodedStep[]) => steps.map((s) => (s.kind === 'move' ? s.san : `<${s.kind}>`));

describe('decodeLine', () => {
  it('decodes a clean line', () => {
    const line = decodeLine(START, tokens('1.e4', 'e5', '2.Nf3', 'Nc6', '3.Bb5', 'a6'));
    expect(sans(line.steps)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('uses later moves to choose between candidates for a damaged symbol', () => {
    // The symbol on move 2 is unreadable, so Nf3 and Qf3 both fit it. Only the
    // knight allows 3.Ne5 later in the line.
    const line = decodeLine(START, tokens('1.e4', 'e5', '2.??f3', 'd6', '3.??xe5'));
    expect(sans(line.steps)).toEqual(['e4', 'e5', 'Nf3', 'd6', 'Nxe5']);
  });

  it('skips a token that fits nowhere, rather than forcing a move', () => {
    const line = decodeLine(START, tokens('1.e4', 'e5', 'h6', '2.Nf3'));
    const moves = sans(line.steps);
    expect(moves).toContain('Nf3');
    expect(line.steps.filter((s) => s.kind === 'move').length).toBeGreaterThanOrEqual(3);
  });

  it('marks a move that does not exist in the position as skipped', () => {
    const line = decodeLine(START, tokens('1.Qh7'));
    expect(sans(line.steps)).toEqual(['<skip>']);
  });

  it('fills in a reply the text lost, and marks it as inserted', () => {
    const line = decodeLine(START, tokens('1.e4', '2.Nf3'));
    const kinds = line.steps.map((s) => s.kind);
    expect(kinds).toContain('inserted');
    expect(line.steps.at(-1)).toMatchObject({ kind: 'move', san: 'Nf3' });
  });

  it('does not capture a king in an illegal position', () => {
    const line = decodeLine('4k3/8/8/8/8/8/8/4R2K w - - 0 1', tokens('1.Rxe8'));
    expect(sans(line.steps)).toEqual(['<skip>']);
  });

  it('respects the move number offset of a position from a game', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
    const toks = tokens('23.Bb5', 'a6');
    const line = decodeLine(fen, toks, { offset: moveFullNumberOffset(toks) });
    expect(sans(line.steps)).toEqual(['Bb5', 'a6']);
  });

  it('does not grow out of memory on long lines', () => {
    const texts: string[] = [];
    for (let i = 1; i <= 40; i += 4) {
      texts.push(`${i}.Nf3`, 'Nf6', `${i + 1}.Ng1`, 'Ng8', `${i + 2}.Nf3`, 'Nf6', `${i + 3}.Ng1`, 'Ng8');
    }
    const line = decodeLine(START, tokens(...texts));
    expect(line.steps.filter((s) => s.kind === 'move')).toHaveLength(80);
  });
});

describe('PositionCache', () => {
  it('gives the same result when a cache is shared between lines', () => {
    const cache = new PositionCache();
    const first = decodeLine(START, tokens('1.e4', 'e5'), { cache });
    const second = decodeLine(START, tokens('1.e4', 'e5'), { cache });
    expect(sans(second.steps)).toEqual(sans(first.steps));
  });
});

describe('membership', () => {
  it('leaves out a side line that does not fit, at no cost', () => {
    const toks = tokens('1.e4', 'e5', '1...c5', '2.Nf3');
    const line = decodeLine(START, toks, { membership: [1, 1, 0, 1] });
    expect(sans(line.steps)).toEqual(['e4', 'e5', '<skip>', 'Nf3']);
    expect(line.score).toBeGreaterThan(-1);
  });

  it('uses one when the line needs it', () => {
    // Move 1 for Black is only marked optional, but 2.Nf3 needs it to have been played.
    const line = decodeLine(START, tokens('1.e4', '1...e5', '2.Nf3', 'Nc6'), { membership: [1, 0, 1, 1] });
    expect(sans(line.steps)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
});

describe('a token of uncertain weight', () => {
  it('costs something to skip, so that a line can prefer to use it', () => {
    const half = decodeLine(START, tokens('1.Qh7'), { membership: [0.5] });
    const none = decodeLine(START, tokens('1.Qh7'), { membership: [0] });
    expect(half.score).toBeLessThan(none.score);
  });
});

describe('GlyphModel', () => {
  it('learns which piece a damaged symbol means', () => {
    const model = new GlyphModel();
    for (let i = 0; i < 20; i++) model.observe('§', 'r');
    expect(model.score('§', 'r')).toBeGreaterThan(model.score('§', 'q'));
  });

  it('is neutral about a symbol it has never seen', () => {
    const model = new GlyphModel();
    expect(model.score('?!', 'n')).toBe(model.score('?!', 'q'));
  });

  it('resolves an ambiguous move with what it learned', () => {
    // After 1.e4 e5 2.Bc4 Nc6, Bd3 and Qh5 are unrelated, but d3 can be reached
    // by the pawn or the bishop. The learned symbol picks the bishop.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1';
    const model = new GlyphModel();
    for (let i = 0; i < 20; i++) model.observe('Jl', 'b');
    const line = decodeLine(fen, tokens('1.Jld3'), { model });
    expect(sans(line.steps)).toEqual(['Bd3']);
  });

  it('flags a move whose symbol disagrees with what it learned', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K1N1 w - - 0 1';
    const model = new GlyphModel();
    for (let i = 0; i < 30; i++) model.observe('§', 'r');
    const line = decodeLine(fen, tokens('1.§f3'), { model });
    expect(line.steps[0]).toMatchObject({ kind: 'move', san: 'Nf3', lowConfidence: true });
  });
});
