import { describe, expect, it } from 'vitest';
import {
  addEntry,
  editEntry,
  emptyNotebook,
  findSavedPosition,
  moveLabel,
  notebookFromStorage,
  notebookToMarkdown,
  notedMoveIds,
  removeEntry,
  resolveAnchor,
  restoreEntry,
  samePosition,
  entriesToKeep,
  type Anchor,
  type NotebookEntry,
} from '../src/core/notebook';
import { diagramFen } from '../src/core/overlay';
import type { BookOverlay, Diagram, MoveNode } from '../src/core/types';

const BOX = { x0: 0, y0: 0, x1: 1, y1: 1 };
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const MY_OWN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

const move = (id: string, fen: string, page: number, san = 'e4', extra: Partial<MoveNode> = {}): MoveNode => ({
  id,
  parentId: null,
  diagramId: null,
  san,
  fen,
  page,
  box: BOX,
  isMainLine: true,
  confidence: 'high',
  ...extra,
});

const diagram = (id: string, page: number): Diagram => ({
  id,
  page,
  box: BOX,
  placement: '4k3/8/8/8/8/8/8/4K3',
  sideToMove: 'w',
  label: null,
  issues: [],
  confidence: 1,
});

const overlay = (moves: MoveNode[], diagrams: Diagram[] = []): BookOverlay => ({
  schemaVersion: 1,
  bookHash: 'h',
  pageCount: 10,
  diagrams,
  moves,
  review: [],
});

const anchor = (extra: Partial<Anchor> = {}): Anchor => ({
  page: 3,
  fen: AFTER_E4,
  bookFen: AFTER_E4,
  moveId: 'm1',
  diagramId: null,
  bookPage: 3,
  label: '1. e4',
  ...extra,
});

const entry = (id: string, extra: Partial<NotebookEntry> = {}): NotebookEntry => ({
  id,
  kind: 'note',
  text: `note ${id}`,
  createdAt: 1,
  updatedAt: 1,
  anchor: anchor(),
  ...extra,
});

describe('samePosition', () => {
  it('ignores the move counters, since a position can be reached by lines of any length', () => {
    expect(samePosition(AFTER_E4, AFTER_E4.replace('0 1', '4 9'))).toBe(true);
  });

  it('tells apart the side to move', () => {
    expect(samePosition(AFTER_E4, AFTER_E4.replace(' b ', ' w '))).toBe(false);
  });

  it('never matches nothing', () => {
    expect(samePosition(null, null)).toBe(false);
    expect(samePosition(AFTER_E4, null)).toBe(false);
  });
});

describe('moveLabel', () => {
  it('writes moves the way a book does', () => {
    expect(moveLabel(move('a', AFTER_E4, 0, 'e4'))).toBe('1. e4');
    expect(moveLabel(move('b', AFTER_E5, 0, 'e5'))).toBe('1... e5');
  });

  it('uses the number printed in the book', () => {
    expect(moveLabel(move('a', AFTER_E4, 0, 'e4', { numberOffset: 11 }))).toBe('12. e4');
  });
});

