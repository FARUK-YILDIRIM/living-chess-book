import { Chess } from 'chess.js';
import { buildSections, fenFromDiagram, type PlacedToken } from './book';
import { settleReview } from './overlay';
import type { BookOverlay, Box, Color, MoveNode, ReviewItem, Word } from './types';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Fewer moves than this are usually a passing mention, not a line worth paying to read. */
const MIN_JOB_TOKENS = 3;
const MAX_REGIONS_PER_JOB = 3;
const REGION_MARGIN = 8;
const MAX_LINES = 10;
const MAX_MOVES_PER_LINE = 400;
const MAX_MOVE_NUMBER = 500;
const LEGAL_MOVES_IN_HINT = 80;
/**
 * A model is told to stop at a move it cannot read, so a short reply can look complete. OCR
 * can also pad a line with side-line moves, so a somewhat shorter reply may well be right.
 */
const MIN_SHARE_OF_OLD_LINE = 0.6;

export type RepairScope = 'flagged' | 'all';

export interface JobRegion {
  page: number;
  box: Box;
}

export interface JobToken {
  to: string | null;
  castle: 'k' | 'q' | null;
  page: number;
  box: Box;
}

/** One stretch of text to read again, and the position its moves start from. */
export interface RepairJob {
  id: string;
  diagramId: string | null;
  label: string | null;
  /** Two when a diagram does not say whose move it is. */
  startFens: string[];
  regions: JobRegion[];
  tokens: JobToken[];
  /** The moves of this stretch now in the overlay. */
  moveIds: string[];
}

export interface FoundJobs {
  jobs: RepairJob[];
  /** Stretches left out because they run over too many pages to send at once. */
  tooLong: number;
}

const keyOf = (page: number, box: Box) => `${page}:${box.x0}:${box.y0}`;

function regionsOf(words: readonly Word[], tokens: readonly PlacedToken[]): JobRegion[] {
  const pages = [...new Set(tokens.map((t) => t.word.page))].sort((a, b) => a - b);
  return pages.map((page) => {
    const onPage = words.filter((w) => w.page === page);
    return {
      page,
      box: {
        x0: Math.min(...onPage.map((w) => w.box.x0)) - REGION_MARGIN,
        y0: Math.min(...onPage.map((w) => w.box.y0)) - REGION_MARGIN,
        x1: Math.max(...onPage.map((w) => w.box.x1)) + REGION_MARGIN,
        y1: Math.max(...onPage.map((w) => w.box.y1)) + REGION_MARGIN,
      },
    };
  });
}

/**
 * Finds the stretches of a book to read again. Stretches with a reader's correction are
 * always left alone, as are those already read by a model.
 */
export function findRepairJobs(
  overlay: BookOverlay,
  pages: readonly (readonly Word[])[],
  scope: RepairScope = 'flagged',
): FoundJobs {
  const jobs: RepairJob[] = [];
  let tooLong = 0;
  const unresolved = new Set(
    overlay.review.filter((r) => r.reason === 'unresolved-move').map((r) => keyOf(r.page, r.box)),
  );

  for (const section of buildSections(pages, overlay.diagrams)) {
    const { diagram, tokens } = section;
    if (diagram?.issues.length || tokens.length < MIN_JOB_TOKENS) continue;

    const keys = new Set(tokens.map((t) => keyOf(t.word.page, t.word.box)));
    const diagramId = diagram?.id ?? null;
    const own = overlay.moves.filter((m) => m.diagramId === diagramId && keys.has(keyOf(m.page, m.box)));
    if (own.some((m) => m.source)) continue;

    const main = own.filter((m) => m.isMainLine);
    const isFlagged =
      main.length === 0 || main.some((m) => m.confidence === 'low') || [...keys].some((key) => unresolved.has(key));
    if (scope === 'flagged' && !isFlagged) continue;

    const regions = regionsOf(section.words, tokens);
    if (regions.length > MAX_REGIONS_PER_JOB) {
      tooLong++;
      continue;
    }

    const first = tokens[0]!.word;
    const sides: Color[] = diagram ? (diagram.sideToMove ? [diagram.sideToMove] : ['w', 'b']) : ['w'];
    jobs.push({
      id: `j${first.page}-${Math.round(first.box.y0)}-${Math.round(first.box.x0)}`,
      diagramId,
      label: diagram?.label ?? null,
      startFens: diagram ? sides.map((side) => fenFromDiagram(diagram.placement, side)) : [INITIAL_FEN],
      regions,
      tokens: tokens.map(({ token, word }) => ({ to: token.to, castle: token.castle, page: word.page, box: word.box })),
      moveIds: own.map((m) => m.id),
    });
  }
  return { jobs, tooLong };
}

