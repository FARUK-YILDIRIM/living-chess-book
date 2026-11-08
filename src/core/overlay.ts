import { Chess } from 'chess.js';
import { checkPlacement } from '../vision/placement';
import { fenFromDiagram } from './book';
import type { BookOverlay, Color, MoveNode, ReviewItem } from './types';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const OVERLAY_FIELDS = ['schemaVersion', 'bookHash', 'pageCount', 'diagrams', 'moves', 'review'];
const DIAGRAM_FIELDS = ['id', 'page', 'box', 'placement', 'sideToMove', 'label', 'issues', 'confidence'];
const MOVE_FIELDS = [
  'id',
  'parentId',
  'diagramId',
  'san',
  'fen',
  'page',
  'box',
  'isMainLine',
  'confidence',
  'numberOffset',
  'source',
];
const REVIEW_FIELDS = ['id', 'reason', 'page', 'box', 'targetId'];
const BOX_FIELDS = ['x0', 'y0', 'x1', 'y1'];

const byId = (overlay: BookOverlay, id: string) => overlay.moves.find((m) => m.id === id) ?? null;

/** The number printed in the book. A stored position is after its move, so it names the opponent. */
export function moveNumber(move: MoveNode): { number: number; movedWhite: boolean } {
  const [, side, , , , full] = move.fen.split(' ');
  const movedWhite = side === 'b';
  return { number: (movedWhite ? Number(full) : Number(full) - 1) + (move.numberOffset ?? 0), movedWhite };
}

/** The moves after a move, or the first moves of the book for null. Main line first. */
export function nextMoves(overlay: BookOverlay, moveId: string | null): MoveNode[] {
  return overlay.moves
    .filter((m) => m.parentId === moveId)
    .sort((a, b) => Number(b.isMainLine) - Number(a.isMainLine));
}

export function previousMove(overlay: BookOverlay, moveId: string): MoveNode | null {
  const move = byId(overlay, moveId);
  return move?.parentId ? byId(overlay, move.parentId) : null;
}

/** The whole line through a move: back to its start, then forward along the main line. */
export function findBookLine(overlay: BookOverlay, moveId: string): MoveNode[] {
  const line: MoveNode[] = [];
  for (let move = byId(overlay, moveId); move; move = move.parentId ? byId(overlay, move.parentId) : null) {
    line.unshift(move);
  }
  for (let next = nextMoves(overlay, moveId)[0]; next; next = nextMoves(overlay, next.id)[0]) {
    line.push(next);
  }
  return line;
}

/** The position a line starts from. */
export function startFenOf(overlay: BookOverlay, move: MoveNode): string {
  if (!move.diagramId) return INITIAL_FEN;
  const diagram = overlay.diagrams.find((d) => d.id === move.diagramId);
  if (!diagram) return INITIAL_FEN;
  return fenFromDiagram(diagram.placement, diagram.sideToMove ?? turnOfFirstMove(move));
}

/** A diagram with no caption takes its side to move from the move stored after it. */
function turnOfFirstMove(move: MoveNode): Color {
  return move.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

/** The position a diagram shows, with the side to move taken from its line if not printed. */
export function diagramFen(overlay: BookOverlay, diagramId: string): string | null {
  const diagram = overlay.diagrams.find((d) => d.id === diagramId);
  if (!diagram) return null;
  const firstMove = overlay.moves.find((m) => m.diagramId === diagramId && m.parentId === null);
  const side = diagram.sideToMove ?? (firstMove ? turnOfFirstMove(firstMove) : 'w');
  return fenFromDiagram(diagram.placement, side);
}

function fenBefore(overlay: BookOverlay, move: MoveNode): string {
  const parent = move.parentId ? byId(overlay, move.parentId) : null;
  return parent ? parent.fen : startFenOf(overlay, move);
}

/** The moves a reader can choose from when correcting a move. */
export function legalAlternatives(overlay: BookOverlay, moveId: string): string[] {
  const move = byId(overlay, moveId);
  if (!move) return [];
  try {
    return new Chess(fenBefore(overlay, move)).moves();
  } catch {
    return [];
  }
}

export function play(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move(san);
    return chess.fen();
  } catch {
    return null;
  }
}

