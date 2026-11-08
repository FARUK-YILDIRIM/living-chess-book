// Draws the Chrome Web Store's small promo tile, 440 × 280, and its store icon, from the app's icon.
// Run with: node scripts/make-store-tile.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const WIDTH = 440;
const HEIGHT = 280;
const canvas = createCanvas(WIDTH, HEIGHT);
const g = canvas.getContext('2d');

// The app's dark background and its accent, so that the tile looks like the app.
g.fillStyle = '#1b1a18';
g.fillRect(0, 0, WIDTH, HEIGHT);
g.fillStyle = '#6fbfa5';
g.fillRect(0, HEIGHT - 6, WIDTH, 6);

const icon = await loadImage('src-tauri/icons/icon.png');
g.drawImage(icon, 32, 70, 120, 120);

g.fillStyle = '#f2efe8';
g.font = 'bold 30px sans-serif';
g.fillText('Living', 172, 112);
g.fillText('Chess Book', 172, 148);
g.fillStyle = '#b7b2a8';
g.font = '16px sans-serif';
g.fillText('Study the chess books you own,', 172, 182);
g.fillText('with a live board and an engine.', 172, 204);

fs.writeFileSync('docs/store/promo-small.png', canvas.toBuffer('image/png'));

// The store asks for 128 × 128, with the artwork in the middle 96 × 96 and the rest transparent.
const storeIcon = createCanvas(128, 128);
storeIcon.getContext('2d').drawImage(icon, 16, 16, 96, 96);
fs.writeFileSync('docs/store/icon-128.png', storeIcon.toBuffer('image/png'));
console.log('Wrote docs/store/promo-small.png and docs/store/icon-128.png');
