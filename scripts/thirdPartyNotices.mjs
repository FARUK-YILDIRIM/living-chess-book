// The licence notices of the packages a build carries. Permissive licences such as chess.js's
// BSD-2-Clause and pdf.js's Apache-2.0 ask that their notices go with every copy. See ADR-0007.
import fs from 'node:fs';
import path from 'node:path';

const LICENCE_FILE = /^(licen[cs]e|copying|notice)/i;
const NODE_MODULES = /[\\/]node_modules[\\/]/g;

/**
 * The folder of the package a module is in, such as `…/node_modules/@anthropic-ai/sdk`, or null.
 * The innermost node_modules counts, so that a nested copy of a package is told from the top one.
 */
export function packageDirOf(modulePath) {
  const file = modulePath.replace(/^\0/, '').split('?')[0];
  const last = [...file.matchAll(NODE_MODULES)].pop();
  if (!last) return null;
  const start = last.index + last[0].length;
  const parts = file.slice(start).split(/[\\/]/);
  const name = parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return name ? path.join(file.slice(0, start), name) : null;
}

/**
 * One file of every notice, in name order. A package published without a licence file needs its
 * text kept in `keptLicences`, named after it, such as `standardwebhooks.txt` or
 * `@scope__name.txt`. A package with neither, or that states no licence, stops the build.
 */
export function thirdPartyNotices(packageDirs, keptLicences = 'scripts/licences') {
  const packages = [...new Set(packageDirs)].map((dir) => ({ dir, info: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) }));
  packages.sort((a, b) => a.info.name.localeCompare(b.info.name) || a.info.version.localeCompare(b.info.version));
  const sections = packages.map(({ dir, info }) => {
    if (!info.license) throw new Error(`${info.name} states no licence, so it cannot go into the extension unchecked.`);
    const files = fs.readdirSync(dir).filter((file) => LICENCE_FILE.test(file)).sort();
    const repository = typeof info.repository === 'string' ? info.repository : info.repository?.url;
    const kept = path.join(keptLicences, `${info.name.replace('/', '__')}.txt`);
    if (!files.length && !fs.existsSync(kept)) throw new Error(`${info.name} has no licence file. Keep its licence text in ${kept}.`);
    const texts = files.length ? files.map((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim()) : [fs.readFileSync(kept, 'utf8').trim()];
    return [`${info.name} ${info.version}`, `Licence: ${info.license}`, ...(repository ? [`Source: ${repository}`] : []), '', ...texts].join('\n');
  });
  const rule = `\n\n${'='.repeat(78)}\n\n`;
  return `Living Chess Book carries the following packages, under their own licences.${rule}${sections.join(rule)}\n`;
}
