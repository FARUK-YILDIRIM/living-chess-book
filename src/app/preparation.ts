export type PreparationStage = 'opening' | 'reading' | 'diagrams' | 'moves';

/** How far one stage of preparing a book has come, from 0 to 1. */
export interface Progress {
  stage: PreparationStage;
  share: number;
}

export type TimeLeft =
  | { kind: 'calculating' }
  | { kind: 'almost' }
  | { kind: 'under-a-minute' }
  | { kind: 'minutes'; minutes: number };

export interface PreparationView {
  stage: PreparationStage;
  percent: number;
  timeLeft: TimeLeft;
}

interface Sample {
  at: number;
  share: number;
}

export interface PreparationState {
  percent: number;
  /** Recent points in the moves stage, the first of which is where the stage began. */
  samples: readonly Sample[];
  remainingMs: number | null;
}

export const NEW_PREPARATION: PreparationState = { percent: 0, samples: [], remainingMs: null };

/** Where each stage starts and ends in the whole. Finding moves takes nearly all of the time. */
const STAGE_RANGES: Record<PreparationStage, readonly [number, number]> = {
  opening: [0, 0],
  reading: [0, 5],
  diagrams: [5, 10],
  moves: [10, 100],
};

/**
 * The first moves go quickly and the speed keeps changing, so an early estimate is badly wrong.
 * On a real book the estimate at 12 seconds said under a minute, with nearly 2.5 minutes to go.
 */
const MIN_MS_BEFORE_ESTIMATE = 30_000;
const MIN_SHARE_BEFORE_ESTIMATE = 0.2;
const RECENT_WINDOW_MS = 30_000;
const ALMOST_DONE_SHARE = 0.98;
const MINUTE_MS = 60_000;

const clamp = (share: number) => Math.min(1, Math.max(0, share));

/** One percent for the whole job, which only goes up and stays under 100 until it is done. */
function percentOf({ stage, share }: Progress): number {
  const [from, to] = STAGE_RANGES[stage];
  return from + (to - from) * clamp(share);
}

function timeLeftOf(state: PreparationState, stage: PreparationStage, share: number): TimeLeft {
  if (stage === 'moves' && clamp(share) >= ALMOST_DONE_SHARE) return { kind: 'almost' };
  if (state.remainingMs === null) return { kind: 'calculating' };
  if (state.remainingMs < MINUTE_MS) return { kind: 'under-a-minute' };
  return { kind: 'minutes', minutes: Math.ceil(state.remainingMs / MINUTE_MS) };
}

/** Takes in the latest progress, and says what to show. */
export function advancePreparation(
  previous: PreparationState,
  progress: Progress,
  now: number,
): { state: PreparationState; view: PreparationView } {
  const percent = Math.max(previous.percent, Math.min(99, Math.floor(percentOf(progress))));
  const share = clamp(progress.share);
  let { samples, remainingMs } = previous;

  if (progress.stage === 'moves') {
    const start = samples[0] ?? { at: now, share };
    const recent = samples.slice(1).filter((sample) => now - sample.at <= RECENT_WINDOW_MS);
    samples = [start, ...recent, { at: now, share }];

    const elapsed = now - start.at;
    const done = share - start.share;
    if (elapsed >= MIN_MS_BEFORE_ESTIMATE && share >= MIN_SHARE_BEFORE_ESTIMATE && done > 0) {
      const left = 1 - share;
      const overall = (elapsed * left) / done;
      // The whole run says what is typical, and the last while says what is happening now.
      const anchor = samples[1] ?? start;
      const recentDone = share - anchor.share;
      const recentRate = recentDone > 0 ? ((now - anchor.at) * left) / recentDone : overall;
      remainingMs = (overall + recentRate) / 2;
    }
  }

  const state: PreparationState = { percent, samples, remainingMs };
  return { state, view: { stage: progress.stage, percent, timeLeft: timeLeftOf(state, progress.stage, share) } };
}