/** Replays a move's descendants. Moves that are no longer legal go to the review queue. */
function replayChildren(overlay: BookOverlay, parent: MoveNode, fen: string, keep: Map<string, MoveNode>): void {
  for (const child of overlay.moves.filter((m) => m.parentId === parent.id)) {
    const next = play(fen, child.san);
    if (next === null) {
      overlay.review.push({
        id: `r-${child.id}-replay`,
        reason: 'unresolved-move',
        page: child.page,
        box: child.box,
        targetId: parent.id,
      });
      continue;
    }
    const updated = { ...child, fen: next };
    keep.set(child.id, updated);
    replayChildren(overlay, updated, next, keep);
  }
}

/** Removes notes about moves that no longer exist, and keeps notes about their place. */
export function settleReview(overlay: BookOverlay): BookOverlay {
  const targets = new Set([...overlay.moves.map((m) => m.id), ...overlay.diagrams.map((d) => d.id)]);
  const seen = new Set<string>();
  const review = overlay.review.flatMap((item) => {
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    if (item.targetId === null || targets.has(item.targetId)) return [item];
    return item.reason === 'unresolved-move' ? [{ ...item, targetId: null }] : [];
  });
  return { ...overlay, review };
}

function withoutReviewFor(overlay: BookOverlay, targetId: string): BookOverlay {
  return { ...overlay, review: overlay.review.filter((r) => r.targetId !== targetId) };
}

/** Applies a reader's correction to a move, and replays everything that follows it. */
export function correctMove(overlay: BookOverlay, moveId: string, san: string): BookOverlay {
  const move = byId(overlay, moveId);
  if (!move) throw new Error(`No move ${moveId}`);
  const fen = play(fenBefore(overlay, move), san);
  if (fen === null) throw new Error(`${san} is not legal here`);

  const cleared = withoutReviewFor(overlay, moveId);
  const draft: BookOverlay = { ...cleared, review: cleared.review.slice() };
  const updated: MoveNode = { ...move, san, fen, confidence: 'high', source: 'reader' };

  const replayed = new Map<string, MoveNode>([[moveId, updated]]);
  replayChildren(draft, updated, fen, replayed);

  const descendants = new Set<string>();
  const collect = (id: string) => {
    for (const child of overlay.moves.filter((m) => m.parentId === id)) {
      descendants.add(child.id);
      collect(child.id);
    }
  };
  collect(moveId);

  return settleReview({
    ...draft,
    moves: overlay.moves.flatMap((m) => {
      if (m.id === moveId) return [updated];
      if (!descendants.has(m.id)) return [m];
      const kept = replayed.get(m.id);
      return kept ? [kept] : [];
    }),
  });
}

/** Applies a reader's correction to a diagram, and replays the lines that start from it. */
export function correctDiagram(
  overlay: BookOverlay,
  diagramId: string,
  placement: string,
  sideToMove: Color,
): BookOverlay {
  const issues = checkPlacement(placement);
  const diagrams = overlay.diagrams.map((d) =>
    d.id === diagramId ? { ...d, placement, sideToMove, issues, confidence: 1 } : d,
  );
  // A position that cannot be real has no legal moves, so its lines stay as they were.
  if (issues.length) return { ...overlay, diagrams };

  const draft: BookOverlay = {
    ...overlay,
    diagrams,
    review: overlay.review.filter((r) => r.targetId !== diagramId),
  };

  const replayed = new Map<string, MoveNode>();
  const dropped = new Set<string>();
  const start = fenFromDiagram(placement, sideToMove);
  for (const root of overlay.moves.filter((m) => m.parentId === null && m.diagramId === diagramId)) {
    const fen = play(start, root.san);
    if (fen === null) {
      dropped.add(root.id);
      draft.review.push({
        id: `r-${root.id}-replay`,
        reason: 'unresolved-move',
        page: root.page,
        box: root.box,
        targetId: null,
      });
      continue;
    }
    const updated = { ...root, fen };
    replayed.set(root.id, updated);
    replayChildren(draft, updated, fen, replayed);
  }

  const belongsToDiagram = (move: MoveNode) => move.diagramId === diagramId;
  return settleReview({
    ...draft,
    moves: overlay.moves.flatMap((m) => {
      if (!belongsToDiagram(m)) return [m];
      const kept = replayed.get(m.id);
      return kept ? [kept] : [];
    }),
  });
}

export function dismissReview(overlay: BookOverlay, reviewId: string): BookOverlay {
  return { ...overlay, review: overlay.review.filter((r) => r.id !== reviewId) };
}

/** Where the board was in a book: a move, or a diagram before its first move. */
export interface BookPlace {
  moveId: string | null;
  diagramId: string | null;
}