export interface ReplyLine {
  /** The number printed on the first move, or 0 when none can be read. */
  firstMoveNumber: number;
  moves: string[];
}

/** Reads a model's reply. Anything but move notation is dropped. Throws when it is not usable. */
export function parseLineReply(text: string): ReplyLine[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The reply held no JSON');
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const lines = (parsed as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) throw new Error('The reply held no lines');

  return lines.slice(0, MAX_LINES).map((line: unknown): ReplyLine => {
    const { firstMoveNumber, moves } = (line ?? {}) as { firstMoveNumber?: unknown; moves?: unknown };
    if (!Array.isArray(moves) || !moves.every((m) => typeof m === 'string')) {
      throw new Error('The reply has a line with no moves');
    }
    const isNumber = typeof firstMoveNumber === 'number' && Number.isInteger(firstMoveNumber);
    return {
      firstMoveNumber: isNumber && firstMoveNumber > 0 && firstMoveNumber <= MAX_MOVE_NUMBER ? firstMoveNumber : 0,
      moves: (moves as string[]).slice(0, MAX_MOVES_PER_LINE),
    };
  });
}

const FIGURINES: Record<string, string> = { '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N' };

/** Puts a move as printed into the form chess.js reads. */
export function normalizeSan(text: string): string {
  return text
    .trim()
    .replace(/[♔-♞]/g, (figure) => FIGURINES[figure] ?? '')
    .replace(/\s*e\.p\.?$/i, '')
    .replace(/[!?]+$/, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/([a-h][18])([QRBN])(?=[+#]?$)/, '$1=$2')
    .trim();
}

interface PlayedMove {
  san: string;
  fen: string;
  to: string;
  castle: 'k' | 'q' | null;
}

export interface IllegalMove {
  lineIndex: number;
  moveIndex: number;
  san: string;
  fen: string;
  legal: string[];
}

function replay(startFen: string, moves: readonly string[]): { played: PlayedMove[]; illegalAt: number | null; fen: string } {
  const played: PlayedMove[] = [];
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return { played, illegalAt: moves.length ? 0 : null, fen: startFen };
  }
  for (let i = 0; i < moves.length; i++) {
    try {
      const san = normalizeSan(moves[i]!);
      // chess.js reads these as a null move, which no printed line can contain.
      if (san === '--' || san === 'Z0') throw new Error('Not a move');
      const move = chess.move(san);
      const castle = move.san.startsWith('O-O-O') ? 'q' : move.san.startsWith('O-O') ? 'k' : null;
      played.push({ san: move.san, fen: chess.fen(), to: move.to, castle });
    } catch {
      return { played, illegalAt: i, fen: chess.fen() };
    }
  }
  return { played, illegalAt: null, fen: chess.fen() };
}

export interface CheckedLine {
  startFen: string;
  firstMoveNumber: number;
  played: PlayedMove[];
  /** True when the reply held more moves than could be played. */
  isCut: boolean;
}

export interface CheckedReply {
  lines: CheckedLine[];
  illegal: IllegalMove | null;
}

/** Replays a reply on the board, from whichever start gets further. */
export function checkReply(job: RepairJob, lines: readonly ReplyLine[]): CheckedReply {
  const checked: CheckedLine[] = [];
  let illegal: IllegalMove | null = null;

  lines.forEach((line, lineIndex) => {
    if (!line.moves.length) return;
    let best: { startFen: string; result: ReturnType<typeof replay> } | null = null;
    for (const startFen of job.startFens) {
      const result = replay(startFen, line.moves);
      if (!best || result.played.length > best.result.played.length) best = { startFen, result };
    }
    const { startFen, result } = best!;
    checked.push({
      startFen,
      firstMoveNumber: line.firstMoveNumber,
      played: result.played,
      isCut: result.illegalAt !== null,
    });
    if (result.illegalAt !== null && !illegal) {
      illegal = {
        lineIndex,
        moveIndex: result.illegalAt,
        san: line.moves[result.illegalAt]!,
        fen: result.fen,
        legal: legalMoves(result.fen),
      };
    }
  });
  return { lines: checked, illegal };
}

function legalMoves(fen: string): string[] {
  try {
    return new Chess(fen).moves().slice(0, LEGAL_MOVES_IN_HINT);
  } catch {
    return [];
  }
}

/**
 * Matches moves to the words on the page by destination square, keeping their order. OCR
 * mangles piece symbols far more often than squares, so a square is good evidence. Returns
 * the token index of each move, or -1.
 */
export function alignToTokens(
  moves: readonly Pick<PlayedMove, 'to' | 'castle'>[],
  tokens: readonly Pick<JobToken, 'to' | 'castle'>[],
): number[] {
  const matches = (m: number, t: number) =>
    moves[m]!.castle ? moves[m]!.castle === tokens[t]!.castle : moves[m]!.to === tokens[t]!.to;

  const rows = moves.length + 1;
  const columns = tokens.length + 1;
  const best = new Uint16Array(rows * columns);
  for (let m = moves.length - 1; m >= 0; m--) {
    for (let t = tokens.length - 1; t >= 0; t--) {
      const skip = Math.max(best[(m + 1) * columns + t]!, best[m * columns + t + 1]!);
      const take = matches(m, t) ? best[(m + 1) * columns + t + 1]! + 1 : 0;
      best[m * columns + t] = Math.max(skip, take);
    }
  }

  const aligned = new Array<number>(moves.length).fill(-1);
  let m = 0;
  let t = 0;
  while (m < moves.length && t < tokens.length) {
    if (matches(m, t) && best[m * columns + t] === best[(m + 1) * columns + t + 1]! + 1) {
      aligned[m] = t;
      m++;
      t++;
    } else if (best[(m + 1) * columns + t] === best[m * columns + t]) {
      m++;
    } else {
      t++;
    }
  }
  return aligned;
}

export type RepairOutcome = 'replaced' | 'nothing-read' | 'kept-longer' | 'changed-meanwhile';

export interface RepairResult {
  overlay: BookOverlay;
  outcome: RepairOutcome;
  moves: number;
  confirmed: number;
  flagged: number;
}

const positionOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Replaces a stretch's main lines with what a model read, keeping side lines where they still fit. */
export function applyRepair(overlay: BookOverlay, job: RepairJob, reply: CheckedReply): RepairResult {
  const usable = reply.lines.filter((line) => line.played.length);
  const none = { moves: 0, confirmed: 0, flagged: 0 };
  if (!usable.length || !job.tokens.length) return { overlay, outcome: 'nothing-read', ...none };

  const ownIds = new Set(job.moveIds);
  const own = overlay.moves.filter((m) => ownIds.has(m.id));
  const oldMain = own.filter((m) => m.isMainLine);
  const readCount = usable.reduce((sum, line) => sum + line.played.length, 0);

  // The book may have changed while a model was reading: a reader's work always wins.
  const diagram = overlay.diagrams.find((d) => d.id === job.diagramId);
  const isStartGone = diagram && !job.startFens.some((fen) => fen.startsWith(`${diagram.placement} ${diagram.sideToMove ?? ''}`));
  if (own.some((m) => m.source) || isStartGone) return { overlay, outcome: 'changed-meanwhile', ...none };

  const isShorter = readCount < oldMain.length;
  const isCut = usable.some((line) => line.isCut);
  if (isShorter && (isCut || readCount < oldMain.length * MIN_SHARE_OF_OLD_LINE)) {
    return { overlay, outcome: 'kept-longer', ...none };
  }

  const added: MoveNode[] = [];
  const notes: ReviewItem[] = [];
  let confirmed = 0;
  let flagged = 0;
  let tokenStart = 0;

  usable.forEach((line, lineIndex) => {
    const rest = job.tokens.slice(tokenStart);
    const aligned = alignToTokens(line.played, rest);
    const placeFrom = (index: number) => {
      const after = aligned.slice(index).find((t) => t >= 0);
      if (after !== undefined) return rest[after]!;
      const before = aligned.slice(0, index).reverse().find((t) => t >= 0);
      return before !== undefined ? rest[before]! : (rest[0] ?? job.tokens[0]!);
    };

    const startNumber = Number(line.startFen.split(' ')[5]);
    const numberOffset = line.firstMoveNumber ? line.firstMoveNumber - startNumber : 0;
    let parentId: string | null = null;
    line.played.forEach((move, index) => {
      const token = placeFrom(index);
      const isConfirmed = aligned[index]! >= 0;
      const id = `${job.id}-${lineIndex}-${index}`;
      added.push({
        id,
        parentId,
        diagramId: job.diagramId,
        san: move.san,
        fen: move.fen,
        page: token.page,
        box: token.box,
        isMainLine: true,
        confidence: isConfirmed ? 'high' : 'low',
        numberOffset,
        source: 'llm',
      });
      if (isConfirmed) {
        confirmed++;
      } else {
        flagged++;
        notes.push({ id: `r${id}`, reason: 'low-confidence-move', page: token.page, box: token.box, targetId: id });
      }
      parentId = id;
    });

    const last = aligned.filter((t) => t >= 0).at(-1);
    if (last !== undefined) tokenStart += last + 1;
    if (line.isCut) {
      const token = placeFrom(line.played.length - 1);
      notes.push({ id: `r${job.id}-${lineIndex}-cut`, reason: 'unresolved-move', page: token.page, box: token.box, targetId: parentId });
    }
  });

  if (isShorter && !isCut) {
    const place = added.at(-1)!;
    notes.push({ id: `r${job.id}-shorter`, reason: 'unresolved-move', page: place.page, box: place.box, targetId: place.id });
  }

  // Side lines follow their position to the new main line, or leave a note behind.
  const removed = new Set(oldMain.map((m) => m.id));
  const newByPosition = new Map(added.slice().reverse().map((m) => [positionOf(m.fen), m.id]));
  const starts = new Set(job.startFens.map(positionOf));
  const byId = new Map(overlay.moves.map((m) => [m.id, m]));
  const reattached = new Map<string, string | null>();
  const dropped = new Set<string>();

  for (const side of own.filter((m) => !m.isMainLine)) {
    const parent = side.parentId ? byId.get(side.parentId) : null;
    if (parent && !removed.has(parent.id)) continue;
    const before = parent ? positionOf(parent.fen) : null;
    const newParent = before ? newByPosition.get(before) : undefined;
    if (newParent) {
      reattached.set(side.id, newParent);
    } else if (!before || starts.has(before)) {
      reattached.set(side.id, null);
    } else {
      dropped.add(side.id);
      notes.push({ id: `r${job.id}-side-${side.id}`, reason: 'unresolved-move', page: side.page, box: side.box, targetId: null });
    }
  }
  for (const side of own.filter((m) => !m.isMainLine)) {
    if (side.parentId && dropped.has(side.parentId)) dropped.add(side.id);
  }

  const tokenKeys = new Set(job.tokens.map((t) => keyOf(t.page, t.box)));
  // The new line takes the old one's place, since order decides which line comes first.
  const firstRemoved = overlay.moves.find((m) => removed.has(m.id))?.id;
  const moves = overlay.moves.flatMap((m) => {
    if (m.id === firstRemoved) return added;
    if (removed.has(m.id) || dropped.has(m.id)) return [];
    return reattached.has(m.id) ? [{ ...m, parentId: reattached.get(m.id)! }] : [m];
  });
  if (!firstRemoved) moves.push(...added);
  const review = overlay.review.filter((r) => {
    if (r.targetId && (removed.has(r.targetId) || dropped.has(r.targetId))) return false;
    // A note about a side line stays, because side lines are not read again.
    if (r.targetId) return true;
    return !(r.reason === 'unresolved-move' && tokenKeys.has(keyOf(r.page, r.box)));
  });

  return {
    overlay: settleReview({ ...overlay, moves, review: [...review, ...notes] }),
    outcome: 'replaced',
    moves: readCount,
    confirmed,
    flagged,
  };
}
