import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { JobRegion } from '../core/repair';
import { cropPixels } from '../llm/estimate';

/** What is needed from a canvas, which differs between the browser and scripts. */
export interface CropCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): CropContext | null;
  toDataURL(type: 'image/png'): string;
}

interface CropContext {
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: never, dx: number, dy: number): void;
}

export type CreateCropCanvas = (width: number, height: number) => CropCanvas;

/** Draws part of a page, and returns it as a PNG in base64. Nothing else about the page leaves here. */
export async function renderRegion(
  document: PDFDocumentProxy,
  region: JobRegion,
  createCanvas: CreateCropCanvas,
): Promise<string> {
  const page = await document.getPage(region.page + 1);
  try {
    const bounds = page.getViewport({ scale: 1 });
    const x0 = Math.max(0, region.box.x0);
    const y0 = Math.max(0, region.box.y0);
    const x1 = Math.min(bounds.width, region.box.x1);
    const y1 = Math.min(bounds.height, region.box.y1);
    // Sending the wrong picture would cost money and could misplace a whole line.
    if (x1 <= x0 || y1 <= y0) throw new Error('This part of the page could not be drawn.');
    const { width, height, scale } = cropPixels(x1 - x0, y1 - y0);

    const viewport = page.getViewport({ scale, offsetX: -x0 * scale, offsetY: -y0 * scale });
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas for rendering');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    await page.render({
      // The display intent waits for animation frames, which stop while the window is hidden,
      // and work that takes minutes must not stall because a reader looked away.
      intent: 'print',
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  } finally {
    page.cleanup();
  }
}
