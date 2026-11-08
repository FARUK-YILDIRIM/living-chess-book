import { describe, expect, it } from 'vitest';
import { calibrate, classifyBook, relabelCluster, sliceBoard, blackPieceFlags } from '../src/vision/classifySquares';
import { placementFromLabels } from '../src/vision/placement';
import { createGray, drawBoard, drawPiece } from './helpers/syntheticBoard';

const PLACEMENTS = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R',
  '8/5k2/8/8/p7/8/1PK5/8',
  '2r3k1/5ppp/p7/1p6/3Q4/1P4P1/P4P1P/6K1',
  'r3k2r/ppq2ppp/2n1bn2/3p4/3P4/2N1BN2/PPQ2PPP/R3K2R',
  '6k1/8/8/8/8/8/8/4K2R',
  // Puts every piece type on a light square, which is where calibration looks.
  '5rk1/pp3ppp/2n1b3/3q4/4Q3/2N1BN2/PP3PPP/3R1K1R',
  '6k1/1n6/8/3q4/2B1Q3/5N2/8/5K1R',
];

/** Seeds drawn from the same original shapes the test pages use. */
function testSeeds(): Record<string, number[]> {
  const seeds: Record<string, number[]> = {};
  for (const label of 'PNBRQKpnbrqk') {
    const tile = createGray(20, 20);
    drawPiece(tile, 0, 0, 20, label);
    seeds[label] = Array.from(tile.data);
  }
  return seeds;
}

function renderBook(size = 320) {
  return PLACEMENTS.map((placement) => {
    const page = createGray(size + 40, size + 40);
    drawBoard(page, 20, 20, size, placement);
    return sliceBoard(page, { x0: 20, y0: 20, x1: 20 + size, y1: 20 + size });
  });
}

const expand = (placement: string) => placement.replace(/\//g, '').replace(/\d/g, (n) => '.'.repeat(Number(n))).split('');

/**
 * Plays the reader on the calibration screen: each printed shape gets its true name.
 * The automatic guess needs realistic piece art, so it is measured on real books
 * (see docs/spike-results.md). These crude shapes test the reading itself.
 */
function read(boards: ReturnType<typeof renderBook>) {
  let calibration = calibrate(boards, testSeeds());
  const named = { ...calibration, clusters: calibration.clusters.map((c) => ({ ...c, label: `#${c.id}` })) };
  const votes = new Map<string, Map<string, number>>();
  classifyBook(boards, named).forEach((result, b) => {
    const truth = expand(PLACEMENTS[b]!);
    result.labels.forEach((label, square) => {
      if (label === '.') return;
      const tally = votes.get(label) ?? new Map<string, number>();
      tally.set(truth[square]!, (tally.get(truth[square]!) ?? 0) + 1);
      votes.set(label, tally);
    });
  });
  for (const cluster of calibration.clusters) {
    const tally = [...(votes.get(`#${cluster.id}`) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    if (tally[0]) calibration = relabelCluster(calibration, cluster.id, tally[0][0]);
  }
  return classifyBook(boards, calibration);
}

describe('classifyBook', () => {
  it('reads every board in a synthetic book exactly', () => {
    const results = read(renderBook());
    expect(results.map((r) => placementFromLabels(r.labels))).toEqual(PLACEMENTS);
  });

  it('copes with a smaller print size', () => {
    const results = read(renderBook(240));
    expect(results.map((r) => placementFromLabels(r.labels))).toEqual(PLACEMENTS);
  });

  it('reports a confidence between 0 and 1', () => {
    for (const result of read(renderBook())) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns nothing for a book with no boards', () => {
    expect(read([])).toEqual([]);
  });

  it('finds about one printed shape per piece type in a synthetic book', () => {
    const { clusters } = calibrate(renderBook(), testSeeds());
    expect(clusters.length).toBeGreaterThanOrEqual(10);
    expect(clusters.length).toBeLessThanOrEqual(16);
  });

  it('tells white pieces from black ones', () => {
    const { clusters } = calibrate(renderBook(), testSeeds());
    const isWhite = (label: string) => label === label.toUpperCase();
    expect(clusters.some((c) => isWhite(c.label))).toBe(true);
    expect(clusters.some((c) => !isWhite(c.label))).toBe(true);
  });

  it('lets a reader correct a wrong guess', () => {
    const boards = renderBook();
    const calibration = calibrate(boards, testSeeds());
    const target = calibration.clusters[0]!;
    const corrected = relabelCluster(calibration, target.id, 'x');
    const labels = classifyBook(boards, corrected).flatMap((r) => r.labels);
    expect(labels).toContain('x');
  });
});

describe('blackPieceFlags', () => {
  const WHITE_CENTER = 180;
  const BLACK_CENTER = 101;
  /** A tile with exactly this share of solid dark pixels, kept outside its center. */
  const tile = (share: number, center: number) => {
    const size = 20;
    const values = new Float32Array(size * size).fill(150);
    let left = Math.round(share * size * size);
    for (let i = 0; i < values.length && left > 0; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      if (x >= 6 && x < 14 && y >= 6 && y < 14) continue;
      values[i] = 10;
      left--;
    }
    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) values[y * size + x] = center;
    return values;
  };
  const white = (share: number) => tile(share, WHITE_CENTER);
  const black = (share: number) => tile(share, BLACK_CENTER);

  it('separates a whole book', () => {
    const whites = [0, 0.005, 0.045, 0.063, 0.08];
    const blacks = [0.237, 0.255, 0.278, 0.318, 0.333, 0.34];
    const flags = blackPieceFlags([...whites.map(white), ...blacks.map(black)]);
    expect(flags).toEqual([...whites.map(() => false), ...blacks.map(() => true)]);
  });

  it('is not fooled by a white queen with a dark center', () => {
    const queen = tile(0.147, 110);
    const flags = blackPieceFlags([white(0), white(0.005), queen, white(0.06), black(0.237), black(0.255), black(0.33), black(0.34)]);
    expect(flags).toEqual([false, false, false, false, true, true, true, true]);
  });

  it('judges a few shapes by center, with too little to split on', () => {
    expect(blackPieceFlags([white(0), white(0.005), white(0.147), black(0.237), black(0.33)])).toEqual([false, false, false, true, true]);
  });

  it('does not split a book of one color: all white', () => {
    expect(blackPieceFlags([white(0.005), white(0.06), white(0.147), white(0.09), white(0.02), white(0.11)])).toEqual(new Array(6).fill(false));
  });

  it('does not split a book of one color: all black', () => {
    expect(blackPieceFlags([black(0.237), black(0.34), black(0.3), black(0.25), black(0.27), black(0.31)])).toEqual(new Array(6).fill(true));
  });

  it('is not thrown by one strange tile', () => {
    const flags = blackPieceFlags([white(0.01), white(0.02), white(0.03), black(0.25), black(0.3), black(0.32), black(0.9)]);
    expect(flags).toEqual([false, false, false, true, true, true, true]);
  });

  it('trusts centers when the groups are close together, as in a faint scan', () => {
    const flags = blackPieceFlags([black(0.01), black(0.09), black(0.1), white(0), white(0.02), white(0.03)]);
    expect(flags).toEqual([true, true, true, false, false, false]);
  });

  it('judges a handful of shapes by center', () => {
    expect(blackPieceFlags([black(0.1), white(0.11)])).toEqual([true, false]);
    expect(blackPieceFlags([black(0.1)])).toEqual([true]);
  });
});
