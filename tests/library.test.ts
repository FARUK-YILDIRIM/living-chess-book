import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  addBook,
  bookTitle,
  canRetryAnalysis,
  changeNotebook,
  loadNotebook,
  markAnalysisRetried,
  forgetApiKeys,
  listBooks,
  loadAiSettings,
  loadApiKeys,
  loadBookBytes,
  loadOverlay,
  openedBook,
  rememberPage,
  rememberPlace,
  lastPlaceOf,
  removeBook,
  saveAiSettings,
  saveApiKeys,
  saveOverlay,
} from '../src/app/store';
import { addEntry, emptyNotebook, type NotebookEntry } from '../src/core/notebook';
import type { BookOverlay } from '../src/core/types';
import { DEFAULT_SETTINGS, resolveProvider, settingsFromStorage } from '../src/llm/settings';

const overlay = (hash: string, moves = 1, review = 1): BookOverlay =>
  ({
    schemaVersion: 1,
    bookHash: hash,
    pageCount: 3,
    diagrams: [],
    moves: Array.from({ length: moves }, () => ({})),
    review: Array.from({ length: review }, () => ({})),
  }) as unknown as BookOverlay;

const book = (hash: string) => ({ hash, name: `Book ${hash}`, pageCount: 3, cover: null });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('library', () => {
  it('starts empty', async () => {
    expect(await listBooks()).toEqual([]);
  });

  it('keeps a book with its copy', async () => {
    await addBook(book('a'), new Uint8Array([1, 2, 3]), 100);
    expect(await listBooks()).toMatchObject([{ hash: 'a', name: 'Book a', lastPage: 0, moves: null, toCheck: null }]);
    expect(Array.from((await loadBookBytes('a'))!)).toEqual([1, 2, 3]);
  });

  it('picks up an analysis made before the book joined the library', async () => {
    await saveOverlay(overlay('a', 5, 2));
    await addBook(book('a'), new Uint8Array([1]));
    expect(await listBooks()).toMatchObject([{ moves: 5, toCheck: 2 }]);
  });

  it('brings counts up to date when an analysis is saved', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    await saveOverlay(overlay('a', 7, 3));
    expect(await listBooks()).toMatchObject([{ moves: 7, toCheck: 3 }]);
    expect((await loadOverlay('a'))!.moves).toHaveLength(7);
  });

  it('saves an analysis of a book that is not in the library', async () => {
    await saveOverlay(overlay('x'));
    expect(await listBooks()).toEqual([]);
    expect(await loadOverlay('x')).not.toBeNull();
  });

  it('lists the most recently opened book first', async () => {
    await addBook(book('a'), new Uint8Array([1]), 100);
    await addBook(book('b'), new Uint8Array([1]), 200);
    expect((await listBooks()).map((b) => b.hash)).toEqual(['b', 'a']);
    await openedBook('a', 300);
    expect((await listBooks()).map((b) => b.hash)).toEqual(['a', 'b']);
  });

  it('goes back to the last page read', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    await rememberPage('a', 2);
    expect(await openedBook('a')).toBe(2);
  });

  it('goes back to where the board was', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    expect(await lastPlaceOf('a')).toBeNull();
    await rememberPlace('a', { moveId: 'm', diagramId: 'd' });
    await rememberPage('a', 3);
    expect(await lastPlaceOf('a')).toEqual({ moveId: 'm', diagramId: 'd' });
  });

  it('allows automatic retries of a failed analysis until one has run to its end', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    // A retry cut short marks nothing, so the next opening tries again.
    expect(await canRetryAnalysis('a')).toBe(true);
    expect(await canRetryAnalysis('a')).toBe(true);
    await markAnalysisRetried('a');
    expect(await canRetryAnalysis('a')).toBe(false);
    expect(await canRetryAnalysis('not-in-library')).toBe(false);
  });

  it('says when a book is not in the library', async () => {
    expect(await openedBook('nope')).toBeNull();
    expect(await lastPlaceOf('nope')).toBeNull();
    await expect(rememberPage('nope', 1)).resolves.toBeUndefined();
    expect(await listBooks()).toEqual([]);
  });

  it('removes a book, its copy and its analysis, and nothing else', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    await addBook(book('b'), new Uint8Array([2]));
    await saveOverlay(overlay('a'));
    await saveOverlay(overlay('b'));
    await removeBook('a');
    expect((await listBooks()).map((b) => b.hash)).toEqual(['b']);
    expect(await loadBookBytes('a')).toBeNull();
    expect(await loadOverlay('a')).toBeNull();
    expect(await loadOverlay('b')).not.toBeNull();
  });

  it('keeps analyses from the earlier version of the database', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chess-coach', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('overlays');
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('overlays', 'readwrite');
        transaction.objectStore('overlays').put(overlay('old'), 'old');
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
    expect(await loadOverlay('old')).not.toBeNull();
    expect(await listBooks()).toEqual([]);
  });

  it('keeps no book content in what an overlay stores', async () => {
    await addBook({ ...book('a'), name: 'A secret title' }, new Uint8Array([1]));
    await saveOverlay(overlay('a'));
    expect(JSON.stringify(await loadOverlay('a'))).not.toContain('secret');
  });
});

