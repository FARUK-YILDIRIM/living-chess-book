import type { GrayImage, PixelBox } from './gray';

const DARK = 110;
const MIN_BOARD_FRACTION = 0.1;
const MAX_BOARD_FRACTION = 0.9;
const MIN_LINE_FILL = 0.85;
const SQUARE_TOLERANCE = 0.08;
const FRAME_FILL = 0.6;
const MIN_INNER_CONTRAST = 0.05;
const MAX_INNER_INK = 0.75;

interface Segment {
  y: number;
  x0: number;
  x1: number;
}

/** Long horizontal dark runs on the page, merged across neighbouring rows. */
function findHorizontalLines(image: GrayImage, minLength: number): Segment[] {
  const { width, height, data } = image;
  const raw: Segment[] = [];

  for (let y = 0; y < height; y++) {
    let runStart = -1;
    let gap = 0;
    let lastDark = -1;
    for (let x = 0; x <= width; x++) {
      const dark = x < width && data[y * width + x]! < DARK;
      if (dark) {
        if (runStart < 0) runStart = x;
        lastDark = x;
        gap = 0;
      } else if (runStart >= 0 && ++gap > 3) {
        if (lastDark - runStart + 1 >= minLength) raw.push({ y, x0: runStart, x1: lastDark + 1 });
        runStart = -1;
        gap = 0;
      }
    }
  }

  const merged: Segment[] = [];
  for (const line of raw) {
    const same = merged.find(
      (m) => line.y - m.y <= 6 && Math.abs(line.x0 - m.x0) <= 6 && Math.abs(line.x1 - m.x1) <= 6,
    );
    if (same) {
      same.x0 = Math.min(same.x0, line.x0);
      same.x1 = Math.max(same.x1, line.x1);
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

function columnFill(image: GrayImage, x: number, y0: number, y1: number): number {
  let dark = 0;
  for (let y = y0; y < y1; y++) if (image.data[y * image.width + x]! < DARK) dark++;
  return dark / Math.max(1, y1 - y0);
}

function hasVerticalEdge(image: GrayImage, x: number, y0: number, y1: number): boolean {
  for (let dx = -4; dx <= 4; dx++) {
    const col = x + dx;
    if (col >= 0 && col < image.width && columnFill(image, col, y0, y1) >= FRAME_FILL) return true;
  }
  return false;
}

/** A real board has ink in it, but is not solid black. */
function looksLikeBoard(image: GrayImage, box: PixelBox): boolean {
  let dark = 0;
  let total = 0;
  const inset = Math.round((box.x1 - box.x0) * 0.04);
  for (let y = box.y0 + inset; y < box.y1 - inset; y += 2) {
    for (let x = box.x0 + inset; x < box.x1 - inset; x += 2) {
      if (image.data[y * image.width + x]! < DARK) dark++;
      total++;
    }
  }
  const share = dark / Math.max(1, total);
  return share >= MIN_INNER_CONTRAST && share <= MAX_INNER_INK;
}

/**
 * Finds printed chess diagrams on a rendered page by their square frame, without
 * needing any knowledge of how the PDF stores its images.
 */
export function detectBoards(image: GrayImage): PixelBox[] {
  const shortSide = Math.min(image.width, image.height);
  const minSize = Math.round(shortSide * MIN_BOARD_FRACTION);
  const maxSize = Math.round(shortSide * MAX_BOARD_FRACTION);
  const lines = findHorizontalLines(image, Math.round(minSize * MIN_LINE_FILL));

  const boards: PixelBox[] = [];
  for (let i = 0; i < lines.length; i++) {
    const top = lines[i]!;
    if (boards.some((b) => top.y >= b.y0 && top.y <= b.y1 && top.x0 < b.x1 && top.x1 > b.x0)) continue;
    const size = top.x1 - top.x0;
    if (size < minSize || size > maxSize) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const bottom = lines[j]!;
      const height = bottom.y - top.y + 1;
      if (height > size * (1 + SQUARE_TOLERANCE)) break;
      if (height < size * (1 - SQUARE_TOLERANCE)) continue;
      if (Math.abs(bottom.x0 - top.x0) > size * 0.03 || Math.abs(bottom.x1 - top.x1) > size * 0.03) continue;

      const box: PixelBox = { x0: top.x0, y0: top.y, x1: top.x1, y1: bottom.y + 1 };
      if (
        hasVerticalEdge(image, box.x0, box.y0, box.y1) &&
        hasVerticalEdge(image, box.x1 - 1, box.y0, box.y1) &&
        looksLikeBoard(image, box)
      ) {
        boards.push(box);
        break;
      }
    }
  }
  return boards;
}
