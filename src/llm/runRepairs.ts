import { applyRepair, checkReply, parseLineReply, type CheckedReply, type RepairJob } from '../core/repair';
import type { BookOverlay } from '../core/types';
import { PARALLEL_REQUESTS } from './estimate';
import { linePrompt, retryPrompt, SYSTEM_PROMPT } from './prompt';
import { ProviderError, type LineReplyText, type ReadLines } from './providers';

const RATE_LIMIT_WAITS_MS = [5_000, 20_000];

export interface RepairTally {
  done: number;
  total: number;
  replaced: number;
  /** Stretches where nothing usable came back, or the old line was kept. */
  unchanged: number;
  /** Their ids, because reading them again would likely cost money for the same result. */
  unchangedIds: string[];
  failed: number;
  moves: number;
  confirmed: number;
  flagged: number;
  inputTokens: number;
  outputTokens: number;
  /** Set when the provider failed in a way that stopped the run. */
  stoppedBecause: string | null;
  /** The most recent failure that did not stop the run. */
  lastProblem: string | null;
}

export interface RepairRun {
  jobs: readonly RepairJob[];
  /** The book as it is now, since a reader can keep working during a run. */
  getOverlay: () => BookOverlay;
  read: ReadLines;
  /** The images of a stretch of text, PNG encoded in base64. */
  renderJob: (job: RepairJob) => Promise<string[]>;
  onProgress: (tally: RepairTally, overlay: BookOverlay) => void;
  signal?: AbortSignal;
  /** For tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const playedCount = (reply: CheckedReply) => reply.lines.reduce((sum, line) => sum + line.played.length, 0);

/**
 * Reads stretches of a book with a model. Each result is applied as it arrives, so that
 * a cancelled or failed run keeps what it already paid for.
 */
export async function runRepairs({ jobs, getOverlay, read, renderJob, onProgress, signal, sleep = wait }: RepairRun): Promise<RepairTally> {
  const tally: RepairTally = {
    done: 0,
    total: jobs.length,
    replaced: 0,
    unchanged: 0,
    unchangedIds: [],
    failed: 0,
    moves: 0,
    confirmed: 0,
    flagged: 0,
    inputTokens: 0,
    outputTokens: 0,
    stoppedBecause: null,
    lastProblem: null,
  };
  let next = 0;

  const count = (usage: LineReplyText['usage']) => {
    tally.inputTokens += usage?.input ?? 0;
    tally.outputTokens += usage?.output ?? 0;
  };

  const ask = async (prompt: string, images: string[]) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await read({ system: SYSTEM_PROMPT, prompt, images, signal });
        count(reply.usage);
        return parseLineReply(reply.text);
      } catch (cause) {
        if (!(cause instanceof ProviderError)) throw cause;
        count(cause.usage);
        // A limit costs nothing, and passes. Any other failure is reported.
        if (cause.kind !== 'rate-limit' || attempt >= RATE_LIMIT_WAITS_MS.length) throw cause;
        await sleep(RATE_LIMIT_WAITS_MS[attempt]!, signal);
        signal?.throwIfAborted();
      }
    }
  };

  const readJob = async (job: RepairJob): Promise<CheckedReply> => {
    const images = await renderJob(job);
    const lines = await ask(linePrompt(job), images);
    const checked = checkReply(job, lines);
    if (!checked.illegal) return checked;

    const moves = lines[checked.illegal.lineIndex]!.moves;
    try {
      const again = checkReply(job, await ask(retryPrompt(job, checked.illegal, moves), images));
      return playedCount(again) >= playedCount(checked) ? again : checked;
    } catch (cause) {
      // The first reading is paid for and still useful, unless everything has stopped.
      if (signal?.aborted || (cause instanceof ProviderError && (cause.kind === 'auth' || cause.kind === 'plan-limit'))) throw cause;
      return checked;
    }
  };

  const worker = async () => {
    while (next < jobs.length && !tally.stoppedBecause && !signal?.aborted) {
      const job = jobs[next++]!;
      let current = getOverlay();
      try {
        const checked = await readJob(job);
        if (signal?.aborted) return;
        const result = applyRepair(getOverlay(), job, checked);
        current = result.overlay;
        if (result.outcome === 'replaced') {
          tally.replaced++;
        } else {
          tally.unchanged++;
          tally.unchangedIds.push(job.id);
        }
        tally.moves += result.moves;
        tally.confirmed += result.confirmed;
        tally.flagged += result.flagged;
      } catch (cause) {
        if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        current = getOverlay();
        tally.failed++;
        tally.lastProblem = cause instanceof Error ? cause.message : 'Something went wrong';
        if (cause instanceof ProviderError && (cause.kind === 'auth' || cause.kind === 'plan-limit')) tally.stoppedBecause = cause.message;
      }
      tally.done++;
      onProgress({ ...tally, unchangedIds: tally.unchangedIds.slice() }, current);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL_REQUESTS, jobs.length) }, worker));
  return tally;
}
