import type { GrayImage, PixelBox } from './gray';
import { PIECE_SEEDS, PIECE_SEED_SIZE } from './pieceSeeds';

const SIZE = PIECE_SEED_SIZE;
const MAX_SHIFT = 2;
const EDGE = 2;
const SELF_TRAINING_ROUNDS = 2;
const TRAINING_MARGIN = 1.5;
const MIN_TRAINING_TILES = 3;
const MAX_TRAINING_TILES = 200;
/** Blurred outlines are faint, so anything visibly darker than paper counts as a wall. */
const OUTLINE_DARK = 225;
const EMPTY = '.';
const MAX_EMPTY_SAMPLES = 2000;
/** How different from an empty square a tile must be to hold a piece. */
const PIECE_DISTANCE = 500;
const RULE_PENALTY = 100000;
/** How similar two tiles must be to show the same printed piece. */
const SAME_PIECE_DISTANCE = 900;
const MERGE_DISTANCE = 700;
const FOREGROUND_DARK = 200;
/** Black pieces are mostly ink at their center, and white ones mostly paper. */
const BLACK_PIECE_BRIGHTNESS = 135;
/** Darker than any anti-aliased outline. */
const SOLID_DARK = 100;
/** With fewer shapes than this, a split rests on too little to beat looking at each center. */
const MIN_SHAPES_TO_SPLIT = 6;
/** No printed piece is this solid, so anything darker is a smudge that should not pull the split. */
const MAX_PIECE_SHARE = 0.5;
const MIN_PER_COLOR = 2;
const MIN_COLOR_DISTANCE = 0.1;
/** A few stray tiles on a back rank say little about a shape seen hundreds of times. */
const MIN_BACK_RANK_SHARE = 0.1;
/** Tiny clusters are usually print damage or text mistaken for a board. */
const MIN_CLUSTER_SHARE = 0.01;

export type Tile = Float32Array;
export type BoardTiles = Tile[];

export interface BoardResult {
  labels: string[];
  /** The lowest square confidence on the board, from 0 to 1. */
  confidence: number;
}

/** One printed piece shape found in a book, with the app's guess at what it is. */
export interface PieceCluster {
  id: number;
  template: Tile;
  count: number;
  /** The app's guess, which the reader can correct on the calibration screen. */
  label: string;
}

export interface Calibration {
  clusters: PieceCluster[];
  emptyLight: Tile;
  emptyDark: Tile;
}

/** True for dark squares, with a8 at index 0 and a8 being a light square. */
const isDarkSquare = (index: number) => (Math.floor(index / 8) + (index % 8)) % 2 === 1;

/** Cuts a board into 64 small tiles, removing its frame. */
export function sliceBoard(image: GrayImage, box: PixelBox): BoardTiles {
  const inset = Math.max(3, Math.round((box.x1 - box.x0) * 0.012));
  const x0 = box.x0 + inset;
  const y0 = box.y0 + inset;
  const cell = (box.x1 - box.x0 - inset * 2) / 8;
  const cellHeight = (box.y1 - box.y0 - inset * 2) / 8;

  const tiles: BoardTiles = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const tile = new Float32Array(SIZE * SIZE);
      const left = x0 + file * cell;
      const top = y0 + rank * cellHeight;
      for (let y = 0; y < SIZE; y++) {
        const fromY = Math.floor(top + (y * cellHeight) / SIZE);
        const toY = Math.max(fromY + 1, Math.floor(top + ((y + 1) * cellHeight) / SIZE));
        for (let x = 0; x < SIZE; x++) {
          const fromX = Math.floor(left + (x * cell) / SIZE);
          const toX = Math.max(fromX + 1, Math.floor(left + ((x + 1) * cell) / SIZE));
          let sum = 0;
          let count = 0;
          for (let py = fromY; py < toY && py < image.height; py++) {
            for (let px = fromX; px < toX && px < image.width; px++) {
              sum += image.data[py * image.width + px]!;
              count++;
            }
          }
          tile[y * SIZE + x] = count ? sum / count : 255;
        }
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

/** Mean squared difference with `tile` moved by a small offset, ignoring the edges. */
function distanceAt(template: Tile, tile: Tile, dx: number, dy: number): number {
  let sum = 0;
  let count = 0;
  for (let y = EDGE; y < SIZE - EDGE; y++) {
    const sourceY = y - dy;
    if (sourceY < 0 || sourceY >= SIZE) continue;
    for (let x = EDGE; x < SIZE - EDGE; x++) {
      const sourceX = x - dx;
      if (sourceX < 0 || sourceX >= SIZE) continue;
      const difference = template[y * SIZE + x]! - tile[sourceY * SIZE + sourceX]!;
      sum += difference * difference;
      count++;
    }
  }
  return sum / count;
}

function bestDistance(template: Tile, tile: Tile): { distance: number; dx: number; dy: number } {
  let best = { distance: Infinity, dx: 0, dy: 0 };
  for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) {
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
      const distance = distanceAt(template, tile, dx, dy);
      if (distance < best.distance) best = { distance, dx, dy };
    }
  }
  return best;
}

