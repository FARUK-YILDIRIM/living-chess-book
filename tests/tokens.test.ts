import { describe, expect, it } from 'vitest';
import { mergeWords, parseToken } from '../src/core/tokens';
import type { Word } from '../src/core/types';

function word(text: string, x = 0, ink = 0.2, page = 0, y = 100): Word {
  return { text, page, box: { x0: x, y0: y, x1: x + 10, y1: y + 10 }, ink };
}
const texts = (ws: Word[]) => mergeWords(ws).map((w) => w.text);

describe('mergeWords', () => {
  it('joins a detached move number and dots with the move', () => {
    expect(texts([word('2'), word('...'), word('fxe6')])).toEqual(['2...fxe6']);
  });

  it('joins a detached piece glyph with its square', () => {
    expect(texts([word('§'), word('xf8')])).toEqual(['§xf8']);
  });

  it('marks a piece symbol lost between the number and the square', () => {
    const [merged] = mergeWords([word('10.'), word('g5')]);
    expect(merged?.text).toBe('10.g5');
    expect(merged?.glyphLost).toBe(true);
    expect(mergeWords([word('10.g5')])[0]?.glyphLost).toBeFalsy();
  });

  it('drops lone punctuation before a move number', () => {
    expect(texts([word('•'), word('.'), word('1'), word('...'), word('e5')])).toEqual(['1...e5']);
  });

  it('keeps dot-like noise between a number and its move', () => {
    expect(texts([word('2'), word('•'), word('•'), word('.'), word('§xa3+')])).toEqual(['2••.§xa3+']);
  });

  it('repairs OCR damage in move numbers', () => {
    expect(texts([word('s.Nf3')])).toEqual(['5.Nf3']);
    expect(texts([word('l...e5')])).toEqual(['1...e5']);
  });

  it('does not join across pages, or across lines unless a number waits for its move', () => {
    expect(texts([word('3.', 0, 0.2, 0), word('e4', 0, 0.2, 1)])).toEqual(['3.', 'e4']);
    expect(texts([word('Then', 0, 0.2, 0, 100), word('e4', 0, 0.2, 0, 140)])).toEqual(['Then', 'e4']);
    expect(texts([word('3', 0, 0.2, 0, 100), word('e4', 0, 0.2, 0, 140)])).toEqual(['3', 'e4']);
  });

  it('joins words on one line even when their boxes have different heights', () => {
    const tall = { ...word('2'), box: { x0: 0, y0: 100, x1: 5, y1: 112 } };
    const short = { ...word('•'), box: { x0: 6, y0: 106, x1: 9, y1: 110 } };
    expect(texts([tall, short, word('§xa3+', 10, 0.2, 0, 102)])).toEqual(['2•§xa3+']);
  });

  it('does not join castling with the next move', () => {
    expect(texts([word('O-O'), word('2.O-O')])).toEqual(['O-O', '2.O-O']);
    expect(texts([word('0-0-0'), word('h6')])).toEqual(['0-0-0', 'h6']);
  });

  it('splits a word where OCR lost a space', () => {
    expect(texts([word('e5!\uFFFDBest,')])).toEqual(['e5!', 'Best,']);
    expect(texts([word('\uFFFD8.Nxe5!')])).toEqual(['8.Nxe5!']);
    expect(texts([word('6.d5\uFFFD7.Nf3')])).toEqual(['6.d5', '7.Nf3']);
  });

  it('keeps a damaged symbol in front of a square', () => {
    expect(texts([word('\uFFFDf5')])).toEqual(['\uFFFDf5']);
    expect(parseToken('\uFFFDf5')).toMatchObject({ key: '\uFFFD', to: 'f5' });
  });

  it('keeps ordinary words separate', () => {
    expect(texts([word('the'), word('bishop'), word('on'), word('e4')])).toEqual([
      'the',
      'bishop',
      'on',
      'e4',
    ]);
  });

  it('weighs the ink of merged words by their area, and keeps the full box', () => {
    const dot = { ...word('.', 0, 0.9), box: { x0: 0, y0: 100, x1: 1, y1: 101 } };
    const move = { ...word('e4', 2, 0.2), box: { x0: 2, y0: 100, x1: 22, y1: 110 } };
    const [merged] = mergeWords([word('3', -8, 0.2), dot, move]);
    expect(merged?.ink).toBeLessThan(0.21);
    expect(merged?.box.x1).toBe(22);
  });
});

