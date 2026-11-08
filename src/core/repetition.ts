/**
 * Bringing saved positions back at growing intervals, in the plain way of a card box: knowing one
 * moves it to a longer wait, and not knowing it starts it over.
 */
export interface ReviewState {
  /** How far along the waits it has come, from 0. */
  step: number;
  dueAt: number;
  lastAt: number | null;
}

const DAY_MS = 86_400_000;
/** Something just missed comes back soon, since it is the first repeats that make a move stick. */
const SOON_MS = 10 * 60_000;
export const WAIT_DAYS = [1, 3, 7, 16, 35, 90] as const;

/** A newly saved position first comes back tomorrow, when it has had time to fade. */
export function firstReview(now: number): ReviewState {
  return { step: 0, dueAt: now + WAIT_DAYS[0] * DAY_MS, lastAt: null };
}

/** For a position the reader has just missed. */
export function soonReview(now: number): ReviewState {
  return { step: 0, dueAt: now + SOON_MS, lastAt: now };
}

export function nextReview(state: ReviewState, knewIt: boolean, now: number): ReviewState {
  if (!knewIt) return soonReview(now);
  // Knowing it minutes after missing it shows little, so the waits only begin here.
  const wasMissedJustNow = state.lastAt !== null && state.dueAt - state.lastAt <= SOON_MS;
  const step = wasMissedJustNow ? 0 : Math.min(state.step + 1, WAIT_DAYS.length - 1);
  return { step, dueAt: now + WAIT_DAYS[step]! * DAY_MS, lastAt: now };
}

export function isReviewState(value: unknown): value is ReviewState {
  const state = value as Partial<ReviewState> | null;
  return (
    Number.isInteger(state?.step) &&
    state!.step! >= 0 &&
    Number.isFinite(state?.dueAt) &&
    (state?.lastAt === null || Number.isFinite(state?.lastAt))
  );
}

/** Saved positions that are due, the longest overdue first. */
export function dueEntries<T extends { kind: string; createdAt: number; review?: ReviewState }>(entries: readonly T[], now: number): T[] {
  // A position saved before practice existed has no schedule, and counts as if saved with one.
  const dueAt = (entry: T) => (entry.review ?? firstReview(entry.createdAt)).dueAt;
  return entries.filter((entry) => entry.kind === 'position' && dueAt(entry) <= now).sort((a, b) => dueAt(a) - dueAt(b));
}