/** The piece's shape: everything the outside of the template cannot reach. */
function silhouette(template: Tile): boolean[] {
  const outside = new Array<boolean>(SIZE * SIZE).fill(false);
  const stack: number[] = [];
  const visit = (index: number) => {
    if (!outside[index] && template[index]! >= OUTLINE_DARK) {
      outside[index] = true;
      stack.push(index);
    }
  };
  for (let i = 0; i < SIZE; i++) {
    visit(i);
    visit((SIZE - 1) * SIZE + i);
    visit(i * SIZE);
    visit(i * SIZE + SIZE - 1);
  }
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % SIZE;
    if (x > 0) visit(index - 1);
    if (x < SIZE - 1) visit(index + 1);
    if (index >= SIZE) visit(index - SIZE);
    if (index < SIZE * (SIZE - 1)) visit(index + SIZE);
  }
  return outside.map((isOutside) => !isOutside);
}

/**
 * Softens a tile. A thin outline that is off by one pixel would otherwise look less
 * like its own piece than like an empty square.
 */
function blur(tile: Tile): Tile {
  const result = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= SIZE || nx < 0 || nx >= SIZE) continue;
          sum += tile[ny * SIZE + nx]!;
          count++;
        }
      }
      result[y * SIZE + x] = sum / count;
    }
  }
  return result;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Estimates how an empty square of one color looks in this book. Most squares on most
 * boards are empty, so the pixel-wise median of all tiles is an empty square.
 */
function estimateEmpty(boards: readonly BoardTiles[], dark: boolean): Tile {
  const candidates: Tile[] = [];
  for (const board of boards) {
    board.forEach((tile, index) => {
      if (isDarkSquare(index) === dark) candidates.push(tile);
    });
  }
  if (!candidates.length) return new Float32Array(SIZE * SIZE).fill(dark ? 150 : 255);

  const step = Math.max(1, Math.floor(candidates.length / MAX_EMPTY_SAMPLES));
  const sample = candidates.filter((_, i) => i % step === 0);
  const result = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < result.length; i++) result[i] = median(sample.map((t) => t[i]!));
  return result;
}

function overBackground(template: Tile, background: Tile): Tile {
  const shape = silhouette(template);
  return template.map((value, i) => (shape[i] ? value : background[i]!)) as Tile;
}

function averageAligned(tiles: readonly Tile[], reference: Tile): Tile {
  const sum = new Float32Array(SIZE * SIZE);
  const counts = new Float32Array(SIZE * SIZE);
  for (const tile of tiles) {
    const { dx, dy } = bestDistance(reference, tile);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const sourceY = y - dy;
        const sourceX = x - dx;
        if (sourceY < 0 || sourceY >= SIZE || sourceX < 0 || sourceX >= SIZE) continue;
        sum[y * SIZE + x]! += tile[sourceY * SIZE + sourceX]!;
        counts[y * SIZE + x]! += 1;
      }
    }
  }
  return sum.map((value, i) => (counts[i] ? value / counts[i]! : reference[i]!)) as Tile;
}

