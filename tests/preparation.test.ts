import { describe, expect, it } from 'vitest';
import { advancePreparation, NEW_PREPARATION, type PreparationState, type Progress } from '../src/app/preparation';

/** Plays a series of updates, each given with the time it arrives. */
function play(steps: readonly (Progress & { at: number })[]) {
  let state: PreparationState = NEW_PREPARATION;
  return steps.map(({ at, ...progress }) => {
    const result = advancePreparation(state, progress, at);
    state = result.state;
    return result.view;
  });
}

describe('one percent for the whole job', () => {
  it('runs through every stage without starting over', () => {
    const views = play([
      { stage: 'reading', share: 0, at: 0 },
      { stage: 'reading', share: 1, at: 1 },
      { stage: 'diagrams', share: 0, at: 2 },
      { stage: 'diagrams', share: 1, at: 3 },
      { stage: 'moves', share: 0, at: 4 },
      { stage: 'moves', share: 0.5, at: 5 },
    ]);
    expect(views.map((v) => v.percent)).toEqual([0, 5, 5, 10, 10, 55]);
  });

  it('gives most of the bar to finding moves', () => {
    const [first] = play([{ stage: 'moves', share: 0, at: 0 }]);
    expect(first!.percent).toBe(10);
  });

  it('never goes backwards, whatever arrives', () => {
    const views = play([
      { stage: 'moves', share: 0.5, at: 0 },
      { stage: 'moves', share: 0.2, at: 1 },
      { stage: 'reading', share: 0, at: 2 },
    ]);
    expect(views.map((v) => v.percent)).toEqual([55, 55, 55]);
  });

  it('stays under 100 until the result is in', () => {
    expect(play([{ stage: 'moves', share: 1, at: 0 }])[0]!.percent).toBe(99);
  });

  it('copes with values out of range', () => {
    expect(play([{ stage: 'moves', share: -1, at: 0 }])[0]!.percent).toBe(10);
    expect(play([{ stage: 'moves', share: 9, at: 0 }])[0]!.percent).toBe(99);
  });

  it('shows nothing yet while opening', () => {
    expect(play([{ stage: 'opening', share: 0, at: 0 }])[0]!.percent).toBe(0);
  });

  it('starts further on when reading is skipped', () => {
    expect(play([{ stage: 'diagrams', share: 0, at: 0 }])[0]!.percent).toBe(5);
  });
});

describe('time left', () => {
  const moves = (share: number, at: number): Progress & { at: number } => ({ stage: 'moves', share, at });

  it('says it is still working it out at first', () => {
    const views = play([{ stage: 'reading', share: 0.5, at: 0 }, moves(0, 1000), moves(0.5, 5000), moves(0.5, 20_000)]);
    expect(views.map((v) => v.timeLeft.kind)).toEqual(['calculating', 'calculating', 'calculating', 'calculating']);
  });

  it('waits until enough of the moves are done', () => {
    expect(play([moves(0, 0), moves(0.1, 60_000)])[1]!.timeLeft.kind).toBe('calculating');
  });

  it('gives whole minutes, rounded up', () => {
    const views = play([moves(0, 0), moves(0.25, 60_000)]);
    expect(views[1]!.timeLeft).toEqual({ kind: 'minutes', minutes: 3 });
  });

  it('says under a minute near the end', () => {
    const views = play([moves(0, 0), moves(0.8, 60_000)]);
    expect(views[1]!.timeLeft).toEqual({ kind: 'under-a-minute' });
  });

  it('says almost done at the very end', () => {
    const views = play([moves(0, 0), moves(0.99, 60_000)]);
    expect(views[1]!.timeLeft).toEqual({ kind: 'almost' });
  });

  it('can go up when work slows down, since hiding that would mislead', () => {
    const views = play([moves(0, 0), moves(0.5, 60_000), moves(0.55, 180_000)]);
    expect(views[1]!.timeLeft).toEqual({ kind: 'minutes', minutes: 1 });
    expect(views[2]!.timeLeft.kind).toBe('minutes');
    expect((views[2]!.timeLeft as { minutes: number }).minutes).toBeGreaterThan(1);
  });

  it('counts time from the start of the moves, since earlier stages run at another speed', () => {
    const views = play([{ stage: 'reading', share: 1, at: 0 }, moves(0, 500_000), moves(0.5, 560_000)]);
    expect(views[2]!.timeLeft).toEqual({ kind: 'minutes', minutes: 1 });
  });

  it('is close on the speeds a real book showed', () => {
    // Share of the moves stage against seconds, from a real run that ended at about 160 seconds.
    const run = [[0, 0], [13, 0.22], [33, 0.33], [65, 0.44], [77, 0.56], [104, 0.78], [125, 0.89], [149, 0.98]] as const;
    const views = play(run.map(([at, share]) => moves(share, at * 1000)));
    expect(views[1]!.timeLeft.kind).toBe('calculating');
    expect(views[3]!.timeLeft).toEqual({ kind: 'minutes', minutes: 2 });
  });
});
