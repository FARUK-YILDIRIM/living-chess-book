import { describe, expect, it } from 'vitest';
import { EXTENSION_CSP, FIREFOX_ID, extensionManifest } from '../scripts/extensionManifest.mjs';

describe('extension manifest', () => {
  const manifest = extensionManifest('1.2.3');

  it('is a Manifest V3 extension that opens a tab and nothing more', () => {
    expect(manifest).toMatchObject({ manifest_version: 3, name: 'Living Chess Book', version: '1.2.3', background: { service_worker: 'background.js' } });
    expect(manifest.permissions).toEqual(['unlimitedStorage']);
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('content_scripts');
  });

  it('allows WebAssembly, and no other loosening', () => {
    expect(EXTENSION_CSP).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
    expect(manifest.content_security_policy.extension_pages).toBe(EXTENSION_CSP);
  });

  it('keeps the description within the store\'s limit', () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it('refuses a version a browser would not load', () => {
    expect(() => extensionManifest('1.0.0-beta.1')).toThrow();
    expect(extensionManifest('2.0').version).toBe('2.0');
  });

  it('has an icon at each size a browser asks for', () => {
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128']);
  });
});

describe('Firefox manifest', () => {
  const chrome = extensionManifest('1.2.3');
  const firefox = extensionManifest('1.2.3', 'firefox');

  it('runs the background as a script, since Firefox has no service worker for it', () => {
    expect(firefox.background).toEqual({ scripts: ['background.js'] });
    expect(firefox).not.toHaveProperty('minimum_chrome_version');
  });

  it('keeps one ID, from the first Firefox with the built-in data consent', () => {
    expect(FIREFOX_ID).toBe('living-chess-book@livingchessbook.org');
    expect(firefox.browser_specific_settings.gecko).toMatchObject({ id: FIREFOX_ID, strict_min_version: '140.0' });
  });

  it('sends nothing without consent, and names what AI reading and the coach may send', () => {
    expect(firefox.browser_specific_settings.gecko.data_collection_permissions).toEqual({
      required: ['none'],
      optional: ['websiteContent', 'personalCommunications', 'authenticationInfo'],
    });
  });

  it('asks for no more than the Chrome build', () => {
    expect(firefox.permissions).toEqual(chrome.permissions);
    expect(firefox.content_security_policy).toEqual(chrome.content_security_policy);
    expect(firefox).not.toHaveProperty('host_permissions');
  });

  it('leaves the Chrome build without Firefox\'s settings', () => {
    expect(chrome).not.toHaveProperty('browser_specific_settings');
  });
});
