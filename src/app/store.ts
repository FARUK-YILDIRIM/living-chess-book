import { emptyNotebook, entriesToKeep, notebookFromStorage, type Notebook } from '../core/notebook';
import type { BookOverlay } from '../core/types';
import type { BookPlace } from '../core/overlay';
import { CUSTOM } from '../llm/settings';

/**
 * Kept from the project's working name, as are the `chess-coach.` keys of saved settings. Renaming
 * them would leave every saved book, note and setting behind. See ADR-0020.
 */
const DB_NAME = 'chess-coach';
const DB_VERSION = 3;
const OVERLAYS = 'overlays';
const BOOKS = 'books';
const PDFS = 'pdfs';
const SETTINGS = 'settings';
const NOTEBOOKS = 'notebooks';
const ALL_STORES = [OVERLAYS, BOOKS, PDFS, SETTINGS, NOTEBOOKS];

const AI_SETTINGS = 'ai';
const SEALED_KEYS = 'sealedKeys';
const SEALING_KEY = 'sealingKey';

/** What the library shows about a book. It is stored here only, and never in an overlay. */
export interface LibraryBook {
  hash: string;
  name: string;
  pageCount: number;
  /** A small picture of the first page, as a data URL. */
  cover: string | null;
  addedAt: number;
  openedAt: number;
  lastPage: number;
  /** Where the board was, to come back to. Ids from one analysis, so a new one can leave it pointing nowhere. */
  lastPlace?: BookPlace | null;
  /** Null until the book has been analyzed. */
  moves: number | null;
  toCheck: number | null;
  /** A failed analysis gets one more try by itself, and no more. */
  hasRetriedAnalysis?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of ALL_STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    let wasBlocked = false;
    request.onsuccess = () => {
      // Whoever asked has been told to try again, and this connection would block the next upgrade.
      if (wasBlocked) {
        request.result.close();
        return;
      }
      // Stepping aside here lets a newer version of the app in another window upgrade.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    // Another tab holds an older version open. Better to say so than to wait for ever.
    request.onblocked = () => {
      wasBlocked = true;
      reject(new Error('Close the other windows of this app, then try again.'));
    };
  });
}

/**
 * Runs one transaction. It settles only once the data is safely written, and rolls back
 * as a whole if anything in it fails.
 */
async function transact<T>(
  stores: readonly string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction, finish: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(stores as string[], mode);
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('The change could not be saved.'));
      run(transaction, (value) => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}

function readOne<T>(store: string, key: string): Promise<T | undefined> {
  return transact<T | undefined>([store], 'readonly', (transaction, finish) => {
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => finish(request.result as T | undefined);
  });
}

function writeOne(store: string, key: string, value: unknown): Promise<void> {
  return transact<void>([store], 'readwrite', (transaction, finish) => {
    transaction.objectStore(store).put(value, key);
    finish();
  });
}

function deleteMany(store: string, keys: readonly string[]): Promise<void> {
  return transact<void>([store], 'readwrite', (transaction, finish) => {
    for (const key of keys) transaction.objectStore(store).delete(key);
    finish();
  });
}

/** Overlays are keyed by the PDF's hash, and hold no book content. See ADR-0006. */
export async function loadOverlay(bookHash: string): Promise<BookOverlay | null> {
  return (await readOne<BookOverlay>(OVERLAYS, bookHash)) ?? null;
}

/** Saves an analysis, and brings the book's counts in the library up to date. */
export function saveOverlay(overlay: BookOverlay): Promise<void> {
  return transact<void>([OVERLAYS, BOOKS], 'readwrite', (transaction, finish) => {
    transaction.objectStore(OVERLAYS).put(overlay, overlay.bookHash);
    const books = transaction.objectStore(BOOKS);
    const request = books.get(overlay.bookHash);
    request.onsuccess = () => {
      const book = request.result as LibraryBook | undefined;
      if (book) books.put({ ...book, moves: overlay.moves.length, toCheck: overlay.review.length }, book.hash);
      finish();
    };
  });
}

/** A file name, as a reader would write the title. The stored name stays as it was. */
export const bookTitle = (name: string) => name.replace(/[_]+/g, ' ').trim() || name;

export type NewBook = Pick<LibraryBook, 'hash' | 'name' | 'pageCount' | 'cover'>;

/** Adds a book and its private copy together, picking up an analysis from before the library. */
export async function addBook(book: NewBook, bytes: Uint8Array, now = Date.now()): Promise<void> {
  await transact<void>([BOOKS, PDFS, OVERLAYS], 'readwrite', (transaction, finish) => {
    transaction.objectStore(PDFS).put(bytes, book.hash);
    const request = transaction.objectStore(OVERLAYS).get(book.hash);
    request.onsuccess = () => {
      const overlay = request.result as BookOverlay | undefined;
      const entry: LibraryBook = {
        ...book,
        addedAt: now,
        openedAt: now,
        lastPage: 0,
        moves: overlay?.moves.length ?? null,
        toCheck: overlay?.review.length ?? null,
      };
      transaction.objectStore(BOOKS).put(entry, book.hash);
      finish();
    };
  });
  // Asks the browser not to clear this storage when disk space runs low. It may say no.
  void navigator.storage?.persist?.().catch(() => {});
}

/** Most recently opened first. */
export async function listBooks(): Promise<LibraryBook[]> {
  const books = await transact<LibraryBook[]>([BOOKS], 'readonly', (transaction, finish) => {
    const request = transaction.objectStore(BOOKS).getAll();
    request.onsuccess = () => finish(request.result as LibraryBook[]);
  });
  return books.sort((a, b) => b.openedAt - a.openedAt);
}

