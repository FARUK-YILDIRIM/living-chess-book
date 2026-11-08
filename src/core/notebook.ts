import { diagramFen, moveNumber } from './overlay';
import { isReviewState, type ReviewState } from './repetition';
import type { BookOverlay, Box, MoveNode } from './types';

/** What the reader was looking at when they wrote something. */
export interface Anchor {
  page: number;
  /** The position on the board, or null if the board had nothing to do with the book yet. */
  fen: string | null;
  /** The book's own position under it. It differs from `fen` when the reader was trying moves. */
  bookFen: string | null;
  moveId: string | null;
  diagramId: string | null;
  /** The page of the book's position, which can differ from the page on screen. */
  bookPage: number | null;
  /** The move as it read at the time, such as `12. Nf3`. */
  label: string | null;
}

export type EntryKind = 'note' | 'position' | 'coach';

/** Holds the reader's own words and no book text: see ADR-0013. */
export interface NotebookEntry {
  id: string;
  kind: EntryKind;
  text: string;
  createdAt: number;
  updatedAt: number;
  anchor: Anchor;
  /** For a coach's answer, which is `text`: what the reader asked. */
  question?: string;
  /** For a coach's answer: the model, and what it used, so that the cost can be seen. */
  model?: string;
  usage?: { input: number; output: number } | null;
  /** Marks on the page, as boxes. These are places only, and hold none of the words. */
  highlight?: Box[];
  /** For a saved position: when it comes back for practice. */
  review?: ReviewState;
  /** A position saved by the app, because the reader did not find the move there. */
  wasMissed?: boolean;
}

export interface Notebook {
  schemaVersion: 1;
  bookHash: string;
  entries: NotebookEntry[];
  /** Diagrams the reader has solved, by `diagramKey`. */
  solved?: string[];
}

export const emptyNotebook = (bookHash: string): Notebook => ({ schemaVersion: 1, bookHash, entries: [] });

/** Where a click on an entry leads. */
export interface AnchorTarget {
  page: number;
  /** Null when the entry names no position, so the board stays as it is. */
  board: { moveId: string | null; diagramId: string | null; exploreFen: string | null } | null;
}

/**
 * Two positions are the same if the same moves are possible from them, whatever the move counters
 * say, since one position can be reached by lines of different lengths.
 */
export function samePosition(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ');
}

export function moveLabel(move: MoveNode): string {
  const { number, movedWhite } = moveNumber(move);
  return `${number}${movedWhite ? '.' : '...'} ${move.san}`;
}

/** Finds the book's move for a position: the stored id if it still fits, or one on the same page. */
function findMove(overlay: BookOverlay, anchor: Anchor, fen: string | null): MoveNode | null {
  if (!fen) return null;
  const stored = overlay.moves.find((m) => m.id === anchor.moveId);
  if (stored && samePosition(stored.fen, fen)) return stored;
  const page = anchor.bookPage ?? anchor.page;
  return overlay.moves.find((m) => m.page === page && samePosition(m.fen, fen)) ?? null;
}

function findDiagramId(overlay: BookOverlay, anchor: Anchor, fen: string | null): string | null {
  if (!fen) return null;
  const fits = (id: string) => samePosition(diagramFen(overlay, id), fen);
  if (anchor.diagramId && fits(anchor.diagramId)) return anchor.diagramId;
  const page = anchor.bookPage ?? anchor.page;
  return overlay.diagrams.find((d) => d.page === page && fits(d.id))?.id ?? null;
}

/**
 * Works out how to get back to an entry with the analysis as it is now. Whatever has changed, the
 * reader sees the position they saved: if the book no longer has it, it is shown as their own.
 */
export function resolveAnchor(overlay: BookOverlay, anchor: Anchor): AnchorTarget {
  const { page, fen, bookFen } = anchor;
  if (!fen) return { page, board: null };

  // A book often prints a diagram just after the move that reaches it, so a note on the diagram
  // must not come back to that move.
  const noted = anchor.moveId === null ? findDiagramId(overlay, anchor, bookFen) : null;
  const move = noted ? null : findMove(overlay, anchor, bookFen);
  const diagramId = noted ?? (move ? move.diagramId : findDiagramId(overlay, anchor, bookFen));
  const isInBook = (move !== null || diagramId !== null) && samePosition(bookFen, fen);
  return {
    page,
    board: { moveId: move?.id ?? null, diagramId, exploreFen: isInBook ? null : fen },
  };
}

/** The moves on which there are entries, so that the page can show them. */
export function notedMoveIds(overlay: BookOverlay, entries: readonly NotebookEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const { anchor } of entries) {
    const moveId = resolveAnchor(overlay, anchor).board?.moveId;
    if (moveId) ids.add(moveId);
  }
  return ids;
}

export function addEntry(notebook: Notebook, entry: NotebookEntry): Notebook {
  return { ...notebook, entries: [...notebook.entries, entry] };
}

