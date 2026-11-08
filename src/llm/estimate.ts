import type { RepairJob } from '../core/repair';

/**
 * US dollars per million tokens: Anthropic's list as of 2026-10-06, and DeepSeek's as of 2026-11-05
 * at its peak hours, when it costs twice as much as at other times, and with no cached input.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'deepseek-flash': { input: 0.3, output: 1.2 },
  'deepseek-v4-pro': { input: 1.32, output: 3.96 },
};

const POINTS_PER_INCH = 72;
/** Pixels per inch for images sent to a model: clear enough to tell figures apart. */
export const CROP_DPI = 200;
export const MAX_CROP_SIDE = 1500;
/** Anthropic's rule of thumb for an image. Other providers count differently. */
const PIXELS_PER_TOKEN = 750;
const PROMPT_TOKENS = 450;
/** Thinking and the reply together, on a line of ordinary length. */
const OUTPUT_TOKENS_PER_JOB = 1000;
/** Models that think at length before replying, and bill for it. Measured on 2026-11-05. */
const OUTPUT_TOKENS_PER_JOB_BY_MODEL: Readonly<Record<string, number>> = { 'deepseek-flash': 7200 };
/** Illegal moves are asked about once more. */
const RETRY_SHARE = 1.15;

export interface Estimate {
  inputTokens: number;
  outputTokens: number;
  /** Null when this app has no price for the model. */
  dollars: number | null;
}

export function cropPixels(widthPoints: number, heightPoints: number): { width: number; height: number; scale: number } {
  const scale = Math.min(CROP_DPI / POINTS_PER_INCH, MAX_CROP_SIDE / Math.max(widthPoints, heightPoints, 1));
  return { width: Math.ceil(widthPoints * scale), height: Math.ceil(heightPoints * scale), scale };
}

export function priceOf(model: string, input: number, output: number): number | null {
  const price = PRICES[model];
  return price ? (input * price.input + output * price.output) / 1_000_000 : null;
}

export function estimateJobs(jobs: readonly RepairJob[], model: string): Estimate {
  let input = 0;
  for (const job of jobs) {
    input += PROMPT_TOKENS;
    for (const { box } of job.regions) {
      const { width, height } = cropPixels(box.x1 - box.x0, box.y1 - box.y0);
      input += (width * height) / PIXELS_PER_TOKEN;
    }
  }
  const inputTokens = Math.round(input * RETRY_SHARE);
  const outputTokens = Math.round(jobs.length * (OUTPUT_TOKENS_PER_JOB_BY_MODEL[model] ?? OUTPUT_TOKENS_PER_JOB) * RETRY_SHARE);
  return { inputTokens, outputTokens, dollars: priceOf(model, inputTokens, outputTokens) };
}

/** Stretches read at once: enough to finish soon, few enough to stay under most providers' limits. */
export const PARALLEL_REQUESTS = 3;
/** Seconds a model takes over one stretch. DeepSeek was measured on 2026-11-05. Others are a guess. */
const SECONDS_PER_JOB: Readonly<Record<string, number>> = { 'deepseek-flash': 50, 'deepseek-v4-pro': 60 };
const DEFAULT_SECONDS_PER_JOB = 20;

/** Minutes for a run, rounded up, with stretches read a few at a time. */
export function estimateMinutes(jobCount: number, model: string, parallel = PARALLEL_REQUESTS): number {
  if (jobCount <= 0) return 0;
  const seconds = Math.ceil(jobCount / parallel) * (SECONDS_PER_JOB[model] ?? DEFAULT_SECONDS_PER_JOB);
  return Math.max(1, Math.ceil(seconds / 60));
}
