import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
// why: W-284B38
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { AnalysisMessage, AnalysisRequest } from '../analysis/analysis.worker';
import type { analyzeBook, RawBook } from '../analysis/analyzeBook';
import type { Word } from '../core/types';
import type { RepairJob } from '../core/repair';
import { renderRegion, type CreateCropCanvas } from '../pdf/cropRegion';
import type { Chapter } from '../core/guess';
import { readPage, readPageWords, type CreateCanvas, type FoundBoard } from '../pdf/pageReader';
import type { Progress } from './preparation';
import type { Calibration } from '../vision/classifySquares';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

/** pdf.js takes ownership of the bytes it is given, so it gets its own copy. */
export function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(),
    verbosity: 0,
    // Decoders and fonts for scanned books. See scripts/copy-pdf-assets.mjs.
    wasmUrl: `${ASSETS}wasm/`,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise;
}

const createCanvas: CreateCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as never;
};

/** Reads every page. Yields between pages so that the window stays responsive. */
export async function readBook(
  pdf: PDFDocumentProxy,
  bookHash: string,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<RawBook> {
  const pageWords: Word[][] = [];
  const boards: FoundBoard[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    signal?.throwIfAborted();
    const page = await readPage(pdf, i, createCanvas);
    pageWords.push(page.words);
    boards.push(...page.boards);
    onProgress({ stage: 'reading', share: (i + 1) / pdf.numPages });
    await new Promise((resolve) => setTimeout(resolve));
  }
  return { bookHash, pageWords, boards };
}

const COVER_WIDTH = 160;

/** A small picture of the first page for the library. A book without one is still fine. */
export async function renderCover(pdf: PDFDocumentProxy): Promise<string | null> {
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: COVER_WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport, intent: 'print' }).promise;
    page.cleanup();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/** Reads only the text of every page, for a book whose analysis came from storage. */
export async function readWords(pdf: PDFDocumentProxy, signal?: AbortSignal): Promise<Word[][]> {
  const pages: Word[][] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    signal?.throwIfAborted();
    pages.push(await readPageWords(pdf, i));
  }
  return pages;
}

/** The top of the PDF's own table of contents, if it has one. */
export async function readChapters(pdf: PDFDocumentProxy): Promise<Chapter[]> {
  const outline = (await pdf.getOutline().catch(() => null)) ?? [];
  // A book with one title entry keeps its chapters a level down.
  const items = outline.length === 1 ? (outline[0]!.items ?? []) : outline;
  const chapters = await Promise.all(
    items.map(async (item): Promise<Chapter | null> => {
      try {
        const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        const ref = destination?.[0];
        if (!ref) return null;
        const page = typeof ref === 'number' ? ref : await pdf.getPageIndex(ref as never);
        return { title: item.title, page };
      } catch {
        return null;
      }
    }),
  );
  return chapters.filter((chapter): chapter is Chapter => chapter !== null);
}

/** The words of one page, for a reader who chose to send them to the coach. */
export async function readPageText(pdf: PDFDocumentProxy, page: number): Promise<string> {
  return (await readPageWords(pdf, page)).map((word) => word.text).join(' ');
}

const createCropCanvas: CreateCropCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as never;
};

/** Draws the parts of the pages that a model is asked to read. */
export function renderJob(pdf: PDFDocumentProxy, job: RepairJob): Promise<string[]> {
  return Promise.all(job.regions.map((region) => renderRegion(pdf, region, createCropCanvas)));
}

/** Runs the analysis off the main thread, since a whole book takes a few minutes. */
export function runAnalysis(
  raw: RawBook,
  calibration: Calibration | undefined,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<ReturnType<typeof analyzeBook>> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL('../analysis/analysis.worker.ts', import.meta.url), { type: 'module' });
    const onAbort = () => {
      worker.terminate();
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress({ stage: message.stage, share: message.done / message.total });
      } else if (message.type === 'done') {
        finish();
        resolve(message.result);
      } else {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The analysis stopped unexpectedly.'));
    };

    const request: AnalysisRequest = calibration ? { raw, calibration } : { raw };
    worker.postMessage(request);
  });
}
