import type { Box } from './types';

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Pieces closer than this share a mark, in page points. */
const JOIN_GAP = 4;

/**
 * Turns what the browser says is selected into boxes on the page, in page points, so that a mark
 * stays in place at any window size. It holds where the words are, and none of the words.
 */
export function boxesFromRects(rects: readonly ScreenRect[], page: ScreenRect, scale: number): Box[] {
  const boxes = rects
    .filter((rect) => rect.right - rect.left > 1 && rect.bottom - rect.top > 1)
    .map((rect) => ({
      x0: (Math.max(rect.left, page.left) - page.left) / scale,
      y0: (Math.max(rect.top, page.top) - page.top) / scale,
      x1: (Math.min(rect.right, page.right) - page.left) / scale,
      y1: (Math.min(rect.bottom, page.bottom) - page.top) / scale,
    }))
    .filter((box) => box.x1 > box.x0 && box.y1 > box.y0)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const joined: Box[] = [];
  for (const box of boxes) {
    const last = joined[joined.length - 1];
    const middle = (box.y0 + box.y1) / 2;
    if (last && middle > last.y0 && middle < last.y1 && box.x0 - last.x1 < JOIN_GAP) {
      last.x1 = Math.max(last.x1, box.x1);
      last.y0 = Math.min(last.y0, box.y0);
      last.y1 = Math.max(last.y1, box.y1);
    } else {
      joined.push({ ...box });
    }
  }
  return joined;
}
