/** Writes the original sample book used for demos: npx tsx scripts/make-sample-book.ts */
import fs from 'node:fs';
import { makeBook } from '../tests/helpers/sampleBook';

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/sample-book.pdf', await makeBook());
console.log('Wrote public/sample-book.pdf');
