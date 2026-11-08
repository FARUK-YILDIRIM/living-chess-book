import { decodeLine, GlyphModel, moveFullNumberOffset, PositionCache, type DecodedLine } from './decoder';
import { mergeWords, parseToken } from './tokens';
import type { Box, Color, Diagram, MoveNode, MoveToken, ReviewItem, Word } from './types';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIN_BOLD_GAP = 0.06;
const MAX_MOVE_NUMBER = 150;
const LOW_DIAGRAM_CONFIDENCE = 0.05;
const LEARNING_PASSES = 2;
const MIN_SIDE_LINE_SHARE = 0.5;
/** Below this share of readable moves, a stretch of text is not a line from this position. */
const MIN_MAIN_LINE_SHARE = 0.5;
/**
 * A whole game can follow a diagram that has nothing to do with it. Reading from the initial
 * position instead must fit nearly every move, since short stretches fit by chance.
 */
const MIN_NEW_GAME_SHARE = 0.85;
/** Fewer moves than this can be legal from the initial position by chance. */
const MIN_NEW_GAME_MOVES = 8;

const LABEL_WORDS = ['problem', 'exercise', 'diagram', 'position', 'puzzle', 'example', 'test'];

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function labelWord(text: string): string | null {
  const lower = text.toLowerCase();
  return LABEL_WORDS.find((word) => editDistance(lower, word) <= 2 && lower.length >= 4) ?? null;
}

/** Reads a heading like `Problem #17`. OCR often damages the word. */
export function labelFromWords(words: readonly Word[]): string | null {
  for (let i = 0; i + 1 < words.length; i++) {
    const word = labelWord(words[i]!.text);
    const number = words[i + 1]!.text.match(/^#?\s*(\d{1,4})\b/);
    if (word && number) return `${word} ${Number(number[1])}`;
  }
  return null;
}

/** Reads a caption like `Black to move`. */
export function sideToMoveFromWords(words: readonly Word[]): Color | null {
  const text = words.map((w) => w.text).join(' ');
  const match = text.match(/\b(white|black)\s+to\s+(move|play)\b/i);
  if (!match) return null;
  return match[1]!.toLowerCase() === 'white' ? 'w' : 'b';
}

function pieceAt(rank: string, file: number): string | null {
  let index = 0;
  for (const char of rank) {
    if (/\d/.test(char)) {
      index += Number(char);
    } else {
      if (index === file) return char;
      index++;
    }
  }
  return null;
}

/** Diagrams do not state castling rights, so assume them when the pieces allow it. */
export function fenFromDiagram(placement: string, sideToMove: Color): string {
  const ranks = placement.split('/');
  const black = ranks[0] ?? '';
  const white = ranks[7] ?? '';
  let rights = '';
  if (pieceAt(white, 4) === 'K') {
    if (pieceAt(white, 7) === 'R') rights += 'K';
    if (pieceAt(white, 0) === 'R') rights += 'Q';
  }
  if (pieceAt(black, 4) === 'k') {
    if (pieceAt(black, 7) === 'r') rights += 'k';
    if (pieceAt(black, 0) === 'r') rights += 'q';
  }
  return `${placement} ${sideToMove} ${rights || '-'} - 0 1`;
}

/**
 * Finds the ink level that separates bold main lines from regular text, or null when
 * the book does not use two weights.
 */
export function boldThreshold(inks: readonly number[]): number | null {
  if (inks.length < 2) return null;
  const sorted = inks.slice().sort((a, b) => a - b);

  let bestGapScore = -1;
  let threshold = 0;
  let means: [number, number] = [0, 0];
  const total = sorted.reduce((a, b) => a + b, 0);
  let leftSum = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    leftSum += sorted[i]!;
    const leftCount = i + 1;
    const rightCount = sorted.length - leftCount;
    const leftMean = leftSum / leftCount;
    const rightMean = (total - leftSum) / rightCount;
    const score = leftCount * rightCount * (rightMean - leftMean) ** 2;
    if (score > bestGapScore) {
      bestGapScore = score;
      threshold = (sorted[i]! + sorted[i + 1]!) / 2;
      means = [leftMean, rightMean];
    }
  }
  return means[1] - means[0] >= MIN_BOLD_GAP ? threshold : null;
}

