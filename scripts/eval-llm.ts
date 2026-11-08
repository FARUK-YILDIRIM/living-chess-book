/**
 * Measures AI reading on a book you own, kept outside the repository, with no API calls in
 * this script: it writes the images and prompts, and something else writes the replies.
 *
 *   npm run eval:llm -- prepare <book.pdf> <overlay.json> <truth.json> <dir> [all]
 *   npm run eval:llm -- score   <book.pdf> <overlay.json> <truth.json> <dir> [all]
 *
 * `prepare` writes <dir>/<job>.png (one per image), <dir>/<job>.txt and <dir>/jobs.json.
 * `score` reads <dir>/replies/<job>.json, and <dir>/replies/<job>.retry.json if one is asked
 * for, and prints aggregate numbers only (see ADR-0008). Keep <dir> out of the repository.
 */
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { overlayFromJson } from '../src/core/overlay';
import { applyRepair, checkReply, findRepairJobs, parseLineReply, type RepairJob } from '../src/core/repair';
import type { BookOverlay } from '../src/core/types';
import { estimateJobs } from '../src/llm/estimate';
import { linePrompt, retryPrompt, SYSTEM_PROMPT } from '../src/llm/prompt';
import { renderRegion, type CreateCropCanvas } from '../src/pdf/cropRegion';
import { readPageWords } from '../src/pdf/pageReader';
import { scoreLines } from './score-lines';

const [mode, pdfPath, overlayPath, truthPath, dir, scopeArg] = process.argv.slice(2);
if ((mode !== 'prepare' && mode !== 'score') || !pdfPath || !overlayPath || !truthPath || !dir) {
  throw new Error('Usage: npm run eval:llm -- prepare|score <book.pdf> <overlay.json> <truth.json> <dir> [all]');
}

const document = await getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), verbosity: 0 }).promise;
const overlay: BookOverlay = overlayFromJson(fs.readFileSync(overlayPath, 'utf8'));
const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8')) as Record<string, string[]>;

const pages = [];
for (let i = 0; i < document.numPages; i++) pages.push(await readPageWords(document as never, i));

const scope = scopeArg === 'all' ? 'all' : 'flagged';
const { jobs: everyJob, tooLong } = findRepairJobs(overlay, pages, scope);
const labels = new Set(Object.keys(truth));
const jobs = everyJob.filter((job) => job.label && labels.has(job.label));

const replyOf = (job: RepairJob, suffix = '') => {
  const file = path.join(dir, 'replies', `${job.id}${suffix}.json`);
  return fs.existsSync(file) ? parseLineReply(fs.readFileSync(file, 'utf8')) : null;
};

if (mode === 'prepare') {
  fs.mkdirSync(path.join(dir, 'replies'), { recursive: true });
  const create: CreateCropCanvas = (width, height) => createCanvas(width, height) as never;
  const list = [];
  for (const job of jobs) {
    const images: string[] = [];
    for (const [index, region] of job.regions.entries()) {
      const file = path.join(dir, `${job.id}-${index}.png`);
      fs.writeFileSync(file, Buffer.from(await renderRegion(document as never, region, create), 'base64'));
      images.push(file);
    }
    fs.writeFileSync(path.join(dir, `${job.id}.txt`), linePrompt(job));
    list.push({ id: job.id, images, promptFile: path.join(dir, `${job.id}.txt`) });
  }
  fs.writeFileSync(path.join(dir, 'system.txt'), SYSTEM_PROMPT);
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(list, null, 1));
  console.log({
    scope,
    jobsInWholeBook: everyJob.length,
    leftOutAsTooLong: tooLong,
    wholeBookEstimate: { opus: estimateJobs(everyJob, 'claude-opus-5-5'), sonnet: estimateJobs(everyJob, 'claude-sonnet-5-5'), haiku: estimateJobs(everyJob, 'claude-haiku-5-5') },
    jobsForTheseLines: jobs.length,
  });
} else {
  let current = overlay;
  const outcomes: Record<string, number> = {};
  let confirmed = 0;
  let flaggedMoves = 0;
  const retries: { id: string; prompt: string }[] = [];
  for (const job of jobs) {
    const lines = replyOf(job);
    if (!lines) {
      outcomes['no reply'] = (outcomes['no reply'] ?? 0) + 1;
      continue;
    }
    let checked = checkReply(job, lines);
    if (checked.illegal) {
      const again = replyOf(job, '.retry');
      if (again) {
        const recheck = checkReply(job, again);
        const played = (r: typeof checked) => r.lines.reduce((sum, line) => sum + line.played.length, 0);
        if (played(recheck) >= played(checked)) checked = recheck;
      } else {
        retries.push({ id: job.id, prompt: retryPrompt(job, checked.illegal, lines[checked.illegal.lineIndex]!.moves) });
      }
    }
    const result = applyRepair(current, job, checked);
    current = result.overlay;
    confirmed += result.confirmed;
    flaggedMoves += result.flagged;
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  }

  // The prompts for a second look go in a file, so that their moves are not printed here.
  fs.writeFileSync(path.join(dir, 'retries.json'), JSON.stringify(retries, null, 1));
  console.log({ jobs: jobs.length, outcomes, retriesWaiting: retries.length, confirmedByOcrWords: confirmed, notFoundInOcrWords: flaggedMoves });
  console.log('before', scoreLines(overlay, truth));
  console.log('after', scoreLines(current, truth));
}