describe('saved settings', () => {
  it('survives a round trip', async () => {
    await saveAiSettings({ ...DEFAULT_SETTINGS, provider: 'OpenRouter' });
    expect(settingsFromStorage(await loadAiSettings()).provider).toBe('OpenRouter');
  });

  it.each([[null], ['text'], [{ provider: 'Unknown', anthropicModel: 'gone', otherModels: 4, rememberKeys: 'yes' }]])(
    'falls back to defaults for %j',
    (stored) => {
      expect(settingsFromStorage(stored)).toEqual(DEFAULT_SETTINGS);
    },
  );
});

describe('saved keys', () => {
  it('reads back what was saved', async () => {
    await saveApiKeys({ Anthropic: 'test-one', OpenAI: 'test-two' }, '');
    expect(await loadApiKeys('')).toEqual({ Anthropic: 'test-one', OpenAI: 'test-two' });
  });

  it('drops the key for an address other than the one it was saved with', async () => {
    await saveApiKeys({ Anthropic: 'test-one', Other: 'test-two' }, 'https://one.example.com/v1');
    expect(await loadApiKeys('https://one.example.com/v1')).toHaveProperty('Other', 'test-two');
    expect(await loadApiKeys('https://two.example.com/v1')).toEqual({ Anthropic: 'test-one' });
  });

  it('is not stored in plain text', async () => {
    await saveApiKeys({ Anthropic: 'test-plain-value' }, '');
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('chess-coach');
      request.onsuccess = () => {
        const get = request.result.transaction('settings').objectStore('settings').get('sealedKeys');
        get.onsuccess = () => {
          request.result.close();
          resolve(get.result);
        };
      };
      request.onerror = () => reject(request.error);
    });
    const { data } = raw as { data: ArrayBuffer };
    expect(new TextDecoder().decode(data)).not.toContain('test-plain-value');
  });

  it('forgets', async () => {
    await saveApiKeys({ Anthropic: 'test-one' }, '');
    await forgetApiKeys();
    expect(await loadApiKeys('')).toEqual({});
  });

  it('treats keys it cannot read as forgotten', async () => {
    await saveApiKeys({ Anthropic: 'test-one' }, '');
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('chess-coach');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const transaction = db.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({ iv: new Uint8Array(12), data: new ArrayBuffer(4) }, 'sealedKeys');
      transaction.oncomplete = () => resolve();
    });
    db.close();
    expect(await loadApiKeys('')).toEqual({});
  });
});

describe('resolveProvider', () => {
  const settings = DEFAULT_SETTINGS;

  it('asks for a key first with Anthropic', () => {
    const resolved = resolveProvider(settings, {});
    expect(resolved.problem).toContain('API key');
    expect(resolved.config).toBeNull();
  });

  it('builds a request setup when all is set', () => {
    const { config, problem, destination } = resolveProvider(settings, { Anthropic: ' test-key ' });
    expect(problem).toBeNull();
    expect(destination).toBe('Anthropic');
    expect(config).toEqual({ kind: 'anthropic', apiKey: 'test-key', model: 'claude-opus-5-5' });
  });

  it('never uses a key typed for another provider', () => {
    const openAi = { ...settings, provider: 'OpenAI', otherModels: { OpenAI: 'some-model' } };
    expect(resolveProvider(openAi, { Anthropic: 'test-key' }).config).toBeNull();
    expect(resolveProvider(openAi, { OpenAI: 'test-two' }).config).toMatchObject({ apiKey: 'test-two', baseUrl: 'https://api.openai.com/v1' });
  });

  it('asks for a model when a provider has none set', () => {
    expect(resolveProvider({ ...settings, provider: 'OpenAI' }, { OpenAI: 'k' }).problem).toContain('model');
  });

  it('needs no key on this computer', () => {
    const ollama = { ...settings, provider: 'Ollama, on this computer', otherModels: { 'Ollama, on this computer': 'local' } };
    const resolved = resolveProvider(ollama, {});
    expect(resolved.needsKey).toBe(false);
    expect(resolved.config).toMatchObject({ apiKey: '', baseUrl: 'http://localhost:11434/v1' });
  });

  it('still needs a key at a lookalike address', () => {
    const other = { ...settings, provider: 'Other', customUrl: 'https://localhost.example.com/v1', otherModels: { Other: 'm' } };
    expect(resolveProvider(other, {}).needsKey).toBe(true);
  });

  it('refuses an address that would send a key in the clear', () => {
    const other = { ...settings, provider: 'Other', customUrl: 'http://example.com/v1', otherModels: { Other: 'm' } };
    const resolved = resolveProvider(other, { Other: 'k' });
    expect(resolved.problem).toContain('https');
    expect(resolved.config).toBeNull();
  });

  it('changes the consent key when images would go elsewhere', () => {
    const one = { ...settings, provider: 'Other', customUrl: 'https://one.example.com/v1' };
    const two = { ...one, customUrl: 'https://two.example.com/v1' };
    expect(resolveProvider(one, {}).consentKey).not.toBe(resolveProvider(two, {}).consentKey);
  });
});

