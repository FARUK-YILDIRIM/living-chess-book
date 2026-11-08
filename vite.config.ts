import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { chatGptHelperPlugin } from './server/chatgpt/vitePlugin.ts';

export default defineConfig({
  plugins: [react(), chatGptHelperPlugin()],
  resolve: {
    // pdf.js's modern build calls what only the newest browsers have, such as Math.sumPrecise, and
    // fails to open a PDF elsewhere. Its legacy build carries what it needs.
    // why: W-284B38
    alias: [{ find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }],
  },
  clearScreen: false,
  server: { port: 5183, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