/** Crops a template to its dark pixels and stretches it, so that size stops mattering. */
function normalizedShape(template: Tile): Tile {
  let x0 = SIZE;
  let y0 = SIZE;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (template[y * SIZE + x]! < FOREGROUND_DARK) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const result = new Float32Array(SIZE * SIZE).fill(255);
  if (x1 < x0) return result;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sourceX = Math.round(x0 + (x * (x1 - x0)) / (SIZE - 1));
      const sourceY = Math.round(y0 + (y * (y1 - y0)) / (SIZE - 1));
      result[y * SIZE + x] = template[sourceY * SIZE + sourceX]!;
    }
  }
  return result;
}

/** Average brightness of a tile's center, which is inside the piece. */
function centerBrightness(template: Tile): number {
  const from = Math.floor(SIZE / 3);
  const to = SIZE - from;
  let sum = 0;
  let count = 0;
  for (let y = from; y < to; y++) {
    for (let x = from; x < to; x++) {
      sum += template[y * SIZE + x]!;
      count++;
    }
  }
  return sum / count;
}

/** Share of a tile that is truly dark: large for filled black pieces, small for outlined white ones. */
function darkShare(template: Tile): number {
  let dark = 0;
  for (const value of template) if (value < SOLID_DARK) dark++;
  return dark / template.length;
}

/**
 * Tells black pieces from white. How dark a piece looks depends on the font and on what draws
 * the page, so no fixed level works everywhere. A book's pieces usually fall into two groups by
 * how much of them is solid dark, and this finds the split that separates them best. A book may
 * show one color only, or too few shapes to tell, so the split is used only when the groups are
 * clearly apart and their centers agree: light for white, dark for black. Otherwise each piece
 * is judged by its center.
 */
export function blackPieceFlags(templates: readonly Tile[]): boolean[] {
  const byCenter = () => templates.map((template) => centerBrightness(template) < BLACK_PIECE_BRIGHTNESS);
  if (templates.length < MIN_SHAPES_TO_SPLIT) return byCenter();

  const pieces = templates
    .map((template) => ({ share: Math.min(darkShare(template), MAX_PIECE_SHARE), center: centerBrightness(template) }))
    .sort((a, b) => a.share - b.share);
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  let bestScore = -1;
  let bestAt = 0;
  for (let at = MIN_PER_COLOR; at <= pieces.length - MIN_PER_COLOR; at++) {
    const low = pieces.slice(0, at).map((piece) => piece.share);
    const high = pieces.slice(at).map((piece) => piece.share);
    const score = low.length * high.length * (mean(high) - mean(low)) ** 2;
    if (score > bestScore) {
      bestScore = score;
      bestAt = at;
    }
  }

  const white = pieces.slice(0, bestAt);
  const black = pieces.slice(bestAt);
  const isClearlyApart = mean(black.map((p) => p.share)) - mean(white.map((p) => p.share)) >= MIN_COLOR_DISTANCE;
  const doCentersAgree =
    mean(white.map((p) => p.center)) >= BLACK_PIECE_BRIGHTNESS && mean(black.map((p) => p.center)) < BLACK_PIECE_BRIGHTNESS;
  if (!isClearlyApart || !doCentersAgree) return byCenter();

  const line = (white.at(-1)!.share + black[0]!.share) / 2;
  return templates.map((template) => Math.min(darkShare(template), MAX_PIECE_SHARE) > line);
}

interface ClusterStats {
  template: Tile;
  members: Tile[];
  maxOnOneBoard: number;
  onBackRank: boolean;
  backRankShare: number;
}

