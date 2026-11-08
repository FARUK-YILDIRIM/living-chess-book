// Serves dist-extension/ with the extension's own content security policy, to try the built pages
// in any browser before loading them as an extension: npm run preview:extension
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_CSP } from './extensionManifest.mjs';

const ROOT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist-extension');
const PORT = 5184;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.pdf': 'application/pdf', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile', '.txt': 'text/plain' };

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('Nothing to serve yet. Run npm run build:extension first.');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let wanted;
    try {
      wanted = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.join(ROOT, wanted === '/' ? 'index.html' : wanted);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': EXTENSION_CSP });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Extension pages on http://localhost:${PORT}`));
