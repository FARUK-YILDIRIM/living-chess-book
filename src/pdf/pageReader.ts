import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { labelFromWords, sideToMoveFromWords } from '../core/book';
import type { Box, Color, Word } from '../core/types';
import { sliceBoard, type BoardTiles } from '../vision/classifySquares';
import { detectBoards } from '../vision/detectBoards';
import { inkInBox, type GrayImage } from '../vision/gray';
import { wordsFromRuns, type TextRun } from './textItems';

/** Analysis resolution. Enough for diagrams and for telling bold from regular text. */
export const ANALYSIS_DPI = 200;
const POINTS_PER_INCH = 72;
const CAPTION_REACH = 24;
const CAPTION_MARGIN = 40;

/** What is needed from a canvas, which differs between the browser and tests. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasContext | null;
}

interface CanvasContext {
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

export type CreateCanvas = (width: number, height: number) => CanvasLike;

export interface FoundBoard {
  page: number;
  box: Box;
  tiles: BoardTiles;
  label: string | null;
  sideToMove: Color | null;
}

export interface ReadPage {
  words: Word[];
  boards: FoundBoard[];
}

async function renderGray(page: PDFPageProxy, scale: number, createCanvas: CreateCanvas): Promise<GrayImage> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas for rendering');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    // The display intent waits for animation frames, which stop while the window is hidden,
    // and work that takes minutes must not stall because a reader looked away.
    intent: 'print',
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!) / 3;
  }
  return { width: canvas.width, height: canvas.height, data: gray };
}

async function readRuns(page: PDFPageProxy): Promise<TextRun[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const [a, b, c, d, e, f] = viewport.transform as [number, number, number, number, number, number];

  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue;
    const [, , ic, id, ie, ig] = item.transform as [number, number, number, number, number, number];
    // Combine the page's transform with the item's, as pdf.js does for its text layer.
    const tc = a * ic + c * id;
    const td = b * ic + d * id;
    const x = a * ie + c * ig + e;
    const baseline = b * ie + d * ig + f;
    const height = Math.hypot(tc, td) || item.height;
    runs.push({ text: item.str, x, baseline, width: item.width, height });
  }
  return runs;
}

/** Reads only the words of a page, which is quick. Print weight is left at zero. */
export async function readPageWords(document: PDFDocumentProxy, pageIndex: number): Promise<Word[]> {
  const page = await document.getPage(pageIndex + 1);
  const words = wordsFromRuns(await readRuns(page), pageIndex);
  page.cleanup();
  return words;
}

function wordsNear(words: readonly Word[], box: Box): { above: Word[]; below: Word[] } {
  const isAcross = (word: Word) => word.box.x1 > box.x0 - CAPTION_MARGIN && word.box.x0 < box.x1 + CAPTION_MARGIN;
  return {
    above: words.filter((w) => isAcross(w) && w.box.y1 <= box.y0 + 2 && w.box.y0 >= box.y0 - CAPTION_REACH),
    below: words.filter((w) => isAcross(w) && w.box.y0 >= box.y1 - 2 && w.box.y1 <= box.y1 + CAPTION_REACH),
  };
}

/** Reads one page: its words, with how heavily each is printed, and its diagrams. */
export async function readPage(
  document: PDFDocumentProxy,
  pageIndex: number,
  createCanvas: CreateCanvas,
): Promise<ReadPage> {
  const page = await document.getPage(pageIndex + 1);
  const scale = ANALYSIS_DPI / POINTS_PER_INCH;
  const image = await renderGray(page, scale, createCanvas);

  const words = wordsFromRuns(await readRuns(page), pageIndex);
  for (const word of words) {
    word.ink = inkInBox(image, {
      x0: word.box.x0 * scale,
      y0: word.box.y0 * scale,
      x1: word.box.x1 * scale,
      y1: word.box.y1 * scale,
    });
  }

  const boards = detectBoards(image).map((pixels): FoundBoard => {
    const box: Box = {
      x0: pixels.x0 / scale,
      y0: pixels.y0 / scale,
      x1: pixels.x1 / scale,
      y1: pixels.y1 / scale,
    };
    const { above, below } = wordsNear(words, box);
    return {
      page: pageIndex,
      box,
      tiles: sliceBoard(image, pixels),
      label: labelFromWords(above) ?? labelFromWords(below),
      sideToMove: sideToMoveFromWords(below) ?? sideToMoveFromWords(above),
    };
  });

  page.cleanup();
  return { words, boards };
}