export function editEntry(notebook: Notebook, id: string, text: string, now: number): Notebook {
  return { ...notebook, entries: notebook.entries.map((e) => (e.id === id ? { ...e, text, updatedAt: now } : e)) };
}

export function removeEntry(notebook: Notebook, id: string): Notebook {
  return { ...notebook, entries: notebook.entries.filter((e) => e.id !== id) };
}

/** Puts a removed entry back where it was, so that undoing leaves no trace. */
export function restoreEntry(notebook: Notebook, entry: NotebookEntry): Notebook {
  if (notebook.entries.some((e) => e.id === entry.id)) return notebook;
  const entries = [...notebook.entries, entry].sort((a, b) => a.createdAt - b.createdAt);
  return { ...notebook, entries };
}

export function findSavedPosition(entries: readonly NotebookEntry[], fen: string): NotebookEntry | null {
  return entries.find((e) => e.kind === 'position' && samePosition(e.anchor.fen, fen)) ?? null;
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown) => value === null || isText(value);
const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

function isBox(value: unknown): value is Box {
  const box = value as Partial<Box> | null;
  return isCount(box?.x0) && isCount(box?.y0) && isCount(box?.x1) && isCount(box?.y1);
}

export function isEntry(value: unknown): value is NotebookEntry {
  const entry = value as Partial<NotebookEntry> | null;
  const anchor = entry?.anchor;
  return (
    isText(entry?.id) &&
    (entry.kind === 'note' || entry.kind === 'position' || (entry.kind === 'coach' && isText(entry.question))) &&
    (entry.highlight === undefined || (Array.isArray(entry.highlight) && entry.highlight.every(isBox))) &&
    (entry.review === undefined || isReviewState(entry.review)) &&
    isText(entry.text) &&
    isCount(entry.createdAt) &&
    isCount(entry.updatedAt) &&
    Boolean(anchor) &&
    isCount(anchor!.page) &&
    isTextOrNull(anchor!.fen) &&
    isTextOrNull(anchor!.bookFen) &&
    isTextOrNull(anchor!.moveId) &&
    isTextOrNull(anchor!.diagramId) &&
    (anchor!.bookPage === null || isCount(anchor!.bookPage)) &&
    isTextOrNull(anchor!.label)
  );
}

/** All the marks on a page. */
export function highlightsOnPage(entries: readonly NotebookEntry[], page: number): Box[] {
  return entries.flatMap((entry) => (entry.anchor.page === page ? (entry.highlight ?? []) : []));
}

/** Reads what was stored, leaving out anything that could not be shown. */
export function notebookFromStorage(value: unknown, bookHash: string): Notebook {
  const entries = (value as Partial<Notebook> | null | undefined)?.entries;
  const solved = (value as Partial<Notebook> | null | undefined)?.solved;
  return {
    schemaVersion: 1,
    bookHash,
    entries: Array.isArray(entries) ? entries.filter(isEntry) : [],
    ...(Array.isArray(solved) ? { solved: solved.filter(isText) } : {}),
  };
}

/**
 * For a write: what must go back into storage along with the entries this version understands. Null
 * if the stored notebook is not one this version can safely rewrite, as when a newer version of the
 * app has changed it. An entry this version cannot show is kept, since it may still be someone's words.
 */
export function entriesToKeep(stored: unknown): unknown[] | null {
  if (stored === undefined) return [];
  const { schemaVersion, entries } = (stored ?? {}) as { schemaVersion?: unknown; entries?: unknown };
  if (schemaVersion !== 1 || !Array.isArray(entries)) return null;
  return entries.filter((entry) => !isEntry(entry));
}

export interface MarkdownWords {
  title: string;
  page: (page: number) => string;
  savedPosition: string;
  ownMoves: string;
  coach: string;
}

/** A file to read or keep, in the order of the book. It holds no book text. */
export function notebookToMarkdown(entries: readonly NotebookEntry[], words: MarkdownWords): string {
  const sorted = entries.slice().sort((a, b) => a.anchor.page - b.anchor.page || a.createdAt - b.createdAt);
  const parts = [`# ${words.title}`];
  for (const { kind, text, anchor, question } of sorted) {
    const isOwn = Boolean(anchor.fen) && !samePosition(anchor.fen, anchor.bookFen);
    const heading = [words.page(anchor.page + 1), anchor.label, isOwn ? words.ownMoves : null, kind === 'position' ? words.savedPosition : null];
    const lines = [`## ${heading.filter(Boolean).join(' · ')}`];
    if (anchor.fen) lines.push(`\`${anchor.fen}\``);
    if (kind === 'coach') lines.push(`**${question ?? ''}**`, `${words.coach}: ${text}`);
    else if (text) lines.push(text);
    parts.push(lines.join('\n\n'));
  }
  return `${parts.join('\n\n')}\n`;
}
