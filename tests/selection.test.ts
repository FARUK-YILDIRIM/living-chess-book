import { describe, expect, it } from 'vitest';
import { boxesFromRects } from '../src/core/selection';

const page = { left: 100, top: 50, right: 500, bottom: 650 };
const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('boxesFromRects', () => {
  it('gives places on the page, whatever its size on screen', () => {
    expect(boxesFromRects([rect(120, 70, 180, 90)], page, 2)).toEqual([{ x0: 10, y0: 10, x1: 40, y1: 20 }]);
  });

  it('joins the pieces of one line', () => {
    const boxes = boxesFromRects([rect(120, 70, 180, 90), rect(181, 71, 240, 91)], page, 1);
    expect(boxes).toEqual([{ x0: 20, y0: 20, x1: 140, y1: 41 }]);
  });

  it('keeps separate lines apart', () => {
    expect(boxesFromRects([rect(120, 70, 180, 90), rect(120, 95, 180, 115)], page, 1)).toHaveLength(2);
  });

  it('keeps apart pieces far along a line', () => {
    expect(boxesFromRects([rect(120, 70, 180, 90), rect(300, 70, 340, 90)], page, 1)).toHaveLength(2);
  });

  it('leaves out empty pieces and anything off the page', () => {
    expect(boxesFromRects([rect(120, 70, 120.5, 90), rect(600, 70, 700, 90)], page, 1)).toEqual([]);
  });

  it('cuts a piece at the edge of the page', () => {
    expect(boxesFromRects([rect(480, 70, 560, 90)], page, 1)).toEqual([{ x0: 380, y0: 20, x1: 400, y1: 40 }]);
  });
});
