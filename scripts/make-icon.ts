/** Draws the placeholder app icon: npx tsx scripts/make-icon.ts */
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';

const size = 512;
const square = size / 4;
const canvas = createCanvas(size, size);
const context = canvas.getContext('2d');

for (let rank = 0; rank < 4; rank++) {
  for (let file = 0; file < 4; file++) {
    context.fillStyle = (rank + file) % 2 ? '#2f6f5e' : '#f4f2ee';
    context.fillRect(file * square, rank * square, square, square);
  }
}

fs.mkdirSync('src-tauri/icons', { recursive: true });
fs.writeFileSync('src-tauri/icons/icon.png', canvas.toBuffer('image/png'));
console.log('Wrote src-tauri/icons/icon.png');
