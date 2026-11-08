import { describe, expect, it } from 'vitest';
import { dueEntries, firstReview, isReviewState, nextReview, soonReview, WAIT_DAYS } from '../src/core/repetition';

const DAY = 86_400_000;

describe('waits', () => {
  it('first comes back after a day', () => {
    expect(firstReview(1000)).toEqual({ step: 0, dueAt: 1000 + DAY, lastAt: null });
  });

  it('waits longer each time it is known', () => {
    let state = firstReview(0);
    const waits: number[] = [];
    for (let i = 0; i < 3; i++) {
      state = nextReview(state, true, 0);
      waits.push(state.dueAt / DAY);
    }
    expect(waits).toEqual([3, 7, 16]);
  });

  it('stops growing at the longest wait', () => {
    let state = firstReview(0);
    for (let i = 0; i < 20; i++) state = nextReview(state, true, 0);
    expect(state.step).toBe(WAIT_DAYS.length - 1);
    expect(state.dueAt).toBe(90 * DAY);
  });

  it('comes back soon, and starts over, when it is not known', () => {
    expect(nextReview({ step: 4, dueAt: 0, lastAt: 0 }, false, 500)).toEqual({ step: 0, dueAt: 500 + 600_000, lastAt: 500 });
  });

  it('comes back soon after being missed, and then after a day', () => {
    const missed = soonReview(1000);
    expect(missed.dueAt).toBe(1000 + 600_000);
    expect(nextReview(missed, true, 2000)).toEqual({ step: 0, dueAt: 2000 + DAY, lastAt: 2000 });
  });
});

describe('dueEntries', () => {
  const entry = (id: string, dueAt: number | null, kind = 'position', createdAt = 0) => ({
    id,
    kind,
    createdAt,
    ...(dueAt === null ? {} : { review: { step: 0, dueAt, lastAt: null } }),
  });

  it('takes what is due, the longest overdue first', () => {
    const due = dueEntries([entry('later', 50), entry('sooner', 10), entry('future', 500)], 100);
    expect(due.map((e) => e.id)).toEqual(['sooner', 'later']);
  });

  it('leaves out notes', () => {
    expect(dueEntries([entry('note', 1, 'note')], 100)).toEqual([]);
  });

  it('counts a position with no schedule as if saved with one', () => {
    expect(dueEntries([entry('old', null, 'position', 0)], DAY - 1)).toEqual([]);
    expect(dueEntries([entry('old', null, 'position', 0)], DAY + 1).map((e) => e.id)).toEqual(['old']);
  });
});

describe('isReviewState', () => {
  it('takes a real state', () => {
    expect(isReviewState({ step: 1, dueAt: 5, lastAt: null })).toBe(true);
    expect(isReviewState({ step: 1, dueAt: 5, lastAt: 4 })).toBe(true);
  });

  it('turns down anything else', () => {
    expect(isReviewState(null)).toBe(false);
    expect(isReviewState({ step: -1, dueAt: 5, lastAt: null })).toBe(false);
    expect(isReviewState({ step: 1, dueAt: 'soon', lastAt: null })).toBe(false);
    expect(isReviewState({ step: 1, dueAt: 5 })).toBe(false);
  });
});
