// Builds the browser extension into dist-extension/, and packs it for a store into release/.
// Run with: npm run build:extension. See ADR-0021.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { extensionManifest, ICON_SIZES } from './extensionManifest.mjs';
import { packageDirOf, thirdPartyNotices } from './thirdPartyNotices.mjs';

// Paths are the repository's, wherever this is run from.
process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const OUT = 'dist-extension';
const RELEASE = 'release';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = extensionManifest(version);

// The same assets as the web build: pdf.js's decoders and fonts, and both Stockfish builds.
await import('./copy-pdf-assets.mjs');
// Every package that goes into the bundle, read off the modules as they are built.
const bundled = new Set();
const collect = {
  name: 'collect-packages',
  transform(_code, id) {
    const dir = packageDirOf(id);
    if (dir) bundled.add(dir);
    return null;
  },
};
await build({ mode: 'extension', logLevel: 'warn', plugins: [collect], worker: { plugins: () => [collect] }, build: { outDir: OUT, emptyOutDir: true } });

// pdf.js runs a PDF's own scripts in this sandbox, which the app never asks it to do.
for (const file of ['quickjs-eval.js', 'quickjs-eval.wasm', 'LICENSE_QUICKJS', 'LICENSE_PDFJS_QUICKJS']) {
  fs.rmSync(path.join(OUT, 'pdfjs', 'wasm', file), { force: true });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.copyFileSync('extension/background.js', path.join(OUT, 'background.js'));
// The app is GPL-3.0-or-later, and its licence goes with every copy.
fs.copyFileSync('LICENSE', path.join(OUT, 'LICENSE'));
// pdf.js's worker and Stockfish are copied as files rather than bundled, and Vite and Rolldown add
// code of their own that is not read from a package, so these are named here.
if (![...bundled].some((dir) => dir.endsWith(`${path.sep}chess.js`))) throw new Error('No packages were seen in the bundle, so the notices would be incomplete.');
const copied = ['pdfjs-dist', 'stockfish', 'vite', 'rolldown'].map((name) => path.resolve('node_modules', name));
fs.writeFileSync(path.join(OUT, 'THIRD_PARTY_NOTICES.txt'), thirdPartyNotices([...bundled, ...copied]));

const source = await loadImage('src-tauri/icons/icon.png');
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
for (const size of ICON_SIZES) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(source, 0, 0, size, size);
  fs.writeFileSync(path.join(OUT, 'icons', `icon-${size}.png`), canvas.toBuffer('image/png'));
}

// Everything in public/ is copied, so a book left there by mistake must stop the build. See ADR-0008.
const ALLOWED = new Set(['assets', 'engine', 'icons', 'pdfjs', 'background.js', 'index.html', 'manifest.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'sample-book.pdf']);
const unexpected = fs.readdirSync(OUT).filter((name) => !ALLOWED.has(name) && name !== '.DS_Store');
const books = fs.readdirSync(OUT, { recursive: true }).filter((name) => String(name).toLowerCase().endsWith('.pdf') && name !== 'sample-book.pdf');
if (unexpected.length || books.length) {
  console.error(`Not packed. These should not be in the extension: ${[...unexpected, ...books].join(', ')}`);
  process.exit(1);
}

// A store takes a zip with the manifest at its root.
fs.mkdirSync(RELEASE, { recursive: true });
const zip = path.resolve(RELEASE, `living-chess-book-${version}.zip`);
fs.rmSync(zip, { force: true });
try {
  execFileSync('zip', ['-qr', '-X', zip, '.', '-x', '*.DS_Store'], { cwd: OUT });
  console.log(`Built ${OUT}/ and ${path.relative('.', zip)}`);
} catch (cause) {
  if (cause?.code !== 'ENOENT') throw cause;
  console.log(`Built ${OUT}/. No zip tool was found, so pack that folder by hand for a store.`);
}
