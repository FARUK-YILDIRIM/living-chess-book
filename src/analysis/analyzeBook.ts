import { analyzeWords } from '../core/book';
import type { BookOverlay, Diagram, Word } from '../core/types';
import type { FoundBoard } from '../pdf/pageReader';
import { calibrate, classifyBook, type Calibration } from '../vision/classifySquares';
import { checkPlacement, placementFromLabels } from '../vision/placement';

export interface RawBook {
  bookHash: string;
  pageWords: Word[][];
  boards: FoundBoard[];
}

export type AnalysisProgress = (stage: 'diagrams' | 'moves', done: number, total: number) => void;

export function diagramsFromBoards(boards: readonly FoundBoard[], calibration: Calibration): Diagram[] {
  const results = classifyBook(
    boards.map((b) => b.tiles),
    calibration,
  );
  return boards.map((board, index) => {
    const result = results[index]!;
    const placement = placementFromLabels(result.labels);
    return {
      id: `d${board.page}-${index}`,
      page: board.page,
      box: board.box,
      placement,
      sideToMove: board.sideToMove,
      label: board.label,
      issues: checkPlacement(placement),
      confidence: result.confidence,
    };
  });
}

/**
 * Turns a book's words and boards into an overlay. Pass a calibration to reuse a
 * reader's corrections, otherwise the app works one out itself.
 */
export function analyzeBook(
  raw: RawBook,
  givenCalibration?: Calibration,
  onProgress?: AnalysisProgress,
): { overlay: BookOverlay; calibration: Calibration } {
  const calibration =
    givenCalibration ??
    calibrate(raw.boards.map((b) => b.tiles));
  onProgress?.('diagrams', 1, 2);
  const diagrams = diagramsFromBoards(raw.boards, calibration);
  onProgress?.('diagrams', 2, 2);

  const { moves, review } = analyzeWords({ pages: raw.pageWords, diagrams }, (done, total) =>
    onProgress?.('moves', done, total),
  );

  return {
    calibration,
    overlay: {
      schemaVersion: 1,
      bookHash: raw.bookHash,
      pageCount: raw.pageWords.length,
      diagrams,
      moves,
      review,
    },
  };
}
