import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isKnownMessage, pickLanguage, translate, translateMessage } from '../src/app/i18n';

const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('translate', () => {
  it('gives Turkish, and fills in values', () => {
    expect(translate('tr', 'Settings')).toBe('Ayarlar');
    expect(translate('tr', 'Preparing the book: {percent}%', { percent: 42 })).toBe('Kitap hazırlanıyor: %42');
  });

  it('gives English as written', () => {
    expect(translate('en', 'Preparing the book: {percent}%', { percent: 42 })).toBe('Preparing the book: 42%');
  });

  it('leaves a placeholder alone when its value is missing', () => {
    expect(translate('en', 'Check ({count})')).toBe('Check ({count})');
  });
});

describe('translateMessage', () => {
  it('translates a known message', () => {
    expect(translateMessage('tr', 'The provider did not accept this key.')).toBe('Sağlayıcı bu anahtarı kabul etmedi.');
  });

  it('keeps a request number for diagnosis', () => {
    expect(translateMessage('tr', 'OpenAI is limiting requests (request req_1).')).toBe('OpenAI istekleri sınırlıyor (istek req_1).');
  });

  it('keeps an error code', () => {
    expect(translateMessage('tr', 'OpenAI returned an error (bad_thing) (request req_1).')).toBe('OpenAI bir hata döndürdü (bad_thing) (istek req_1).');
    expect(translateMessage('tr', 'The provider returned an error (500).')).toBe('Sağlayıcı bir hata döndürdü (500).');
  });

  it('shows an unknown message rather than none', () => {
    expect(translateMessage('tr', 'Something from pdf.js')).toBe('Something from pdf.js');
  });

  it('leaves English alone', () => {
    expect(translateMessage('en', 'OpenAI is limiting requests (request req_1).')).toBe('OpenAI is limiting requests (request req_1).');
  });

  /** A new message written in English must not reach a Turkish reader by accident. */
  it('knows every message the providers and the helper can send', () => {
    const files = [
      'src/llm/providers.ts',
      'src/llm/settings.ts',
      'src/app/useAiSettings.ts',
      'src/core/repair.ts',
      'src/pdf/cropRegion.ts',
      'server/chatgpt/account.ts',
      'server/chatgpt/responses.ts',
      'server/chatgpt/helper.ts',
    ];
    const messages = new Set<string>();
    const pattern = /(?:'|`)((?:[A-Z][a-z']*|OpenAI's)(?: [^'`\n]*)?[.!])(?:'|`)|"((?:[A-Z][a-z]*)(?: [^"\n]*)?\.)"/g;
    const strip = (text: string) => text.replace(/\$\{reference\}/g, '').replace(/\\'/g, "'");
    for (const file of files) {
      for (const match of read(file).matchAll(pattern)) {
        const text = strip(match[1] ?? match[2] ?? '');
        if (text && !text.includes('${')) messages.add(text);
      }
    }
    expect(messages.size).toBeGreaterThan(30);
    // The page shown in the browser after signing in has no language setting, so it carries both.
    const isSignInPage = (message: string) => message.includes('Living Chess Book');
    const missing = [...messages].filter((message) => !isSignInPage(message) && translateMessage('tr', message) === message);
    expect(missing).toEqual([]);
  });

  it('knows the error messages thrown while parsing a reply', () => {
    for (const message of ['The reply held no JSON', 'The reply held no lines', 'The reply has a line with no moves']) {
      expect(translateMessage('tr', message)).not.toBe(message);
    }
  });
});

describe('isKnownMessage', () => {
  it('tells a message for readers from a raw error', () => {
    expect(isKnownMessage('This PDF could not be opened.')).toBe(true);
    expect(isKnownMessage('OpenAI is limiting requests (request req_1).')).toBe(true);
    expect(isKnownMessage('Failed to fetch')).toBe(false);
    expect(isKnownMessage('Invalid PDF structure')).toBe(false);
  });
});

describe('position problems', () => {
  it.each([
    ['white king count is 0', 'beyaz şah sayısı 0'],
    ['black king count is 2', 'siyah şah sayısı 2'],
    ['more than 8 white pawns', "8'den fazla beyaz piyon var"],
    ['pawn on the first or last rank', 'ilk veya son sırada piyon var'],
  ])('translates %s', (english, turkish) => {
    expect(translateMessage('tr', english)).toBe(turkish);
  });
});

describe('pickLanguage', () => {
  it('prefers what was chosen', () => {
    expect(pickLanguage('en', 'tr-TR')).toBe('en');
    expect(pickLanguage('tr', 'en-US')).toBe('tr');
  });

  it('follows the computer otherwise', () => {
    expect(pickLanguage(null, 'tr-TR')).toBe('tr');
    expect(pickLanguage(null, 'TR')).toBe('tr');
    expect(pickLanguage(null, 'de-DE')).toBe('en');
    expect(pickLanguage('nonsense', undefined)).toBe('en');
  });
});