/** Groups the book's light-square pieces by printed shape. */
function clusterPieces(boards: readonly BoardTiles[], emptyLight: Tile): ClusterStats[] {
  const groups: { template: Tile; members: Tile[]; perBoard: Map<number, number>; onBackRank: boolean; backRankCount: number }[] = [];

  boards.forEach((board, boardIndex) => {
    board.forEach((tile, index) => {
      if (isDarkSquare(index) || bestDistance(emptyLight, tile).distance < PIECE_DISTANCE) return;
      let closest = null as (typeof groups)[number] | null;
      let closestDistance = SAME_PIECE_DISTANCE;
      for (const group of groups) {
        const { distance } = bestDistance(group.template, tile);
        if (distance < closestDistance) {
          closest = group;
          closestDistance = distance;
        }
      }
      if (!closest) {
        closest = { template: tile, members: [], perBoard: new Map(), onBackRank: false, backRankCount: 0 };
        groups.push(closest);
      }
      closest.members.push(tile);
      closest.perBoard.set(boardIndex, (closest.perBoard.get(boardIndex) ?? 0) + 1);
      if (index < 8 || index >= 56) {
        closest.onBackRank = true;
        closest.backRankCount++;
      }
    });
  });

  // Merge groups that turn out to show the same shape, largest first.
  groups.sort((a, b) => b.members.length - a.members.length);
  const merged: typeof groups = [];
  for (const group of groups) {
    group.template = averageAligned(group.members.slice(0, MAX_TRAINING_TILES), group.template);
    const twin = merged.find((m) => bestDistance(m.template, group.template).distance < MERGE_DISTANCE);
    if (twin) {
      twin.members.push(...group.members);
      for (const [board, count] of group.perBoard) twin.perBoard.set(board, (twin.perBoard.get(board) ?? 0) + count);
      twin.onBackRank ||= group.onBackRank;
      twin.backRankCount += group.backRankCount;
    } else {
      merged.push(group);
    }
  }

  return merged
    .map((group) => ({
      template: averageAligned(group.members.slice(0, MAX_TRAINING_TILES), group.template),
      members: group.members,
      maxOnOneBoard: Math.max(...group.perBoard.values()),
      onBackRank: group.onBackRank,
      backRankShare: group.backRankCount / group.members.length,
    }));
}

function shapeDistance(cluster: ClusterStats, seed: readonly number[]): number {
  return bestDistance(normalizedShape(blur(Float32Array.from(seed))), normalizedShape(cluster.template)).distance;
}

/** The lowest-cost way to give each piece type its own cluster. */
function assignTypes(costs: readonly (readonly number[])[], typeCount: number): number[] {
  let bestCost = Infinity;
  let bestAssignment: number[] = [];
  const chosen: number[] = [];
  const used = new Set<number>();

  const search = (type: number, cost: number) => {
    if (cost >= bestCost) return;
    if (type === typeCount) {
      bestCost = cost;
      bestAssignment = chosen.slice();
      return;
    }
    let placed = false;
    for (let cluster = 0; cluster < costs.length; cluster++) {
      if (used.has(cluster)) continue;
      placed = true;
      used.add(cluster);
      chosen.push(cluster);
      search(type + 1, cost + costs[cluster]![type]!);
      chosen.pop();
      used.delete(cluster);
    }
    // A book may not print every piece on light squares.
    if (!placed) {
      chosen.push(-1);
      search(type + 1, cost);
      chosen.pop();
    }
  };
  search(0, 0);
  return bestAssignment;
}

/**
 * Guesses what each printed shape is, one color at a time. Generic piece art is only a
 * weak hint, so each type gets its own cluster, and chess rules back that up: pawns
 * never stand on the back ranks, and only pawns come in large numbers.
 */
