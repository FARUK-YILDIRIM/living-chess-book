// Copies the decoders and fonts pdf.js loads at run time, so the app works offline.
import fs from 'node:fs';

for (const folder of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  fs.cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
}

// The chess engine, in its single-threaded builds, which need no special server headers: the small
// one by default, and the full one, about 99 MB, for readers who choose it.
fs.mkdirSync('public/engine', { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish-19-single.js', 'stockfish-19-single.wasm']) {
  fs.copyFileSync(`node_modules/stockfish/bin/${file}`, `public/engine/${file}`);
}
fs.copyFileSync('node_modules/stockfish/Copying.txt', 'public/engine/COPYING.txt');