export interface PlacedToken {
  token: MoveToken;
  word: Word;
  /** Tokens with the same run have no prose between them. */
  run: number;
}

export interface Section {
  diagram: Diagram | null;
  tokens: PlacedToken[];
  /** Every word in the stretch, moves and prose alike. */
  words: Word[];
}

function isBelow(word: Word, diagram: Diagram): boolean {
  return word.page > diagram.page || (word.page === diagram.page && word.box.y0 >= diagram.box.y1 - 2);
}

/** Splits a book into stretches of moves that share a starting position. */
export function buildSections(pages: readonly (readonly Word[])[], diagrams: readonly Diagram[]): Section[] {
  const byLabel = new Map<string, Diagram>();
  for (const diagram of diagrams) {
    if (diagram.label && !byLabel.has(diagram.label)) byLabel.set(diagram.label, diagram);
  }

  const sections: Section[] = [{ diagram: null, tokens: [], words: [] }];
  let current = sections[0]!;
  let run = 0;
  let chain = false;

  pages.forEach((pageWords, page) => {
    const pending = diagrams
      .filter((d) => d.page === page)
      .sort((a, b) => a.box.y0 - b.box.y0);
    const startSection = (diagram: Diagram | null) => {
      current = { diagram, tokens: [], words: [] };
      sections.push(current);
      chain = false;
      run++;
    };

    const merged = mergeWords(pageWords);
    merged.forEach((word, index) => {
      while (pending[0] && isBelow(word, pending[0])) startSection(pending.shift()!);

      const heading = labelFromWords(merged.slice(index, index + 2));
      const labelled = heading ? byLabel.get(heading) : undefined;
      if (labelled) {
        startSection(labelled);
        return;
      }

      current.words.push(word);
      const token = parseToken(word.text, word.glyphLost);
      if (!token) {
        if (/^[A-Za-z]{2,}|[A-Za-z]{3}/.test(word.text)) {
          chain = false;
          run++;
        }
        return;
      }
      if (token.moveNumber !== null && token.moveNumber > MAX_MOVE_NUMBER) return;
      if (token.moveNumber === null && !chain) return;

      current.tokens.push({ token, word, run });
      chain = true;
    });
    while (pending[0]) startSection(pending.shift()!);
  });
  return sections;
}

export interface AnalyzeInput {
  /** The words of each page, in reading order. */
  pages: readonly (readonly Word[])[];
  diagrams: readonly Diagram[];
}

export interface WordAnalysis {
  moves: MoveNode[];
  review: ReviewItem[];
}

function decodeFromStarts(
  starts: readonly string[],
  tokens: readonly MoveToken[],
  model: GlyphModel,
  offset: number,
  cache: PositionCache,
  membership: readonly number[],
): { line: DecodedLine; start: string } | null {
  let best: { line: DecodedLine; start: string } | null = null;
  for (const start of starts) {
    const line = decodeLine(start, tokens, { model, offset, cache, membership });
    if (!best || line.score > best.line.score) best = { line, start };
  }
  return best;
}

const startFens = (diagram: Diagram | null): string[] => {
  if (!diagram) return [INITIAL_FEN];
  const sides: Color[] = diagram.sideToMove ? [diagram.sideToMove] : ['w', 'b'];
  return sides.map((side) => fenFromDiagram(diagram.placement, side));
};

const boxOfToken = (token: PlacedToken): Box => token.word.box;

/**
 * A stretch of text can hold several games, each starting again from the same position.
 * Only a return to the very first number counts: side lines also go back a few moves.
 */
