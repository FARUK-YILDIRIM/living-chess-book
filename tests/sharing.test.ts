import { describe, expect, it } from 'vitest';
import { emptyNotebook, type NotebookEntry } from '../src/core/notebook';
import { analysisFromFile, analysisToFile, mergeNotebook, notebookFromFile, notebookToFile, NOT_A_FILE, OTHER_BOOK, readerCorrections } from '../src/core/sharing';
import type { BookOverlay, MoveNode } from '../src/core/types';

const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
const move = (id: string, parentId: string | null, san: string, extra: Partial<MoveNode> = {}): MoveNode => ({
  id,
  parentId,
  diagramId: null,
  san,
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  page: 0,
  box,
  isMainLine: true,
  confidence: 'high',
  ...extra,
});
const book = { hash: 'abc', pageCount: 3 };
const overlay = (moves: MoveNode[]): BookOverlay => ({ schemaVersion: 1, bookHash: 'abc', pageCount: 3, diagrams: [], moves, review: [] });

describe('analysis files', () => {
  it('round trips, with positions worked out again', () => {
    const { overlay: read, dropped } = analysisFromFile(analysisToFile(overlay([move('a', null, 'e4'), move('b', 'a', 'e5')])), book);
    expect(dropped).toBe(0);
    expect(read.moves.map((m) => m.fen.split(' ')[0])).toEqual(['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR']);
  });

  it('reads a file saved before this format', () => {
    expect(analysisFromFile(JSON.stringify(overlay([move('a', null, 'd4')])), book).overlay.moves).toHaveLength(1);
  });

  it('refuses a file for another PDF, or another copy of it', () => {
    expect(() => analysisFromFile(analysisToFile(overlay([])), { hash: 'other', pageCount: 3 })).toThrow(OTHER_BOOK);
    expect(() => analysisFromFile(analysisToFile(overlay([])), { hash: 'abc', pageCount: 4 })).toThrow(OTHER_BOOK);
  });

  it('refuses what is not an analysis', () => {
    expect(() => analysisFromFile('not json', book)).toThrow(NOT_A_FILE);
    expect(() => analysisFromFile('{"kind":"living-chess-book-analysis","overlay":{"hello":1}}', book)).toThrow(NOT_A_FILE);
    expect(() => analysisFromFile('{"kind":"chess-coach-analysis","overlay":{"hello":1}}', book)).toThrow(NOT_A_FILE);
  });

  it('drops a move that breaks the rules, with what follows, and asks to check its place', () => {
    const { overlay: read, dropped } = analysisFromFile(analysisToFile(overlay([move('a', null, 'e4'), move('b', 'a', 'Ke2'), move('c', 'b', 'Nf6')])), book);
    expect(read.moves.map((m) => m.id)).toEqual(['a']);
    expect(dropped).toBe(2);
    expect(read.review).toEqual([{ id: 'r-b-imported', reason: 'unresolved-move', page: 0, box, targetId: null }]);
  });

  it('drops moves on pages the PDF does not have, and moves with no start', () => {
    const { overlay: read, dropped } = analysisFromFile(analysisToFile(overlay([move('a', null, 'e4', { page: 9 }), move('x', 'missing', 'e5')])), book);
    expect(read.moves).toEqual([]);
    expect(dropped).toBe(2);
  });

  it('works out a diagram\'s problems again', () => {
    const withDiagram: BookOverlay = {
      ...overlay([]),
      diagrams: [{ id: 'd', page: 1, box, placement: 'KK6/8/8/8/8/8/8/k7', sideToMove: 'w', label: null, issues: [], confidence: 1 }],
    };
    expect(analysisFromFile(analysisToFile(withDiagram), book).overlay.diagrams[0]!.issues).toContain('white king count is 2');
  });

  it('counts the reader\'s own corrections', () => {
    expect(readerCorrections(overlay([move('a', null, 'e4', { source: 'reader' }), move('b', 'a', 'e5', { source: 'llm' })]))).toBe(1);
    expect(readerCorrections(null)).toBe(0);
  });
});

describe('notebook files', () => {
  const entry = (id: string): NotebookEntry => ({
    id,
    kind: 'note',
    text: `note ${id}`,
    createdAt: 1,
    updatedAt: 1,
    anchor: { page: 0, fen: null, bookFen: null, moveId: null, diagramId: null, bookPage: null, label: null },
  });

  it('round trips, and adds only what is missing', () => {
    const saved = { ...emptyNotebook('abc'), entries: [entry('a'), entry('b')], solved: ['k1'] };
    const read = notebookFromFile(notebookToFile(saved), 'abc');
    const { notebook, added } = mergeNotebook({ ...emptyNotebook('abc'), entries: [{ ...entry('a'), text: 'changed here' }], solved: ['k2'] }, read);
    expect(added).toBe(1);
    expect(notebook.entries.map((e) => e.text)).toEqual(['changed here', 'note b']);
    expect(notebook.solved).toEqual(['k2', 'k1']);
  });

  it('refuses a notebook for another PDF', () => {
    expect(() => notebookFromFile(notebookToFile(emptyNotebook('other')), 'abc')).toThrow(OTHER_BOOK);
  });

  it('reads files saved under the working name', () => {
    const analysis = JSON.stringify({ kind: 'chess-coach-analysis', overlay: overlay([move('a', null, 'e4')]) });
    expect(analysisFromFile(analysis, book).overlay.moves).toHaveLength(1);
    const notebook = JSON.stringify({ kind: 'chess-coach-notebook', notebook: { bookHash: 'abc', entries: [entry('a')] } });
    expect(notebookFromFile(notebook, 'abc').entries).toHaveLength(1);
  });

  it('skips entries it cannot read', () => {
    const text = JSON.stringify({ kind: 'living-chess-book-notebook', notebook: { bookHash: 'abc', entries: [entry('a'), { id: 3 }] } });
    expect(notebookFromFile(text, 'abc')).toMatchObject({ skipped: 1, entries: [{ id: 'a' }] });
  });
});
