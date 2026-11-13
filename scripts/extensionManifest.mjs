/**
 * The browser extension's manifest. The extension only opens the app in a tab, so it asks for no
 * access to sites or tabs. See ADR-0021, and ADR-0022 for Firefox.
 */
export const ICON_SIZES = [16, 32, 48, 128];

/**
 * Stockfish and pdf.js's decoders are WebAssembly, which an extension page may compile only with
 * `wasm-unsafe-eval`. Nothing else is loosened.
 */
export const EXTENSION_CSP = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";

/** Firefox keeps a reader's storage under this ID, so it never changes. */
export const FIREFOX_ID = 'living-chess-book@livingchessbook.org';

/**
 * What AI reading and the coach may send to the provider the reader chose, and only after they agree.
 * The same categories as the Chrome Web Store listing.
 */
export const FIREFOX_OPTIONAL_DATA = ['websiteContent', 'personalCommunications', 'authenticationInfo'];

/** A browser takes one to four numbers, and refuses a version such as `1.0.0-beta.1`. */
const MANIFEST_VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;

/** @param {'chrome' | 'firefox'} browser Chrome's manifest also serves Edge. */
export function extensionManifest(version, browser = 'chrome') {
  if (!MANIFEST_VERSION.test(version)) throw new Error(`An extension cannot have the version ${version}. Use one to four numbers, such as 1.2.0.`);
  const icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `icons/icon-${size}.png`]));
  const common = {
    manifest_version: 3,
    name: 'Living Chess Book',
    version,
    description: 'Study a chess book PDF you own on one screen: clickable moves, a live board, notes, an engine and an optional AI coach.',
    icons,
    action: { default_title: 'Open Living Chess Book', default_icon: icons },
  };
  // Books, analyses and notes are kept on this computer, and must not be cleared to free space.
  const permissions = ['unlimitedStorage'];
  const content_security_policy = { extension_pages: EXTENSION_CSP };
  if (browser === 'firefox') {
    return {
      ...common,
      background: { scripts: ['background.js'] },
      permissions,
      content_security_policy,
      browser_specific_settings: {
        gecko: {
          id: FIREFOX_ID,
          // The first Firefox that asks for consent to data itself.
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'], optional: FIREFOX_OPTIONAL_DATA },
        },
      },
    };
  }
  return { ...common, background: { service_worker: 'background.js' }, permissions, content_security_policy, minimum_chrome_version: '116' };
}