function guessLabels(clusters: readonly ClusterStats[], seeds: Record<string, readonly number[]>): string[] {
  const labels = new Array<string>(clusters.length).fill('');

  const blackFlags = blackPieceFlags(clusters.map((cluster) => cluster.template));

  for (const isBlack of [false, true]) {
    const members = clusters.flatMap((cluster, index) => (blackFlags[index] === isBlack ? [{ cluster, index }] : []));
    const types = 'pnbrqk'
      .split('')
      .map((type) => (isBlack ? type : type.toUpperCase()))
      .filter((label) => seeds[label]);

    const costs = members.map(({ cluster }) =>
      types.map((label) => {
        const isPawn = label.toLowerCase() === 'p';
        let cost = shapeDistance(cluster, seeds[label]!);
        if (isPawn && cluster.onBackRank) cost += RULE_PENALTY;
        if (!isPawn && cluster.maxOnOneBoard > 2) cost += RULE_PENALTY;
        return cost;
      }),
    );

    const assignment = assignTypes(costs, types.length);
    assignment.forEach((memberIndex, typeIndex) => {
      if (memberIndex >= 0) labels[members[memberIndex]!.index] = types[typeIndex]!;
    });

    // Extra clusters are the same piece printed slightly differently.
    members.forEach(({ cluster, index }) => {
      if (labels[index]) return;
      let closest = Infinity;
      for (const other of members) {
        if (!labels[other.index]) continue;
        // A shape seen on a back rank cannot be a pawn, however like one it looks.
        if (cluster.backRankShare >= MIN_BACK_RANK_SHARE && labels[other.index]!.toLowerCase() === 'p') continue;
        // Nor can a shape be a king if a board shows two of it.
        if (cluster.maxOnOneBoard > 1 && labels[other.index]!.toLowerCase() === 'k') continue;
        const { distance } = bestDistance(other.cluster.template, cluster.template);
        if (distance < closest) {
          closest = distance;
          labels[index] = labels[other.index]!;
        }
      }
      labels[index] ||= isBlack ? 'p' : 'P';
    });
  }
  return labels;
}

/**
 * Kings and queens look alike in many fonts, but a position has exactly one king of
 * each color. Whichever shape appears exactly once on more boards is the king.
 */
function settleKingsAndQueens(
  labels: string[],
  clusters: readonly ClusterStats[],
  boards: readonly BoardTiles[],
  emptyLight: Tile,
  emptyDark: Tile,
): string[] {
  const light: [string, Tile][] = [[EMPTY, emptyLight]];
  const dark: [string, Tile][] = [[EMPTY, emptyDark]];
  clusters.forEach((cluster, i) => {
    light.push([String(i), cluster.template]);
    dark.push([String(i), blur(overBackground(cluster.template, emptyDark))]);
  });

  const onceRate = new Array<number>(clusters.length).fill(0);
  for (const board of boards) {
    const counts = new Array<number>(clusters.length).fill(0);
    board.forEach((tile, index) => {
      const { label } = classifyTile(tile, isDarkSquare(index) ? dark : light);
      if (label !== EMPTY) counts[Number(label)]!++;
    });
    counts.forEach((count, i) => {
      if (count === 1) onceRate[i]!++;
    });
  }

  const result = labels.slice();
  for (const [king, queen] of [
    ['K', 'Q'],
    ['k', 'q'],
  ] as const) {
    const kingIndex = labels.indexOf(king);
    const queenIndex = labels.indexOf(queen);
    if (kingIndex >= 0 && queenIndex >= 0 && onceRate[queenIndex]! > onceRate[kingIndex]!) {
      result[kingIndex] = queen;
      result[queenIndex] = king;
    }
  }
  return result;
}