describe('bookTitle', () => {
  it('writes a file name as a title', () => {
    expect(bookTitle('chess_fundamentals')).toBe('chess fundamentals');
    expect(bookTitle('My Book')).toBe('My Book');
  });

  it('never leaves nothing', () => {
    expect(bookTitle('___')).toBe('___');
  });
});

describe('notebook', () => {
  const entry = (id: string): NotebookEntry => ({
    id,
    kind: 'note',
    text: `note ${id}`,
    createdAt: 1,
    updatedAt: 1,
    anchor: { page: 0, fen: null, bookFen: null, moveId: null, diagramId: null, bookPage: null, label: null },
  });
  const add = (hash: string, id: string) => changeNotebook(hash, (notebook) => addEntry(notebook, entry(id)));

  it('starts empty', async () => {
    expect(await loadNotebook('a')).toEqual(emptyNotebook('a'));
  });

  it('keeps entries per book', async () => {
    await add('a', '1');
    await add('b', '2');
    expect((await loadNotebook('a')).entries.map((e) => e.id)).toEqual(['1']);
    expect((await loadNotebook('b')).entries.map((e) => e.id)).toEqual(['2']);
  });

  it('loses nothing when changes arrive together', async () => {
    await Promise.all(['1', '2', '3', '4'].map((id) => add('a', id)));
    expect((await loadNotebook('a')).entries).toHaveLength(4);
  });

  it('survives a new analysis of the book', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    await saveOverlay(overlay('a', 5, 2));
    await add('a', '1');
    await saveOverlay(overlay('a', 9, 0));
    expect((await loadNotebook('a')).entries.map((e) => e.id)).toEqual(['1']);
  });

  it('stays out of the overlay, so that an export cannot carry it', async () => {
    await saveOverlay(overlay('a'));
    await add('a', '1');
    expect(JSON.stringify(await loadOverlay('a'))).not.toContain('note 1');
  });

  const storeRaw = (hash: string, value: unknown) =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chess-coach');
      request.onsuccess = () => {
        const transaction = request.result.transaction('notebooks', 'readwrite');
        transaction.objectStore('notebooks').put(value, hash);
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });

  it('does not erase an entry it cannot show when it writes', async () => {
    await add('a', '1');
    const chat = { id: 'c', kind: 'chat', text: 'from a later version' };
    await storeRaw('a', { schemaVersion: 1, bookHash: 'a', entries: [entry('1'), chat] });
    await add('a', '2');
    expect((await loadNotebook('a')).entries.map((e) => e.id)).toEqual(['1', '2']);
    await storeRaw('b', { schemaVersion: 1, bookHash: 'b', entries: [chat] });
    await add('b', '3');
    const removedOthers = await changeNotebook('b', (notebook) => notebook);
    expect(removedOthers.entries.map((e) => e.id)).toEqual(['3']);
    await add('b', '4');
    expect((await loadNotebook('b')).entries.map((e) => e.id)).toEqual(['3', '4']);
    // The entry it cannot show went back in each time, so a later version still finds it.
    const raw = await new Promise<{ entries: { id: string }[] }>((resolve) => {
      const request = indexedDB.open('chess-coach');
      request.onsuccess = () => {
        const read = request.result.transaction('notebooks').objectStore('notebooks').get('b');
        read.onsuccess = () => {
          request.result.close();
          resolve(read.result as { entries: { id: string }[] });
        };
      };
    });
    expect(raw.entries.map((e) => e.id).sort()).toEqual(['3', '4', 'c']);
  });

  it('refuses to rewrite a notebook from a later version, and leaves it as it is', async () => {
    await add('a', '1');
    const later = { schemaVersion: 2, bookHash: 'a', entries: { new: 'shape' } };
    await storeRaw('a', later);
    await expect(add('a', '2')).rejects.toBeTruthy();
    await saveOverlay(overlay('a'));
    await expect(add('a', '3')).rejects.toBeTruthy();
    expect((await loadNotebook('a')).entries).toEqual([]);
  });

  it('goes when its book is removed', async () => {
    await addBook(book('a'), new Uint8Array([1]));
    await add('a', '1');
    await removeBook('a');
    expect(await loadNotebook('a')).toEqual(emptyNotebook('a'));
  });

  it('opens a database made by an earlier version of the app', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chess-coach', 2);
      request.onupgradeneeded = () => {
        for (const name of ['overlays', 'books', 'pdfs', 'settings']) request.result.createObjectStore(name);
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction('overlays', 'readwrite');
        transaction.objectStore('overlays').put(overlay('old', 4, 1), 'old');
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
    expect((await loadOverlay('old'))?.moves).toHaveLength(4);
    await add('old', '1');
    expect((await loadNotebook('old')).entries).toHaveLength(1);
  });
});