describe('going back to an entry', () => {
  it('returns to the move it was written on', () => {
    expect(resolveAnchor(overlay([move('m1', AFTER_E4, 3)]), anchor())).toEqual({
      page: 3,
      board: { moveId: 'm1', diagramId: null, exploreFen: null },
    });
  });

  it('finds the move again when a new analysis has changed its id', () => {
    const target = resolveAnchor(overlay([move('other', AFTER_E4, 3)]), anchor());
    expect(target.board).toEqual({ moveId: 'other', diagramId: null, exploreFen: null });
  });

  it('does not trust an id that now leads to another position', () => {
    const target = resolveAnchor(overlay([move('m1', AFTER_E5, 3)]), anchor());
    expect(target.board).toEqual({ moveId: null, diagramId: null, exploreFen: AFTER_E4 });
  });

  it('does not jump to the same position elsewhere in the book', () => {
    const target = resolveAnchor(overlay([move('far', AFTER_E4, 8)]), anchor());
    expect(target.board).toEqual({ moveId: null, diagramId: null, exploreFen: AFTER_E4 });
  });

  it('still shows the saved position when the analysis is gone', () => {
    const target = resolveAnchor(overlay([]), anchor());
    expect(target).toEqual({ page: 3, board: { moveId: null, diagramId: null, exploreFen: AFTER_E4 } });
  });

  it('brings back moves the reader was trying, over the book move they left from', () => {
    const target = resolveAnchor(overlay([move('m1', AFTER_E5, 3)]), anchor({ fen: MY_OWN, bookFen: AFTER_E5 }));
    expect(target.board).toEqual({ moveId: 'm1', diagramId: null, exploreFen: MY_OWN });
  });

  it('brings back moves tried from no book position', () => {
    const target = resolveAnchor(overlay([]), anchor({ fen: MY_OWN, bookFen: null, moveId: null, label: null }));
    expect(target.board).toEqual({ moveId: null, diagramId: null, exploreFen: MY_OWN });
  });

  it('returns to a diagram', () => {
    const book = overlay([], [diagram('d1', 3)]);
    const fen = diagramFen(book, 'd1')!;
    const target = resolveAnchor(book, anchor({ fen, bookFen: fen, moveId: null, diagramId: 'd1', label: null }));
    expect(target.board).toEqual({ moveId: null, diagramId: 'd1', exploreFen: null });
  });

  it('finds a diagram again by its position when its id has changed', () => {
    const book = overlay([], [diagram('new', 3)]);
    const fen = diagramFen(book, 'new')!;
    const target = resolveAnchor(book, anchor({ fen, bookFen: fen, moveId: null, diagramId: 'old', label: null }));
    expect(target.board).toEqual({ moveId: null, diagramId: 'new', exploreFen: null });
  });

  it('shows what was saved when a diagram has since been corrected', () => {
    const book = overlay([], [diagram('d1', 3)]);
    const before = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const target = resolveAnchor(book, anchor({ fen: before, bookFen: before, moveId: null, diagramId: 'd1', label: null }));
    expect(target.board).toEqual({ moveId: null, diagramId: null, exploreFen: before });
  });

  it('returns to a diagram, even if a move on that page reaches the same position', () => {
    const book = overlay([], [diagram('d1', 3)]);
    const fen = diagramFen(book, 'd1')!;
    book.moves.push(move('m9', fen, 3));
    const target = resolveAnchor(book, anchor({ fen, bookFen: fen, moveId: null, diagramId: 'd1', label: null }));
    expect(target.board).toEqual({ moveId: null, diagramId: 'd1', exploreFen: null });
  });

  it('looks on the page of the move, when the note was written on another page', () => {
    const book = overlay([move('renamed', AFTER_E4, 5)]);
    const target = resolveAnchor(book, anchor({ page: 6, bookPage: 5 }));
    expect(target).toEqual({ page: 6, board: { moveId: 'renamed', diagramId: null, exploreFen: null } });
  });

  it('leaves the board alone for a note on a page alone', () => {
    const target = resolveAnchor(overlay([]), anchor({ fen: null, bookFen: null, moveId: null, label: null }));
    expect(target).toEqual({ page: 3, board: null });
  });
});

describe('notedMoveIds', () => {
  it('names the moves that have entries, as they are now', () => {
    const book = overlay([move('renamed', AFTER_E4, 3), move('m2', AFTER_E5, 3)]);
    expect([...notedMoveIds(book, [entry('a')])]).toEqual(['renamed']);
  });

  it('counts a move the reader left to try their own', () => {
    const book = overlay([move('m1', AFTER_E5, 3)]);
    expect([...notedMoveIds(book, [entry('a', { anchor: anchor({ fen: MY_OWN, bookFen: AFTER_E5 }) })])]).toEqual(['m1']);
  });

  it('leaves out notes on a page alone', () => {
    const book = overlay([move('m1', AFTER_E4, 3)]);
    expect(notedMoveIds(book, [entry('a', { anchor: anchor({ fen: null, bookFen: null, moveId: null }) })]).size).toBe(0);
  });
});