function splitAtRestarts(
  placed: readonly PlacedToken[],
  isLikelyMain: (p: PlacedToken) => boolean,
): PlacedToken[][] {
  const segments: PlacedToken[][] = [[]];
  let first: number | null = null;
  let last = 0;
  for (const token of placed) {
    const number = token.token.moveNumber;
    if (number !== null && isLikelyMain(token)) {
      // Move 1 can only start something new, even in a stretch that began mid-game.
      const isRestart = number === first || number === 1;
      if (first !== null && isRestart && last >= (number === 1 ? 1 : first) + MIN_MOVES_BEFORE_RESTART) segments.push([]);
      first ??= number;
      last = number;
    }
    segments[segments.length - 1]!.push(token);
  }
  return segments;
}

/** Tokens this far under the bold threshold are clearly regular text. */
const WEIGHT_MARGIN = 0.03;
const MIN_MOVES_BEFORE_RESTART = 2;
const MAX_SUFFIX_TRIES = 4;
const MIN_SUFFIX_MOVES = 4;

/**
 * Print weight comes from a scan, so one word can look lighter or darker than it is.
 * Main lines run for several moves, so a token's neighbours are good evidence.
 */
function membershipOf(placed: readonly PlacedToken[], threshold: number | null): number[] {
  if (threshold === null) return placed.map(() => 1);
  return placed.map((token, index) => {
    const around = [placed[index - 1], token, placed[index + 1]]
      .filter((p): p is PlacedToken => Boolean(p) && p!.run === token.run)
      .map((p) => p.word.ink)
      .sort((a, b) => a - b);
    const ink = around[Math.floor(around.length / 2)]!;
    return Math.min(1, Math.max(0, (ink - (threshold - WEIGHT_MARGIN)) / WEIGHT_MARGIN));
  });
}

class TreeBuilder {
  readonly moves: MoveNode[] = [];
  readonly review: ReviewItem[] = [];
  private nextId = 0;
  private readonly model: GlyphModel;
  private readonly cache: PositionCache;
  /** The learner for the next pass, fed only with moves that were not in doubt. */
  readonly learned = new GlyphModel();

  constructor(model: GlyphModel, cache: PositionCache) {
    this.model = model;
    this.cache = cache;
  }

  private addStep(
    line: DecodedLine,
    placed: readonly PlacedToken[],
    parent: MoveNode | null,
    diagramId: string | null,
    isMainLine: boolean,
    numberOffset: number,
    optional: ReadonlySet<number> = new Set(),
    allDoubtful = false,
  ): MoveNode[] {
    const nodes: MoveNode[] = [];
    let previous = parent;
    const fallback = placed[0]?.word;
    let hasUnresolvedNote = false;

    line.steps.forEach((step, stepIndex) => {
      if (step.kind === 'skip') {
        // One note per line is enough: a reader checks the place, not each fragment.
        if (!hasUnresolvedNote && !optional.has(step.tokenIndex)) {
          hasUnresolvedNote = true;
          this.addUnresolved(placed[step.tokenIndex]!, previous?.id ?? null);
        }
        return;
      }

      // A filled-in move has no text of its own, so it points at the move after it.
      const nextToken = line.steps.slice(stepIndex).find((s) => s.kind === 'move');
      const sourceIndex = step.kind === 'move' ? step.tokenIndex : nextToken?.kind === 'move' ? nextToken.tokenIndex : -1;
      const source = sourceIndex >= 0 ? placed[sourceIndex] : undefined;
      const word = source?.word ?? fallback;
      if (!word) return;

      const isDoubtful = allDoubtful || step.kind === 'inserted' || step.lowConfidence;
      const node: MoveNode = {
        id: `m${this.nextId++}`,
        parentId: previous?.id ?? null,
        diagramId,
        san: step.san,
        fen: step.fen,
        page: word.page,
        box: word.box,
        isMainLine,
        confidence: isDoubtful ? 'low' : 'high',
        numberOffset,
      };
      this.moves.push(node);
      nodes.push(node);
      previous = node;

      if (isDoubtful) {
        this.review.push({
          id: `r${this.nextId++}`,
          reason: 'low-confidence-move',
          page: node.page,
          box: node.box,
          targetId: node.id,
        });
      }
      if (step.kind === 'move' && !step.lowConfidence) this.learned.observe(step.token.key, step.piece);
    });
    return nodes;
  }