describe('moves printed in a table', () => {
  const word = (text: string, x0: number, x1: number): Word => ({ text, page: 0, ink: 0.3, box: { x0, y0: 100, x1, y1: 112 } });

  it('reads a number with no dot, when a move follows it', () => {
    const merged = mergeWords([word('1', 100, 106), word('d4', 200, 214), word('d5,', 280, 296)]);
    expect(merged.map((w) => w.text)).toEqual(['1.d4', 'd5,']);
    expect(parseToken(merged[0]!.text)).toMatchObject({ moveNumber: 1, to: 'd4' });
  });

  it('makes only the move clickable, and not the gap before it', () => {
    const [move] = mergeWords([word('1', 100, 106), word('d4', 200, 214)]);
    expect(move!.box.x0).toBe(200);
  });

  it('reads a number, dots and a move', () => {
    const merged = mergeWords([word('7', 100, 106), word('...', 200, 214), word('Nxc3,', 280, 300)]);
    expect(parseToken(merged[0]!.text)).toMatchObject({ moveNumber: 7, dots: 3, to: 'c3' });
  });

  it('leaves a number in prose alone', () => {
    expect(mergeWords([word('3', 100, 106), word('pawns', 110, 140)]).map((w) => parseToken(w.text))).toEqual([null]);
  });

  it('joins a number with a move wrapped to the next line, and clicks on the move', () => {
    const first = word('1.', 400, 410);
    const second: Word = { text: 'Ke2,', page: 0, ink: 0.3, box: { x0: 50, y0: 120, x1: 80, y1: 132 } };
    const merged = mergeWords([first, second]);
    expect(merged).toHaveLength(1);
    expect(parseToken(merged[0]!.text)).toMatchObject({ moveNumber: 1, to: 'e2' });
    expect(merged[0]!.box.x0).toBe(50);
    expect(merged[0]!.box.y0).toBe(120);
  });

  it('does not join a number to a word on the next line that is not a move', () => {
    const first = word('1.', 400, 410);
    const second: Word = { text: 'Then', page: 0, ink: 0.3, box: { x0: 50, y0: 120, x1: 80, y1: 132 } };
    expect(mergeWords([first, second])).toHaveLength(2);
  });

  it('reads the signs chess fonts print', () => {
    expect(parseToken('25\u2026BXe6,')).toMatchObject({ moveNumber: 25, dots: 3, capture: true, to: 'e6', key: 'B' });
    expect(parseToken('fXg3,')).toMatchObject({ fromFile: 'f', capture: true, to: 'g3' });
    expect(parseToken('RXe6')).toMatchObject({ key: 'R', capture: true });
    const merged = mergeWords([word('32', 100, 110), word('hXg6', 200, 220)]);
    expect(merged[0]!.text).toBe('32.hXg6');
  });

  it('does not read a capital X in a word as a capture', () => {
    expect(parseToken('EXa1')).toBeTruthy();
    expect(parseToken('Xa1')).toMatchObject({ capture: false });
  });

  it('reads a multiplication sign as a capture', () => {
    expect(parseToken('Nd5\u00d7c3')).toBeTruthy();
    expect(parseToken('b\u00d7c3')).toMatchObject({ fromFile: 'b', capture: true, to: 'c3' });
  });
});

describe('parseToken', () => {
  it('parses a numbered white move', () => {
    expect(parseToken('12.bxc4')).toMatchObject({
      moveNumber: 12,
      dots: 1,
      key: '',
      fromFile: 'b',
      capture: true,
      to: 'c4',
    });
  });

  it('parses a black move with a damaged piece symbol', () => {
    expect(parseToken('2...§c7')).toMatchObject({ moveNumber: 2, dots: 3, key: '§', to: 'c7' });
  });

  it('parses an unnumbered reply and ignores annotations', () => {
    expect(parseToken('Nf6?!')).toMatchObject({ moveNumber: null, key: 'N', to: 'f6', capture: false });
  });

  it('uses a separate glyph key when the symbol was lost', () => {
    expect(parseToken('10.g5', true)).toMatchObject({ key: '_lost', to: 'g5' });
  });

  it('repairs a damaged destination rank', () => {
    expect(parseToken('1...dxeS')).toMatchObject({ to: 'e5', fromFile: 'd', capture: true });
    expect(parseToken('Bcl')).toMatchObject({ to: 'c1' });
  });

  it('reads dot-like noise as the dots of a black move', () => {
    expect(parseToken('2••.§xa3+')).toMatchObject({ moveNumber: 2, dots: 3, key: '§', to: 'a3', capture: true });
  });

  it('keeps a dot that is part of a damaged symbol', () => {
    expect(parseToken('3..§f6')).toMatchObject({ moveNumber: 3, dots: 1, key: '.§', to: 'f6' });
    expect(parseToken('3....§f6')).toMatchObject({ moveNumber: 3, dots: 3, key: '.§', to: 'f6' });
    expect(parseToken('3...§f6')).toMatchObject({ moveNumber: 3, dots: 3, key: '§', to: 'f6' });
    expect(parseToken('..§f6')).toMatchObject({ moveNumber: null, key: '.§', to: 'f6' });
  });

  it('repairs a final t only after a piece symbol', () => {
    expect(parseToken('§at')).toMatchObject({ to: 'a1', key: '§' });
    expect(parseToken('at')).toBeNull();
  });

  it('parses castling with letters or zeros', () => {
    expect(parseToken('9.O-O')).toMatchObject({ castle: 'k', moveNumber: 9 });
    expect(parseToken('0-0-0+')).toMatchObject({ castle: 'q' });
  });

  it('notes a promotion', () => {
    expect(parseToken('11.fxg8=Q+')).toMatchObject({ to: 'g8', promotion: true, fromFile: 'f' });
  });

  it('rejects text that is not a move', () => {
    for (const text of ['bishop', '1985', 'g2-h3-e6-f7', '1-0', 'winning.', 'somethingd4']) {
      expect(parseToken(text), text).toBeNull();
    }
  });
});
