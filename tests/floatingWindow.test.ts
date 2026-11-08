import { describe, expect, it } from 'vitest';
import { keepInside } from '../src/core/floatingWindow';

const bounds = { left: 0, top: 50, right: 1000, bottom: 800 };
const box = { left: 500, top: 300, right: 900, bottom: 700 };
const still = { x: 0, y: 0 };

describe('keepInside', () => {
  it('goes where it is taken, while it fits', () => {
    expect(keepInside({ x: -200, y: 40 }, still, box, bounds)).toEqual({ x: -200, y: 40 });
  });

  it('stops at each edge', () => {
    expect(keepInside({ x: -900, y: -900 }, still, box, bounds)).toEqual({ x: -500, y: -250 });
    expect(keepInside({ x: 900, y: 900 }, still, box, bounds)).toEqual({ x: 100, y: 100 });
  });

  it('counts from where the window is now', () => {
    const moved = { left: 300, top: 300, right: 700, bottom: 700 };
    expect(keepInside({ x: -900, y: 0 }, { x: -200, y: 0 }, moved, bounds).x).toBe(-500);
  });

  it('brings a window back when its room has shrunk', () => {
    const moved = { left: 100, top: 300, right: 500, bottom: 700 };
    expect(keepInside({ x: -400, y: 0 }, { x: -400, y: 0 }, moved, { ...bounds, left: 300 }).x).toBe(-200);
  });

  it('keeps the top left corner of a window too big for its room', () => {
    const big = { left: 100, top: 100, right: 1400, bottom: 1200 };
    expect(keepInside({ x: 50, y: 50 }, still, big, bounds)).toEqual({ x: -100, y: -50 });
  });
});
