/**
 * The browser extension's manifest. The extension only opens the app in a tab, so it asks for no
 * access to sites or tabs. See ADR-0021.
 */
export const ICON_SIZES = [16, 32, 48, 128];

/**
 * Stockfish and pdf.js's decoders are WebAssembly, which an extension page may compile only with
 * `wasm-unsafe-eval`. Nothing else is loosened.
 */
export const EXTENSION_CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";

/** A browser takes one to four numbers, and refuses a version such as `1.0.0-beta.1`. */
const MANIFEST_VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;

export function extensionManifest(version) {
  if (!MANIFEST_VERSION.test(version)) throw new Error(`An extension cannot have the version ${version}. Use one to four numbers, such as 1.2.0.`);
  const icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `icons/icon-${size}.png`]));
  return {
    manifest_version: 3,
    name: 'Living Chess Book',
    version,
    description: 'Study a chess book PDF you own on one screen: clickable moves, a live board, notes, an engine and an optional AI coach.',
    icons,
    action: { default_title: 'Open Living Chess Book', default_icon: icons },
    background: { service_worker: 'background.js' },
    // Books, analyses and notes are kept on this computer, and must not be cleared to free space.
    permissions: ['unlimitedStorage'],
    content_security_policy: { extension_pages: EXTENSION_CSP },
    minimum_chrome_version: '116',
  };
}