describe('changing a notebook', () => {
  const start = addEntry(addEntry(emptyNotebook('h'), entry('a', { createdAt: 1 })), entry('b', { createdAt: 2 }));

  it('keeps entries in the order they were written', () => {
    expect(start.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('edits one entry and notes when', () => {
    const edited = editEntry(start, 'a', 'better', 50);
    expect(edited.entries[0]).toMatchObject({ text: 'better', updatedAt: 50, createdAt: 1 });
    expect(edited.entries[1]).toEqual(start.entries[1]);
  });

  it('puts a removed entry back where it was', () => {
    const removed = start.entries[0]!;
    const restored = restoreEntry(removeEntry(start, 'a'), removed);
    expect(restored.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('does not double an entry that is restored twice', () => {
    expect(restoreEntry(start, start.entries[0]!).entries).toHaveLength(2);
  });

  it('finds a saved position whatever its move counters', () => {
    const saved = entry('p', { kind: 'position' });
    expect(findSavedPosition([entry('a'), saved], AFTER_E4.replace('0 1', '3 7'))).toBe(saved);
  });

  it('does not take a note for a saved position', () => {
    expect(findSavedPosition([entry('a')], AFTER_E4)).toBeNull();
  });
});

describe('notebookFromStorage', () => {
  it('starts empty from nothing', () => {
    expect(notebookFromStorage(undefined, 'h')).toEqual(emptyNotebook('h'));
    expect(notebookFromStorage({ entries: 'nonsense' }, 'h')).toEqual(emptyNotebook('h'));
  });

  it('keeps what has been solved', () => {
    expect(notebookFromStorage({ entries: [], solved: ['a', 3, 'b'] }, 'h').solved).toEqual(['a', 'b']);
  });

  it('keeps good entries and leaves out those it could not show', () => {
    const notebook = notebookFromStorage({ entries: [entry('a'), { id: 'bad' }, null, { ...entry('c'), anchor: { page: 'x' } }] }, 'h');
    expect(notebook.entries.map((e) => e.id)).toEqual(['a']);
  });
});

describe('entriesToKeep', () => {
  it('has nothing to keep from nothing', () => {
    expect(entriesToKeep(undefined)).toEqual([]);
  });

  it('keeps what this version cannot show', () => {
    const chat = { id: 'c', kind: 'chat', text: 'from a later version' };
    expect(entriesToKeep({ schemaVersion: 1, entries: [entry('a'), chat] })).toEqual([chat]);
  });

  it('refuses a notebook from a later version, or one it cannot read', () => {
    expect(entriesToKeep({ schemaVersion: 2, entries: [] })).toBeNull();
    expect(entriesToKeep({ schemaVersion: 1, entries: 'nonsense' })).toBeNull();
    expect(entriesToKeep(null)).toBeNull();
  });
});

describe('notebookToMarkdown', () => {
  const words = { title: 'Notes', page: (page: number) => `Page ${page}`, savedPosition: 'Saved', ownMoves: 'Own', coach: 'Coach' };

  it('follows the order of the book, and then of writing', () => {
    const markdown = notebookToMarkdown(
      [
        entry('late', { text: 'second', createdAt: 5, anchor: anchor({ page: 7 }) }),
        entry('early', { text: 'first', createdAt: 9, anchor: anchor({ page: 2 }) }),
        entry('same', { text: 'third', createdAt: 9, anchor: anchor({ page: 7 }) }),
      ],
      words,
    );
    expect(markdown.indexOf('first')).toBeLessThan(markdown.indexOf('second'));
    expect(markdown.indexOf('second')).toBeLessThan(markdown.indexOf('third'));
  });

  it('says where each entry belongs', () => {
    const markdown = notebookToMarkdown([entry('a', { text: 'an idea' })], words);
    expect(markdown).toBe(`# Notes\n\n## Page 4 · 1. e4\n\n\`${AFTER_E4}\`\n\nan idea\n`);
  });

  it('marks saved positions and the reader\'s own moves', () => {
    const markdown = notebookToMarkdown(
      [entry('a', { kind: 'position', text: '', anchor: anchor({ fen: MY_OWN, bookFen: AFTER_E5 }) })],
      words,
    );
    expect(markdown).toContain('## Page 4 · 1. e4 · Own · Saved');
  });

  it('holds a note on a page alone', () => {
    const markdown = notebookToMarkdown([entry('a', { anchor: anchor({ fen: null, bookFen: null, label: null }) })], words);
    expect(markdown).toBe('# Notes\n\n## Page 4\n\nnote a\n');
  });
});
