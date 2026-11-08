import { describe, expect, it } from 'vitest';
import { detectBoards } from '../src/vision/detectBoards';
import { checkPlacement, labelsFromPlacement, placementFromLabels } from '../src/vision/placement';
import { createGray, drawBoard, fillRect } from './helpers/syntheticBoard';

describe('detectBoards', () => {
  it('finds a framed board', () => {
    const page = createGray(800, 1000);
    drawBoard(page, 200, 150, 320);
    const boards = detectBoards(page);
    expect(boards).toHaveLength(1);
    expect(Math.abs(boards[0]!.x0 - 200)).toBeLessThanOrEqual(3);
    expect(Math.abs(boards[0]!.x1 - 520)).toBeLessThanOrEqual(3);
    expect(Math.abs(boards[0]!.y1 - 470)).toBeLessThanOrEqual(3);
  });

  it('finds boards stacked in one column', () => {
    const page = createGray(800, 1400);
    drawBoard(page, 200, 100, 320);
    drawBoard(page, 200, 600, 320);
    expect(detectBoards(page)).toHaveLength(2);
  });

  it('finds boards side by side', () => {
    const page = createGray(1000, 600);
    drawBoard(page, 60, 100, 320);
    drawBoard(page, 560, 100, 320);
    expect(detectBoards(page)).toHaveLength(2);
  });

  it('ignores a page with only text-like marks', () => {
    const page = createGray(800, 1000);
    for (let y = 50; y < 950; y += 30) fillRect(page, 80, y, 640, 8, 40);
    expect(detectBoards(page)).toHaveLength(0);
  });

  it('ignores a wide table frame that is not square', () => {
    const page = createGray(800, 1000);
    fillRect(page, 100, 100, 600, 3, 0);
    fillRect(page, 100, 300, 600, 3, 0);
    fillRect(page, 100, 100, 3, 203, 0);
    fillRect(page, 697, 100, 3, 203, 0);
    expect(detectBoards(page)).toHaveLength(0);
  });
});

describe('placementFromLabels', () => {
  it('builds the piece placement field of a FEN', () => {
    const labels = [
      ...'....k...'.split(''),
      ...'........'.split(''),
      ...'........'.split(''),
      ...'........'.split(''),
      ...'........'.split(''),
      ...'........'.split(''),
      ...'PP......'.split(''),
      ...'....K..R'.split(''),
    ];
    expect(placementFromLabels(labels)).toBe('4k3/8/8/8/8/8/PP6/4K2R');
  });
});

describe('checkPlacement', () => {
  it('accepts a legal placement', () => {
    expect(checkPlacement('4k3/8/8/8/8/8/PP6/4K2R')).toEqual([]);
  });

  it('reports missing or extra kings', () => {
    expect(checkPlacement('8/8/8/8/8/8/PP6/4K2R')).toContain('black king count is 0');
    expect(checkPlacement('4k2k/8/8/8/8/8/8/4K3')).toContain('black king count is 2');
  });

  it('reports pawns on the first and last ranks', () => {
    expect(checkPlacement('P3k3/8/8/8/8/8/8/4K3')).toContain('pawn on the first or last rank');
  });

  it('reports ranks that do not have 8 squares', () => {
    expect(checkPlacement('4k4/8/8/8/8/8/8/4K3')).toContain('rank 8 does not have 8 squares');
    expect(checkPlacement('4k3/8/4K3')).toContain('a position needs 8 ranks');
  });

  it('reports too many pawns', () => {
    expect(checkPlacement('4k3/8/8/8/8/PPPPPPPP/P7/4K3')).toContain('more than 8 white pawns');
  });
});

describe('labelsFromPlacement', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  it('undoes placementFromLabels', () => {
    expect(placementFromLabels(labelsFromPlacement(start))).toBe(start);
  });

  it('puts a8 first', () => {
    const labels = labelsFromPlacement('k7/8/8/8/8/8/8/7K');
    expect(labels[0]).toBe('k');
    expect(labels[63]).toBe('K');
    expect(labels).toHaveLength(64);
  });

  it('copes with a misread position', () => {
    expect(placementFromLabels(labelsFromPlacement('k8/ppppppppp/4'))).toBe('k7/pppppppp/8/8/8/8/8/8');
  });
});
