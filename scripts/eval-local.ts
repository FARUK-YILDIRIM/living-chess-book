/**
 * Measures the pipeline on a book you own, kept outside the repository. It prints
 * aggregate numbers only, so its output is safe to share (see ADR-0008).
 *
 *   npm run eval:local -- <book.pdf> [truth.json] [overlay-out.json]
 *
 * truth.json holds hand-checked main lines, and must stay out of the repository:
 *   { "problem 112": ["Bh3", "Kf8", ...] }
 */
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeBook, type RawBook } from '../src/analysis/analyzeBook';
import type { BookOverlay, Word } from '../src/core/types';
import { readPage, type CreateCanvas, type FoundBoard } from '../src/pdf/pageReader';
import { scoreLines } from './score-lines';

const [pdfPath, truthPath, overlayPath] = process.argv.slice(2);
if (!pdfPath) throw new Error('Usage: npm run eval:local -- <book.pdf> [truth.json] [overlay-out.json]');

const create: CreateCanvas = (width, height) => createCanvas(width, height) as never;
const started = Date.now();
const document = await getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), verbosity: 0 }).promise;

const pageWords: Word[][] = [];
const boards: FoundBoard[] = [];
for (let i = 0; i < document.numPages; i++) {
  const page = await readPage(document as never, i, create);
  pageWords.push(page.words);
  boards.push(...page.boards);
}
const readMs = Date.now() - started;

const raw: RawBook = { bookHash: 'local-eval', pageWords, boards };
const analysisStarted = Date.now();
const { overlay, calibration } = analyzeBook(raw);
const analysisMs = Date.now() - analysisStarted;

function report(o: BookOverlay) {
  const reasons: Record<string, number> = {};
  for (const item of o.review) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  const low = o.moves.filter((m) => m.confidence === 'low').length;
  console.log({
    pages: document.numPages,
    readSeconds: Math.round(readMs / 1000),
    analysisSeconds: Math.round(analysisMs / 1000),
    pieceShapesFound: calibration.clusters.length,
    pieceLabels: calibration.clusters.map((c) => c.label).join(''),
    diagrams: o.diagrams.length,
    validDiagrams: o.diagrams.filter((d) => !d.issues.length).length,
    labelledDiagrams: o.diagrams.filter((d) => d.label).length,
    withSideToMove: o.diagrams.filter((d) => d.sideToMove).length,
    moves: o.moves.length,
    mainLineMoves: o.moves.filter((m) => m.isMainLine).length,
    sideLineMoves: o.moves.filter((m) => !m.isMainLine).length,
    lowConfidenceMoves: low,
    unresolvedTokens: reasons['unresolved-move'] ?? 0,
    reviewItems: o.review.length,
  });
}
report(overlay);

if (truthPath) {
  console.log(scoreLines(overlay, JSON.parse(fs.readFileSync(truthPath, 'utf8')) as Record<string, string[]>));
}

if (overlayPath) fs.writeFileSync(overlayPath, JSON.stringify(overlay));
