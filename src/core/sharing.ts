import { isEntry, type Notebook, type NotebookEntry } from './notebook';
import { overlayFromJson, play, settleReview, startFenOf } from './overlay';
import type { BookOverlay, MoveNode, ReviewItem } from './types';
import { checkPlacement } from '../vision/placement';

/**
 * Files a reader can keep or give to someone with the same PDF. Neither holds book text: an analysis
 * is moves, positions and places on pages, and a notebook is the reader's own words. See ADR-0019.
 */
export const ANALYSIS_KIND = 'living-chess-book-analysis';
export const NOTEBOOK_KIND = 'living-chess-book-notebook';
/** The same files under the project's working name, which may already have been saved. */
const EARLIER_ANALYSIS_KIND = 'chess-coach-analysis';
const EARLIER_NOTEBOOK_KIND = 'chess-coach-notebook';
const FILE_VERSION = 1;

export const NOT_A_FILE = 'This is not a file this app can read.';
export const OTHER_BOOK = 'This file is for another PDF. It only fits the very file it was made from, and not another copy or edition of the book.';

export interface BookIdentity {
  hash: string;
  pageCount: number;
}

export function analysisToFile(overlay: BookOverlay, exportedAt = Date.now()): string {
  return JSON.stringify({ kind: ANALYSIS_KIND, version: FILE_VERSION, exportedAt, overlay });
}

export interface ImportedAnalysis {
  overlay: BookOverlay;
  /** Moves that did not fit the rules from where they stand, with those after them. */
  dropped: number;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(NOT_A_FILE);
  }
}

/**
 * Reads an analysis made elsewhere for this very PDF. Nothing in it is taken on trust: each move is
 * played again from its diagram, and a diagram's problems are worked out again.
 */
export function analysisFromFile(text: string, book: BookIdentity): ImportedAnalysis {
  const parsed = parse(text) as { kind?: unknown; overlay?: unknown } | null;
  // Files saved before this format held the analysis alone.
  const raw = parsed && typeof parsed === 'object' && (parsed.kind === ANALYSIS_KIND || parsed.kind === EARLIER_ANALYSIS_KIND) ? parsed.overlay : parsed;
  let overlay: BookOverlay;
  try {
    overlay = overlayFromJson(JSON.stringify(raw));
  } catch {
    throw new Error(NOT_A_FILE);
  }
  if (overlay.bookHash !== book.hash || overlay.pageCount !== book.pageCount) throw new Error(OTHER_BOOK);

  const onPage = (page: number) => Number.isInteger(page) && page >= 0 && page < book.pageCount;
  const diagrams = overlay.diagrams.filter((d) => onPage(d.page)).map((d) => ({ ...d, issues: checkPlacement(d.placement) }));
  const draft: BookOverlay = { ...overlay, diagrams, moves: [], review: overlay.review.filter((item) => onPage(item.page)) };
  const diagramIds = new Set(diagrams.map((d) => d.id));

  const children = new Map<string | null, MoveNode[]>();
  for (const move of overlay.moves) {
    const siblings = children.get(move.parentId) ?? [];
    siblings.push(move);
    children.set(move.parentId, siblings);
  }

  const kept: MoveNode[] = [];
  const added: ReviewItem[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  /** Counts a move and all after it, and marks them as dealt with, so that none is counted twice. */
  const countAll = (move: MoveNode): number => {
    seen.add(move.id);
    return 1 + (children.get(move.id) ?? []).filter((child) => !seen.has(child.id)).reduce((sum, child) => sum + countAll(child), 0);
  };

  const visit = (move: MoveNode, before: string) => {
    if (seen.has(move.id)) return;
    seen.add(move.id);
    const fen = onPage(move.page) && (move.diagramId === null || diagramIds.has(move.diagramId)) ? play(before, move.san) : null;
    if (fen === null) {
      dropped += countAll(move);
      if (onPage(move.page)) added.push({ id: `r-${move.id}-imported`, reason: 'unresolved-move', page: move.page, box: move.box, targetId: null });
      return;
    }
    kept.push({ ...move, fen });
    for (const child of children.get(move.id) ?? []) visit(child, fen);
  };
  for (const root of children.get(null) ?? []) visit(root, startFenOf(draft, root));
  // Moves whose line never reaches a start, as with a missing parent, cannot be placed.
  dropped += overlay.moves.filter((m) => !seen.has(m.id)).length;

  return { overlay: settleReview({ ...draft, moves: kept, review: [...draft.review, ...added] }), dropped };
}

/** Corrections the reader made, which an imported analysis would replace. */
export const readerCorrections = (overlay: BookOverlay | null): number => overlay?.moves.filter((m) => m.source === 'reader').length ?? 0;

export function notebookToFile(notebook: Notebook, exportedAt = Date.now()): string {
  return JSON.stringify({ kind: NOTEBOOK_KIND, version: FILE_VERSION, exportedAt, notebook });
}

export interface ImportedNotebook {
  entries: NotebookEntry[];
  solved: string[];
  /** Entries in the file that could not be read. */
  skipped: number;
}

export function notebookFromFile(text: string, bookHash: string): ImportedNotebook {
  const parsed = parse(text) as { kind?: unknown; notebook?: { bookHash?: unknown; entries?: unknown; solved?: unknown } } | null;
  if (!parsed || (parsed.kind !== NOTEBOOK_KIND && parsed.kind !== EARLIER_NOTEBOOK_KIND) || !parsed.notebook || !Array.isArray(parsed.notebook.entries)) throw new Error(NOT_A_FILE);
  if (parsed.notebook.bookHash !== bookHash) throw new Error(OTHER_BOOK);
  const entries = parsed.notebook.entries.filter(isEntry);
  const solved = Array.isArray(parsed.notebook.solved) ? parsed.notebook.solved.filter((key): key is string => typeof key === 'string') : [];
  return { entries, solved, skipped: parsed.notebook.entries.length - entries.length };
}

/** Adds what the notebook lacks, and changes nothing that is already in it. */
export function mergeNotebook(current: Notebook, incoming: ImportedNotebook): { notebook: Notebook; added: number } {
  const known = new Set(current.entries.map((e) => e.id));
  const fresh = incoming.entries.filter((e) => !known.has(e.id));
  const solved = [...new Set([...(current.solved ?? []), ...incoming.solved])];
  return { notebook: { ...current, entries: [...current.entries, ...fresh], ...(solved.length ? { solved } : {}) }, added: fresh.length };
}