export async function loadBookBytes(hash: string): Promise<Uint8Array | null> {
  return (await readOne<Uint8Array>(PDFS, hash)) ?? null;
}

function changeBook(hash: string, change: (book: LibraryBook) => LibraryBook): Promise<LibraryBook | null> {
  return transact<LibraryBook | null>([BOOKS], 'readwrite', (transaction, finish) => {
    const books = transaction.objectStore(BOOKS);
    const request = books.get(hash);
    request.onsuccess = () => {
      const book = request.result as LibraryBook | undefined;
      if (!book) {
        finish(null);
        return;
      }
      const changed = change(book);
      books.put(changed, hash);
      finish(changed);
    };
  });
}

/** Notes that a book was opened, and returns the page to go back to. Null if it is not in the library. */
export async function openedBook(hash: string, now = Date.now()): Promise<number | null> {
  return (await changeBook(hash, (book) => ({ ...book, openedAt: now })))?.lastPage ?? null;
}

export async function canRetryAnalysis(hash: string): Promise<boolean> {
  const book = await readOne<LibraryBook>(BOOKS, hash);
  return Boolean(book) && !book!.hasRetriedAnalysis;
}

/** Called only once a retry has run to its end, since one cut short has told us nothing. */
export async function markAnalysisRetried(hash: string): Promise<void> {
  await changeBook(hash, (book) => ({ ...book, hasRetriedAnalysis: true }));
}

export async function rememberPage(hash: string, page: number): Promise<void> {
  await changeBook(hash, (book) => ({ ...book, lastPage: page }));
}

export async function rememberPlace(hash: string, place: BookPlace): Promise<void> {
  await changeBook(hash, (book) => ({ ...book, lastPlace: place }));
}

export async function lastPlaceOf(hash: string): Promise<BookPlace | null> {
  return (await readOne<LibraryBook>(BOOKS, hash))?.lastPlace ?? null;
}

/** Removes a book, its private copy, its analysis and its notebook, all together. */
export function removeBook(hash: string): Promise<void> {
  const stores = [BOOKS, PDFS, OVERLAYS, NOTEBOOKS];
  return transact<void>(stores, 'readwrite', (transaction, finish) => {
    for (const store of stores) transaction.objectStore(store).delete(hash);
    finish();
  });
}

/** Kept apart from the overlay, so that a new analysis cannot touch it. See ADR-0013. */
export async function loadNotebook(bookHash: string): Promise<Notebook> {
  return notebookFromStorage(await readOne<unknown>(NOTEBOOKS, bookHash), bookHash);
}

/**
 * Reads and writes in one step, so that a quick second change, or an addition in a second window,
 * cannot overwrite the first. It refuses a notebook it cannot safely rewrite.
 */
export function changeNotebook(bookHash: string, change: (notebook: Notebook) => Notebook): Promise<Notebook> {
  return transact<Notebook>([NOTEBOOKS], 'readwrite', (transaction, finish) => {
    const notebooks = transaction.objectStore(NOTEBOOKS);
    const request = notebooks.get(bookHash);
    request.onsuccess = () => {
      const kept = entriesToKeep(request.result);
      if (!kept) {
        transaction.abort();
        return;
      }
      const stored = request.result === undefined ? emptyNotebook(bookHash) : notebookFromStorage(request.result, bookHash);
      const changed = change(stored);
      notebooks.put({ ...changed, entries: [...changed.entries, ...kept] }, bookHash);
      finish(changed);
    };
  });
}

export function loadAiSettings(): Promise<unknown> {
  return readOne<unknown>(SETTINGS, AI_SETTINGS);
}

export function saveAiSettings(settings: unknown): Promise<void> {
  return writeOne(SETTINGS, AI_SETTINGS, settings);
}

interface SealedKeys {
  iv: Uint8Array;
  data: ArrayBuffer;
}

/**
 * Keeps saved keys out of plain text. The sealing key lives in the same database, so this
 * stops a casual look at the files, and not someone determined who can read them.
 */
async function sealingKey(): Promise<CryptoKey> {
  const existing = await readOne<CryptoKey>(SETTINGS, SEALING_KEY);
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await writeOne(SETTINGS, SEALING_KEY, created);
  return created;
}

/** The "Other" address is sealed in too, because its key belongs to that address alone. */
export async function saveApiKeys(keys: Record<string, string>, otherAddress: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sealingKey(),
    new TextEncoder().encode(JSON.stringify({ keys, otherAddress })),
  );
  await writeOne(SETTINGS, SEALED_KEYS, { iv, data } satisfies SealedKeys);
}

/** Keys that cannot be read back are treated as forgotten: a reader can type them again. */
export async function loadApiKeys(currentAddress: string): Promise<Record<string, string>> {
  try {
    const sealed = await readOne<SealedKeys>(SETTINGS, SEALED_KEYS);
    const key = await readOne<CryptoKey>(SETTINGS, SEALING_KEY);
    if (!sealed || !key) return {};
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv as BufferSource }, key, sealed.data);
    const { keys, otherAddress } = JSON.parse(new TextDecoder().decode(plain)) as { keys?: unknown; otherAddress?: unknown };
    if (typeof keys !== 'object' || keys === null) return {};
    const entries = Object.entries(keys).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return Object.fromEntries(otherAddress === currentAddress ? entries : entries.filter(([provider]) => provider !== CUSTOM));
  } catch {
    return {};
  }
}

export function forgetApiKeys(): Promise<void> {
  return deleteMany(SETTINGS, [SEALED_KEYS, SEALING_KEY]);
}
