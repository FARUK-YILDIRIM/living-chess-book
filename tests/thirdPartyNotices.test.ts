import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageDirOf, thirdPartyNotices } from '../scripts/thirdPartyNotices.mjs';

describe('packageDirOf', () => {
  it('finds a plain and a scoped package', () => {
    expect(packageDirOf('/repo/node_modules/chess.js/dist/esm/chess.js')).toBe(path.join('/repo/node_modules', 'chess.js'));
    expect(packageDirOf('/repo/node_modules/@anthropic-ai/sdk/client.mjs')).toBe(path.join('/repo/node_modules', '@anthropic-ai/sdk'));
  });

  it('takes the innermost copy of a nested package', () => {
    expect(packageDirOf('/repo/node_modules/a/node_modules/b/index.js')).toBe(path.join('/repo/node_modules/a/node_modules', 'b'));
  });

  it('ignores queries, virtual modules and the app itself', () => {
    expect(packageDirOf('\0/repo/node_modules/react/index.js?commonjs-proxy')).toBe(path.join('/repo/node_modules', 'react'));
    expect(packageDirOf('/repo/src/app/App.tsx')).toBeNull();
  });
});

describe('thirdPartyNotices', () => {
  const made: string[] = [];
  afterEach(() => made.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  function fakePackage(info: Record<string, unknown>, files: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notice-'));
    made.push(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(info));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
  }

  it('carries each licence text with its package, in name order', () => {
    const b = fakePackage({ name: 'b', version: '2.0.0', license: 'MIT', repository: 'https://example.org/b' }, { LICENSE: 'Copyright B' });
    const a = fakePackage({ name: 'a', version: '1.0.0', license: 'BSD-2-Clause', repository: { url: 'https://example.org/a' } }, { 'LICENSE.md': 'Copyright A', 'README.md': 'not a licence' });
    const text = thirdPartyNotices([b, a, b]);
    expect(text.indexOf('a 1.0.0')).toBeLessThan(text.indexOf('b 2.0.0'));
    expect(text).toContain('Licence: BSD-2-Clause\nSource: https://example.org/a\n\nCopyright A');
    expect(text).toContain('Copyright B');
    expect(text).not.toContain('not a licence');
    expect(text.match(/b 2\.0\.0/g)).toHaveLength(1);
  });

  it('takes the licence kept for a package that ships none, and stops when none is kept', () => {
    const dir = fakePackage({ name: '@scope/bare', version: '1.0.0', license: 'MIT' });
    const kept = fakePackage({ name: 'kept', version: '0.0.0' }, { '@scope__bare.txt': 'Copyright Bare' });
    expect(thirdPartyNotices([dir], kept)).toContain('Copyright Bare');
    expect(() => thirdPartyNotices([dir], path.join(kept, 'missing'))).toThrow(/has no licence file/);
  });

  it('stops for a package that states no licence', () => {
    const dir = fakePackage({ name: 'unknown', version: '1.0.0' });
    expect(() => thirdPartyNotices([dir])).toThrow(/states no licence/);
  });
});