  /**
   * A diagram that cannot be real says nothing about the moves under it, but a game numbered
   * from move 1 can still be read from the initial position.
   */
  addSectionWithoutDiagram(section: Section, threshold: number | null): void {
    const weights = new Map(section.tokens.map((p, i) => [p, membershipOf(section.tokens, threshold)[i]!]));
    for (const segment of splitAtRestarts(section.tokens, (p) => (weights.get(p) ?? 0) >= 0.5)) {
      this.addSegment(segment, null, threshold, true);
    }
  }

  addSection(section: Section, threshold: number | null): void {
    const weights = new Map(section.tokens.map((p, i) => [p, membershipOf(section.tokens, threshold)[i]!]));
    for (const segment of splitAtRestarts(section.tokens, (p) => (weights.get(p) ?? 0) >= 0.5)) {
      this.addSegment(segment, section.diagram, threshold);
    }
  }

  /**
   * Finds the main line of a stretch of text. A book may print the moves leading up to a
   * diagram first, so when the start does not fit, later starting points are tried.
   */
  private decodeSegment(placed: readonly PlacedToken[], diagram: Diagram | null, threshold: number | null, onlyWholeGames = false) {
    const attempt = (from: number, starts = startFens(diagram)) => {
      const part = placed.slice(from);
      const membership = membershipOf(part, threshold);
      const likely = part.filter((_, i) => membership[i]! >= 0.5);
      if (!likely.length) return null;
      const offset = moveFullNumberOffset(likely.map((p) => p.token));
      const decoded = decodeFromStarts(starts, part.map((p) => p.token), this.model, offset, this.cache, membership);
      if (!decoded) return null;
      const readable = decoded.line.steps.filter((s) => s.kind === 'move' && membership[s.tokenIndex]! >= 0.5).length;
      return { part, membership, likely, offset, decoded, readable, share: readable / likely.length };
    };

    const whole = attempt(0);
    const isNumberedFromOne = placed.find((p) => p.token.moveNumber !== null)?.token.moveNumber === 1;
    if (onlyWholeGames) {
      return isNumberedFromOne && whole && whole.share >= MIN_NEW_GAME_SHARE && whole.readable >= MIN_NEW_GAME_MOVES ? whole : null;
    }
    if (diagram && isNumberedFromOne && !startFens(diagram).includes(INITIAL_FEN)) {
      const newGame = attempt(0, [INITIAL_FEN]);
      if (newGame && newGame.share >= MIN_NEW_GAME_SHARE && newGame.readable >= MIN_NEW_GAME_MOVES && newGame.readable > (whole?.readable ?? 0)) return newGame;
    }
    if (whole && whole.share >= MIN_MAIN_LINE_SHARE) return whole;
    if (!diagram) return null;

    const membership = membershipOf(placed, threshold);
    const starts = placed.flatMap((p, i) => (i > 0 && p.token.moveNumber !== null && membership[i]! >= 0.5 ? [i] : []));
    const step = Math.max(1, Math.ceil(starts.length / MAX_SUFFIX_TRIES));
    let best: ReturnType<typeof attempt> = null;
    for (let i = 0; i < starts.length; i += step) {
      const result = attempt(starts[i]!);
      if (result && result.share >= MIN_MAIN_LINE_SHARE && result.readable >= MIN_SUFFIX_MOVES && (!best || result.readable > best.readable)) {
        best = result;
      }
    }
    return best;
  }

