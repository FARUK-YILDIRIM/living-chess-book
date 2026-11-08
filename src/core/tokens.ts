import type { Box, MoveToken, Word } from './types';

const COMMON_SHORT_WORDS = new Set(
  'a i an to if is of in on or by so at as it he be no we up do go and the for but his has was not'.split(' '),
);

const SQUARE = /[a-h][1-8]/;
const ONLY_PUNCTUATION = /^[•*·.,\uFFFD]+$/;
/** OCR can leave a replacement character where a space was: `e5!□Best,` or `□8.Nf3`. */
const LOST_SPACE = /(?<=[!?+#\w.])\uFFFD(?=\d{1,3}\.|[A-Za-z]{3})|^\uFFFD(?=\d{1,3}\.)/;
const RESULT = /^(1-0|0-1)$/;
const MAX_PREFIX_LENGTH = 7;
/** Two words share a line when their boxes overlap by this share of the shorter one. */
const SAME_LINE_OVERLAP = 0.3;
/** A number with no dot only counts as a move number when a move comes next. */
const BARE_NUMBER = /^\d{1,3}$/;
/** A number with its dots, left at the end of a line when the move wrapped to the next. */
const DOTTED_NUMBER = /^\d{1,3}[.\u2026]+$/;
const LOOKS_LIKE_MOVE = /^(?:[KQRBN]?[a-h]?[1-8]?[xX\u00d7]?[a-h][1-8]|[0O]-[0O])/;
/** Fonts for chess books map a capture sign to `X` or `×`, and three dots to `…`. */
const normalizeSigns = (text: string) =>
  text
    .replace(/\u2026/g, '...')
    .replace(/\u00d7/g, 'x')
    .replace(/(?<=[KQRBNa-h1-8])X(?=[a-h][1-8])/g, 'x');

/** Repairs common OCR damage in a move number. */
function repairMoveNumber(text: string): string {
  return text
    .replace(/^[•*·.,]+(?=\d)/, '')
    .replace(/^[sS](\.+)/, '5$1')
    .replace(/^[lI](\.+)/, '1$1')
    .replace(/^[lI](\d)(\.+)/, '1$1$2')
    .replace(/^(\d{1,3})\s*[•·]\s*/, '$1.');
}

/** Splits a word where OCR lost a space, sharing its box out by length. */
function splitLostSpaces(word: Word): Word[] {
  const match = word.text.match(LOST_SPACE);
  if (match?.index === undefined) return [word];
  const { box, text } = word;
  const cut = box.x0 + ((box.x1 - box.x0) * match.index) / text.length;
  const left = text.slice(0, match.index);
  const right = text.slice(match.index + 1);
  return [
    ...(left ? [{ ...word, text: left, box: { ...box, x1: cut } }] : []),
    ...splitLostSpaces({ ...word, text: right, box: { ...box, x0: cut } }),
  ];
}

/** True when a word is only part of a move, and needs the next word to complete it. */
function isFragment(text: string): boolean {
  if (/^[0O]-[0O]/.test(text)) return false;
  if (/^\d{1,3}[.•· ]*$/.test(text) || /^[.•·\s]+$/.test(text)) return true;
  if (text.length > 4 || SQUARE.test(text)) return false;
  if (/^[a-zA-Z]{2,}$/.test(text) || /^[A-Z]\.?$/.test(text)) return false;
  if (COMMON_SHORT_WORDS.has(text.toLowerCase()) || RESULT.test(text)) return false;
  return !/[,;:]$/.test(text);
}

const boxArea = (box: Box) => Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);

/** OCR gives symbols odd heights, so comparing the tops of two boxes is not enough. */
function isSameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return overlap > SAME_LINE_OVERLAP * Math.min(a.y1 - a.y0, b.y1 - b.y0);
}

/**
 * OCR splits moves into pieces, like `2`, `...` and `fxe6`. This puts them back
 * together, staying on the same line of the same page.
 */
