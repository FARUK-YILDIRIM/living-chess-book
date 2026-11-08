import type { Word } from '../core/types';

/** A run of text from a PDF, in page points with the origin at the top left. */
export interface TextRun {
  text: string;
  x: number;
  baseline: number;
  width: number;
  height: number;
}

/** Runs closer than this share of the text height belong to one word. */
const WORD_GAP = 0.12;
const SAME_BASELINE = 0.3;
const ASCENT = 0.8;
const DESCENT = 0.2;

/**
 * Splits PDF text runs into words. Runs do not map to words: OCR layers often place
 * every piece of a word separately, and one run can also hold a whole line.
 */
export function wordsFromRuns(runs: readonly TextRun[], page: number): Word[] {
  const words: Word[] = [];
  let open: { word: Word; baseline: number; height: number } | null = null;

  const close = () => {
    if (open) words.push(open.word);
    open = null;
  };

  for (const run of runs) {
    if (!run.text) continue;
    const charWidth = run.width / run.text.length;

    for (const part of run.text.matchAll(/\S+|\s+/g)) {
      const text = part[0];
      if (/^\s/.test(text)) {
        close();
        continue;
      }
      const x0 = run.x + part.index * charWidth;
      const x1 = x0 + text.length * charWidth;
      const y0 = run.baseline - run.height * ASCENT;
      const y1 = run.baseline + run.height * DESCENT;

      const current = open as { word: Word; baseline: number; height: number } | null;
      if (
        current &&
        Math.abs(current.baseline - run.baseline) < current.height * SAME_BASELINE &&
        x0 - current.word.box.x1 < current.height * WORD_GAP &&
        x0 - current.word.box.x1 > -current.height
      ) {
        current.word.text += text;
        current.word.box.x1 = Math.max(current.word.box.x1, x1);
        current.word.box.y0 = Math.min(current.word.box.y0, y0);
        current.word.box.y1 = Math.max(current.word.box.y1, y1);
      } else {
        close();
        open = {
          word: { text, page, box: { x0, y0, x1, y1 }, ink: 0 },
          baseline: run.baseline,
          height: run.height,
        };
      }
    }
  }
  close();
  return words;
}
