/** A grayscale image: 0 is black, 255 is white. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Share of pixels darker than `threshold` inside a box. */
export function inkInBox(image: GrayImage, box: PixelBox, threshold = 110): number {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(image.width, Math.ceil(box.x1));
  const y1 = Math.min(image.height, Math.ceil(box.y1));
  if (x1 <= x0 || y1 <= y0) return 0;

  let dark = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (image.data[y * image.width + x]! < threshold) dark++;
    }
  }
  return dark / ((x1 - x0) * (y1 - y0));
}