/** The same place in this analysis, or null if it is gone, as after a new analysis. */
export function placeIn(overlay: BookOverlay, place: BookPlace): BookPlace | null {
  const move = place.moveId ? overlay.moves.find((m) => m.id === place.moveId) : undefined;
  if (move) return { moveId: move.id, diagramId: move.diagramId };
  if (!place.moveId && place.diagramId && overlay.diagrams.some((d) => d.id === place.diagramId)) return { moveId: null, diagramId: place.diagramId };
  return null;
}

/** What is left to check, in reading order. */
export function reviewInOrder(overlay: BookOverlay): ReviewItem[] {
  return overlay.review.slice().sort((a, b) => a.page - b.page || a.box.y0 - b.box.y0);
}

/** Where to start checking: here or further on, and otherwise from the start of the book. */
export function firstReviewFrom(items: readonly ReviewItem[], page: number): ReviewItem | null {
  return items.find((item) => item.page >= page) ?? items[0] ?? null;
}

export function overlayToJson(overlay: BookOverlay): string {
  return JSON.stringify(overlay);
}

function assertFields(value: unknown, allowed: readonly string[], name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`Not an overlay file: bad ${name}`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unexpected field in overlay file: ${name}.${key}`);
  }
}

function assertText(value: unknown, pattern: RegExp, name: string): void {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Unexpected value in overlay file: ${name}`);
}

const ID = /^[\w-]{1,64}$/;
const SAN = /^[a-hKQRBNO0-8x=+#-]{2,10}$/;
const FEN = /^[pnbrqkPNBRQK1-8/]{15,71} [wb] [KQkq-]{1,4} [a-h1-8-]{1,2} \d{1,4} \d{1,4}$/;
const PLACEMENT = /^[pnbrqkPNBRQK1-8/]{15,71}$/;
const LABEL = /^[a-z]{1,12} \d{1,4}$/;
const ISSUE = /^[a-z0-9 ]{1,64}$/;

function assertOptionalId(value: unknown, name: string): void {
  if (value !== null) assertText(value, ID, name);
}

function assertBox(value: unknown): void {
  assertFields(value, BOX_FIELDS, 'box');
  for (const key of BOX_FIELDS) {
    if (typeof value[key] !== 'number') throw new Error('Unexpected value in overlay file: box');
  }
}

/**
 * Reads an overlay file. Every field is checked, and text fields must look like what they
 * claim to be, so that a shared file cannot carry the text of a book (see ADR-0006).
 */
export function overlayFromJson(json: string): BookOverlay {
  const parsed: unknown = JSON.parse(json);
  assertFields(parsed, OVERLAY_FIELDS, 'overlay');
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.moves) || !Array.isArray(parsed.diagrams) || !Array.isArray(parsed.review)) {
    throw new Error('Not an overlay file');
  }
  assertText(parsed.bookHash, ID, 'bookHash');

  for (const diagram of parsed.diagrams as unknown[]) {
    assertFields(diagram, DIAGRAM_FIELDS, 'diagram');
    assertText(diagram.id, ID, 'diagram.id');
    assertText(diagram.placement, PLACEMENT, 'diagram.placement');
    if (diagram.label !== null) assertText(diagram.label, LABEL, 'diagram.label');
    if (!Array.isArray(diagram.issues)) throw new Error('Unexpected value in overlay file: diagram.issues');
    for (const issue of diagram.issues as unknown[]) assertText(issue, ISSUE, 'diagram.issues');
    assertBox(diagram.box);
  }
  for (const move of parsed.moves as unknown[]) {
    assertFields(move, MOVE_FIELDS, 'move');
    assertText(move.id, ID, 'move.id');
    assertOptionalId(move.parentId, 'move.parentId');
    assertOptionalId(move.diagramId, 'move.diagramId');
    assertText(move.san, SAN, 'move.san');
    assertText(move.fen, FEN, 'move.fen');
    if (move.source !== undefined && move.source !== 'reader' && move.source !== 'llm') {
      throw new Error('Unexpected value in overlay file: move.source');
    }
    assertBox(move.box);
  }
  for (const item of parsed.review as unknown[]) {
    assertFields(item, REVIEW_FIELDS, 'review');
    assertText(item.id, ID, 'review.id');
    assertOptionalId(item.targetId, 'review.targetId');
    assertBox(item.box);
  }
  return parsed as unknown as BookOverlay;
}