  private addSegment(all: readonly PlacedToken[], diagram: Diagram | null, threshold: number | null, onlyWholeGames = false): void {
    if (!all.length) return;
    const found = this.decodeSegment(all, diagram, threshold, onlyWholeGames);
    if (!found) {
      // The diagram's own note already asks the reader to look at this place.
      if (!onlyWholeGames) this.addUnresolved(all[0]!);
      return;
    }
    const { part: placed, membership, offset, decoded } = found;

    const isSideToken = (index: number) => membership[index]! < 0.5;
    const optional = new Set(placed.flatMap((_, index) => (isSideToken(index) ? [index] : [])));
    // A diagram can show the initial position itself, and then the line still belongs to it.
    const isFromDiagram = diagram !== null && startFens(diagram).includes(decoded.start);
    const diagramId = isFromDiagram ? diagram.id : null;
    // With no diagram to confirm where it starts, a reader should look over such a line.
    const mainNodes = this.addStep(decoded.line, placed, null, diagramId, true, offset, optional, onlyWholeGames);
    const sidePlaced = decoded.line.steps.flatMap((step) =>
      step.kind === 'skip' && optional.has(step.tokenIndex) ? [placed[step.tokenIndex]!] : [],
    );

    // Side lines branch from the main line, at the move their number points to.
    const runs = new Map<number, PlacedToken[]>();
    for (const placedToken of sidePlaced) {
      const group = runs.get(placedToken.run) ?? [];
      group.push(placedToken);
      runs.set(placedToken.run, group);
    }

    const known: { fen: string; node: MoveNode | null }[] = [
      { fen: decoded.start, node: null },
      ...mainNodes.map((node) => ({ fen: node.fen, node })),
    ];
    for (const group of runs.values()) {
      const sideTokens = group.map((p) => p.token);
      const number = sideTokens[0]!.moveNumber;
      const fullMove = (fen: string) => Number(fen.split(' ')[5]) + offset;
      const anchors = number === null ? known.slice(-1) : known.filter((k) => fullMove(k.fen) === number);
      if (!anchors.length) continue;

      let best: { line: DecodedLine; anchor: (typeof anchors)[number] } | null = null;
      for (const anchor of anchors) {
        const line = decodeLine(anchor.fen, sideTokens, { model: this.model, offset, cache: this.cache });
        if (!best || line.score > best.line.score) best = { line, anchor };
      }
      const resolved = best!.line.steps.filter((s) => s.kind === 'move').length;
      if (resolved / sideTokens.length < MIN_SIDE_LINE_SHARE) continue;
      const nodes = this.addStep(best!.line, group, best!.anchor.node, diagramId, false, offset);
      known.push(...nodes.map((node) => ({ fen: node.fen, node })));
    }
  }

  private addUnresolved(placed: PlacedToken, targetId: string | null = null): void {
    this.review.push({
      id: `r${this.nextId++}`,
      reason: 'unresolved-move',
      page: placed.word.page,
      box: boxOfToken(placed),
      targetId,
    });
  }
}

function reviewDiagrams(diagrams: readonly Diagram[]): ReviewItem[] {
  return diagrams.flatMap((diagram): ReviewItem[] => {
    const reason = diagram.issues.length
      ? 'invalid-diagram'
      : diagram.confidence < LOW_DIAGRAM_CONFIDENCE
        ? 'low-confidence-diagram'
        : null;
    return reason
      ? [{ id: `rd-${diagram.id}`, reason, page: diagram.page, box: diagram.box, targetId: diagram.id }]
      : [];
  });
}

/**
 * Turns a book's words and diagrams into a move tree. It runs over the book more than
 * once, because what the first pass learns about damaged symbols helps the next.
 */
export function analyzeWords(input: AnalyzeInput, onSection?: (done: number, total: number) => void): WordAnalysis {
  const sections = buildSections(input.pages, input.diagrams);
  const threshold = boldThreshold(sections.flatMap((s) => s.tokens.map((t) => t.word.ink)));

  let model = new GlyphModel();
  const cache = new PositionCache();
  let builder = new TreeBuilder(model, cache);
  for (let pass = 0; pass < LEARNING_PASSES; pass++) {
    builder = new TreeBuilder(model, cache);
    sections.forEach((section, index) => {
      if (section.diagram?.issues.length) builder.addSectionWithoutDiagram(section, threshold);
      else builder.addSection(section, threshold);
      onSection?.(pass * sections.length + index + 1, LEARNING_PASSES * sections.length);
    });
    model = builder.learned;
  }

  return { moves: builder.moves, review: [...reviewDiagrams(input.diagrams), ...builder.review] };
}
