import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * An original sample book, used for tests and demos. Its text, positions and lines were
 * written for this project, and nothing comes from a published work.
 */
export const SAMPLE_DIAGRAMS = [
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R',
  '6k1/5ppp/8/8/8/8/5PPP/3R2K1',
  'q5k1/1n3p2/2b5/8/8/3B1N2/PPQ5/R4K1R',
];

const ROLES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

async function loadPieces(): Promise<Map<string, Image>> {
  const css = fs.readFileSync('node_modules/chessground/assets/chessground.cburnett.css', 'utf8');
  const pieces = new Map<string, Image>();
  for (const [letter, role] of Object.entries(ROLES)) {
    for (const color of ['white', 'black']) {
      const rule = new RegExp(`\\.cg-wrap piece\\.${role}\\.${color}\\s*\\{\\s*background-image:\\s*url\\('([^']+)'\\)`);
      const match = css.match(rule);
      if (!match) throw new Error(`No image for ${color} ${role}`);
      pieces.set(color === 'white' ? letter.toUpperCase() : letter, await loadImage(match[1]!));
    }
  }
  return pieces;
}

function renderDiagram(placement: string, pieces: Map<string, Image>): Buffer {
  const square = 60;
  const frame = 6;
  const size = square * 8 + frame * 2;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');

  context.fillStyle = '#000';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#fff';
  context.fillRect(frame, frame, square * 8, square * 8);

  placement.split('/').forEach((rank, r) => {
    let file = 0;
    for (const char of rank) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i++) drawSquare(r, file++);
      } else {
        drawSquare(r, file);
        context.drawImage(pieces.get(char)!, frame + file * square, frame + r * square, square, square);
        file++;
      }
    }
  });

  function drawSquare(rank: number, file: number): void {
    if ((rank + file) % 2 === 0) return;
    const left = frame + file * square;
    const top = frame + rank * square;
    context.save();
    context.beginPath();
    context.rect(left, top, square, square);
    context.clip();
    context.strokeStyle = '#333';
    context.lineWidth = 2;
    for (let offset = -square; offset < square; offset += 7) {
      context.beginPath();
      context.moveTo(left + offset, top + square);
      context.lineTo(left + offset + square, top);
      context.stroke();
    }
    context.restore();
  }

  return canvas.toBuffer('image/png');
}

export async function makeBook(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pieces = await loadPieces();

  const write = (page: PDFPage, text: string, y: number, using: PDFFont = font, size = 11) =>
    page.drawText(text, { x: 40, y, size, font: using });

  const addDiagram = async (page: PDFPage, index: number, top: number, caption: string) => {
    const size = 175;
    page.drawText(`Diagram ${index + 1}`, { x: 165, y: top, size: 11, font: bold });
    const image = await pdf.embedPng(renderDiagram(SAMPLE_DIAGRAMS[index]!, pieces));
    page.drawImage(image, { x: 110, y: top - 15 - size, width: size, height: size });
    page.drawText(caption, { x: 160, y: top - 30 - size, size: 11, font });
  };

  const first = pdf.addPage([432, 648]);
  write(first, 'Opening notes', 600, bold, 14);
  write(first, '1.e4 e5 2.Nf3 Nc6 3.Bc4 is a calm start.', 570);
  await addDiagram(first, 0, 530, 'White to move.');
  write(first, '1.Ng5 O-O 2.O-O h6 leaves the knight short of squares.', 285);

  const second = pdf.addPage([432, 648]);
  await addDiagram(second, 1, 600, 'White to move.');
  write(second, '1.Rd8# is mate on the back rank.', 365);

  const third = pdf.addPage([432, 648]);
  await addDiagram(third, 2, 600, 'White to move.');
  write(third, '1.Qxc6 Nd6 2.Bc4 keeps every piece protected.', 365);

  return pdf.save();
}