/** Finds the book's own pieces and guesses what each one is. */
export function calibrate(
  rawBoards: readonly BoardTiles[],
  seeds: Record<string, readonly number[]> = PIECE_SEEDS,
): Calibration {
  const boards = rawBoards.map((board) => board.map(blur));
  const emptyLight = estimateEmpty(boards, false);
  const emptyDark = estimateEmpty(boards, true);
  const found = clusterPieces(boards, emptyLight);
  const totalPieces = found.reduce((sum, cluster) => sum + cluster.members.length, 0);
  const kept = found
    .filter((cluster) => cluster.members.length >= totalPieces * MIN_CLUSTER_SHARE)
    .sort((a, b) => b.members.length - a.members.length);
  const labels = settleKingsAndQueens(guessLabels(kept, seeds), kept, boards, emptyLight, emptyDark);
  const clusters = kept.map((cluster, id) => ({
    id,
    template: cluster.template,
    count: cluster.members.length,
    label: labels[id]!,
  }));
  return { clusters, emptyLight, emptyDark };
}

interface Choice {
  label: string;
  margin: number;
}

function classifyTile(tile: Tile, templates: readonly (readonly [string, Tile])[]): Choice {
  let label = EMPTY;
  let best = Infinity;
  let secondOther = Infinity;
  for (const [candidate, template] of templates) {
    const { distance } = bestDistance(template, tile);
    if (distance < best) {
      if (candidate !== label) secondOther = best;
      best = distance;
      label = candidate;
    } else if (candidate !== label && distance < secondOther) {
      secondOther = distance;
    }
  }
  return { label, margin: secondOther / Math.max(best, 1) };
}

/** Reads every diagram of a book, using the book's own printed pieces as the reference. */
export function classifyBook(rawBoards: readonly BoardTiles[], calibration: Calibration): BoardResult[] {
  const boards = rawBoards.map((board) => board.map(blur));
  let light: [string, Tile][] = [[EMPTY, calibration.emptyLight]];
  let dark: [string, Tile][] = [[EMPTY, calibration.emptyDark]];
  for (const cluster of calibration.clusters) {
    light.push([cluster.label, cluster.template]);
    dark.push([cluster.label, blur(overBackground(cluster.template, calibration.emptyDark))]);
  }

  const classifyAll = () =>
    boards.map((board) => board.map((tile, index) => classifyTile(tile, isDarkSquare(index) ? dark : light)));

  let results = classifyAll();
  for (let round = 0; round < SELF_TRAINING_ROUNDS; round++) {
    const retrain = (templates: [string, Tile][], onDark: boolean): [string, Tile][] => {
      const labels = [...new Set(templates.map(([label]) => label))].filter((label) => label !== EMPTY);
      const confident = new Map<string, Tile[]>(labels.map((label) => [label, []]));
      results.forEach((board, b) =>
        board.forEach((square, s) => {
          const tiles = confident.get(square.label);
          if (tiles && square.margin >= TRAINING_MARGIN && isDarkSquare(s) === onDark && tiles.length < MAX_TRAINING_TILES) {
            tiles.push(boards[b]![s]!);
          }
        }),
      );
      // Real tiles match better than templates made from another square color. Retraining
      // only some pieces would unfairly favor them, so it is all or nothing.
      if (labels.some((label) => confident.get(label)!.length < MIN_TRAINING_TILES)) return templates;

      return [
        [EMPTY, templates.find(([label]) => label === EMPTY)![1]],
        ...labels.map((label): [string, Tile] => [
          label,
          averageAligned(confident.get(label)!, templates.find(([other]) => other === label)![1]),
        ]),
      ];
    };
    light = retrain(light, false);
    dark = retrain(dark, true);
    results = classifyAll();
  }

  return results.map((board) => ({
    labels: board.map((square) => square.label),
    confidence: Math.min(...board.map((square) => 1 - 1 / Math.max(square.margin, 1))),
  }));
}

/** Applies a reader's correction to the guess for one printed piece. */
export function relabelCluster(calibration: Calibration, clusterId: number, label: string): Calibration {
  return {
    ...calibration,
    clusters: calibration.clusters.map((c) => (c.id === clusterId ? { ...c, label } : c)),
  };
}