export function mergeWords(words: readonly Word[]): Word[] {
  const repaired = words.flatMap(splitLostSpaces).map((w) => ({ ...w, text: repairMoveNumber(w.text) }));
  const kept: Word[] = [];
  for (let i = repaired.length - 1; i >= 0; i--) {
    const word = repaired[i]!;
    const next = kept[0];
    if (ONLY_PUNCTUATION.test(word.text) && next && /^\d/.test(next.text)) continue;
    kept.unshift(word);
  }

  const merged: Word[] = [];
  for (let i = 0; i < kept.length; i++) {
    const current = { ...kept[i]!, box: { ...kept[i]!.box } };
    let next = kept[i + 1];
    while (
      next &&
      isFragment(current.text) &&
      next.page === current.page &&
      (isSameLine(current.box, next.box) || (DOTTED_NUMBER.test(current.text) && LOOKS_LIKE_MOVE.test(next.text)))
    ) {
      // A move wrapped to the next line is clicked there, and not across both lines.
      if (!isSameLine(current.box, next.box)) current.box = { ...next.box };
      if (current.text.endsWith('.') && /^x?[a-h][1-8]/.test(next.text)) current.glyphLost = true;
      // Tables often print `1  d4  d5` with the number in a column of its own.
      if (BARE_NUMBER.test(current.text) && LOOKS_LIKE_MOVE.test(next.text)) current.text += '.';
      // Only the move should be clickable, and not a wide gap in front of it.
      if (next.box.x0 - current.box.x1 > current.box.y1 - current.box.y0) current.box.x0 = next.box.x0;
      // Weigh ink by area: a tiny dot is often solid black and says nothing about weight.
      const currentArea = boxArea(current.box);
      const nextArea = boxArea(next.box);
      const totalArea = currentArea + nextArea;
      if (totalArea > 0) current.ink = (current.ink * currentArea + next.ink * nextArea) / totalArea;
      current.text += next.text;
      current.box.x1 = next.box.x1;
      current.box.y1 = Math.max(current.box.y1, next.box.y1);
      i++;
      next = kept[i + 1];
    }
    merged.push(current);
  }
  return merged;
}

const repairSquare = (text: string) =>
  text
    .replace(/([a-h])S/g, '$15')
    .replace(/([a-h])[lI]/g, '$11')
    .replace(/([a-h])O/g, '$10')
    // Only after a symbol, because `at` on its own is an English word.
    .replace(/([^a-zA-Z\d.][a-h])t(?![a-zA-Z])/g, '$11');

/** Reads one merged word as a move. Returns null when it is not a move. */
export function parseToken(text: string, glyphLost = false): MoveToken | null {
  let rest = repairSquare(normalizeSigns(text.replace(/\s/g, '')));
  let moveNumber: number | null = null;
  let dots = 0;

  const numbered = rest.match(/^(\d{1,3})([.•·]+)(.*)$/);
  if (numbered) {
    moveNumber = Number(numbered[1]);
    dots = numbered[2]!.length;
    rest = numbered[3]!;
    // Numbers take one dot or three. Any other dot belongs to a damaged piece symbol,
    // and can be the only thing telling a bishop from a rook.
    if (dots === 2 || dots >= 4) {
      dots -= 1;
      rest = `.${rest}`;
    }
  }

  const base = { moveNumber, dots, key: '', fromFile: null, capture: false, to: null, promotion: false };

  const castling = rest.match(/^[0O]-[0O](-[0O])?(?![-\d])/);
  if (castling) return { ...base, castle: castling[1] ? 'q' : 'k' };

  const move = rest.match(/^(.*?)(x?)([a-h][1-8])(=.{0,3})?[^a-zA-Z0-9]*$/);
  if (!move) return null;

  // A promotion's leftovers can stick to the next move, as in `=+.Q.xg8`.
  let prefix = move[1]!.replace(/^[=+#]+/, '').replace(/^\.+/, '.');
  if (prefix.length > MAX_PREFIX_LENGTH || prefix.includes('-')) return null;

  let fromFile: string | null = null;
  const withFile = prefix.match(/^(.*?)([a-h])$/);
  if (withFile) {
    fromFile = withFile[2]!;
    prefix = withFile[1]!;
  }

  return {
    moveNumber,
    dots,
    key: glyphLost && !prefix ? '_lost' : prefix,
    fromFile,
    capture: move[2] === 'x',
    to: move[3]!,
    promotion: Boolean(move[4]),
    castle: null,
  };
}
