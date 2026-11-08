import type { GrayImage } from '../../src/vision/gray';

export function createGray(width: number, height: number, value = 255): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(value) };
}

export function fillRect(
  image: GrayImage,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
): void {
  for (let row = y; row < y + height && row < image.height; row++) {
    for (let col = x; col < x + width && col < image.width; col++) {
      image.data[row * image.width + col] = value;
    }
  }
}

/** Dark squares are hatched with diagonal lines, as in many printed books. */
function hatch(image: GrayImage, x: number, y: number, size: number): void {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if ((row + col) % 5 < 2) image.data[(y + row) * image.width + x + col] = 40;
    }
  }
}

/** A simple original piece shape: filled for black, outlined for white. */
export function drawPiece(
  image: GrayImage,
  x: number,
  y: number,
  size: number,
  label: string,
): void {
  const isWhite = label === label.toUpperCase();
  const unit = size / 10;
  const widths: Record<string, number[]> = {
    p: [0, 0, 3, 5, 5, 3, 3, 6, 7, 0],
    n: [0, 0, 7, 8, 8, 2, 2, 2, 8, 0],
    b: [2, 2, 3, 3, 3, 2, 2, 2, 8, 0],
    r: [0, 6, 6, 4, 4, 4, 4, 6, 7, 0],
    q: [3, 8, 8, 8, 3, 8, 8, 8, 8, 0],
    k: [1, 3, 7, 7, 7, 5, 4, 5, 7, 0],
  };
  const shape = widths[label.toLowerCase()]!;

  // Build the piece as a mask first, so a white piece can get a closed outline.
  const mask = new Set<number>();
  const key = (px: number, py: number) => py * image.width + px;
  shape.forEach((width, row) => {
    if (!width) return;
    const w = Math.round(width * unit);
    const left = Math.round(x + (size - w) / 2);
    const top = Math.round(y + row * unit);
    for (let py = top; py < top + Math.ceil(unit) && py < y + size; py++) {
      for (let px = left; px < left + w; px++) mask.add(key(px, py));
    }
  });
  // Printed outlines are thick relative to the square, so erode by more than a pixel.
  const outline = Math.max(1, Math.round(size / 16));
  const isInner = (index: number) => {
    for (let d = 1; d <= outline; d++) {
      for (const offset of [-d, d, -d * image.width, d * image.width]) {
        if (!mask.has(index + offset)) return false;
      }
    }
    return true;
  };
  for (const index of mask) image.data[index] = isWhite && isInner(index) ? 255 : 10;
}

/** Draws a framed board. `placement` is a FEN placement field, empty by default. */
export function drawBoard(
  image: GrayImage,
  x: number,
  y: number,
  size: number,
  placement = '8/8/8/8/8/8/8/8',
): void {
  const frame = 3;
  fillRect(image, x, y, size, size, 0);
  fillRect(image, x + frame, y + frame, size - frame * 2, size - frame * 2, 255);

  const inner = size - frame * 2;
  const square = Math.floor(inner / 8);
  const ranks = placement.split('/');

  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    const cells: (string | null)[] = [];
    for (const char of ranks[rank]!) {
      if (/\d/.test(char)) for (let i = 0; i < Number(char); i++) cells.push(null);
      else cells.push(char);
    }
    for (file = 0; file < 8; file++) {
      const left = x + frame + file * square;
      const top = y + frame + rank * square;
      if ((rank + file) % 2 === 1) hatch(image, left, top, square);
      const piece = cells[file];
      if (piece) drawPiece(image, left, top, square, piece);
    }
  }
}
