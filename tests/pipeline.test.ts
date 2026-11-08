import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeBook, type RawBook } from '../src/analysis/analyzeBook';
import type { BookOverlay, Word } from '../src/core/types';
import { readPage, type CreateCanvas, type FoundBoard } from '../src/pdf/pageReader';
import { wordsFromRuns } from '../src/pdf/textItems';
import { makeBook, SAMPLE_DIAGRAMS } from './helpers/sampleBook';

describe('wordsFromRuns', () => {
  const run = (text: string, x: number, width: number, baseline = 100) => ({ text, x, baseline, width, height: 10 });

  it('splits a run with spaces into words', () => {
    const words = wordsFromRuns([run('1.e4 e5', 0, 70)], 3);
    expect(words.map((w) => w.text)).toEqual(['1.e4', 'e5']);
    expect(words[1]!.box.x0).toBe(50);
    expect(words[0]!.page).toBe(3);
  });

  it('joins runs that touch', () => {
    expect(wordsFromRuns([run('Nx', 0, 20), run('e5', 20, 20)], 0).map((w) => w.text)).toEqual(['Nxe5']);
  });

  it('keeps runs apart when there is a gap', () => {
    expect(wordsFromRuns([run('e4', 0, 20), run('e5', 30, 20)], 0).map((w) => w.text)).toEqual(['e4', 'e5']);
  });

  it('keeps lines apart', () => {
    expect(wordsFromRuns([run('e4', 0, 20, 100), run('e5', 20, 20, 120)], 0).map((w) => w.text)).toEqual(['e4', 'e5']);
  });

  it('places words with the top of the text above the baseline', () => {
    const [word] = wordsFromRuns([run('e4', 0, 20)], 0);
    expect(word!.box.y0).toBeLessThan(100);
    expect(word!.box.y1).toBeGreaterThan(100);
  });
});

describe('reading a generated PDF', () => {
  const create: CreateCanvas = (width, height) => createCanvas(width, height) as never;
  let boards: FoundBoard[];
  let pageWords: Word[][];
  let overlay: BookOverlay;

  beforeAll(async () => {
    const data = await makeBook();
    const document = await getDocument({ data, verbosity: 0 }).promise;
    boards = [];
    pageWords = [];
    for (let i = 0; i < document.numPages; i++) {
      const page = await readPage(document as never, i, create);
      pageWords.push(page.words);
      boards.push(...page.boards);
    }
    const raw: RawBook = { bookHash: 'test-hash', pageWords, boards };
    overlay = analyzeBook(raw).overlay;
  }, 60000);

  it('finds every diagram with its caption', () => {
    expect(boards).toHaveLength(3);
    expect(boards[0]).toMatchObject({ page: 0, label: 'diagram 1', sideToMove: 'w' });
    expect(boards[1]).toMatchObject({ page: 1, label: 'diagram 2', sideToMove: 'w' });
  });

  it('reads diagrams almost exactly, with no help from a reader', () => {
    const expand = (placement: string) => placement.replace(/\//g, '').replace(/\d/g, (n) => '.'.repeat(Number(n)));
    const wrongSquares = overlay.diagrams.flatMap((d, i) => {
      const expected = expand(SAMPLE_DIAGRAMS[i]!);
      return [...expand(d.placement)].filter((piece, square) => piece !== expected[square]);
    });
    // A known limit: with only three diagrams to learn from, a white bishop on a dark
    // square can be read as a rook. See docs/spike-results.md.
    expect(wrongSquares.length).toBeLessThanOrEqual(1);
    expect(overlay.diagrams.every((d) => d.issues.length === 0)).toBe(true);
  });

  it('positions a diagram where it was drawn', () => {
    const box = boards[0]!.box;
    expect(Math.abs(box.x0 - 110)).toBeLessThan(4);
    expect(Math.abs(box.y0 - (648 - 515))).toBeLessThan(4);
  });

  it('positions a word where it was drawn', () => {
    const word = pageWords[0]!.find((w) => w.text.startsWith('1.e4'))!;
    expect(Math.abs(word.box.x0 - 40)).toBeLessThan(3);
    expect(word.box.y0).toBeLessThan(648 - 570);
    expect(word.box.y1).toBeGreaterThan(648 - 572);
  });

  it('reads the moves before the first diagram from the initial position', () => {
    const line = overlay.moves.filter((m) => m.diagramId === null).map((m) => m.san);
    expect(line.slice(0, 5)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  });

  it('reads the moves that follow each diagram from that diagram', () => {
    const lineOf = (index: number) =>
      overlay.moves.filter((m) => m.diagramId === overlay.diagrams[index]!.id).map((m) => m.san);
    expect(lineOf(0)).toEqual(['Ng5', 'O-O', 'O-O', 'h6']);
    expect(lineOf(1)).toEqual(['Rd8#']);
    expect(lineOf(2)).toEqual(['Qxc6', 'Nd6', 'Bc4']);
  });

  it('keeps no text in the overlay', () => {
    const stored = JSON.stringify(overlay);
    for (const word of ['Opening', 'calm', 'knight', 'squares', 'mate']) expect(stored).not.toContain(word);
  });
});
