import { Chess } from 'chess.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { bookMovesFrom, judgeGuess, type BookPlace, type MoveJudgement } from '../core/guess';
import type { NotebookEntry } from '../core/notebook';
import { firstReview, nextReview } from '../core/repetition';
import type { BookOverlay, MoveNode } from '../core/types';

export type ReviewFeedback = 'ask' | 'think' | 'wrong' | 'side-line' | 'answered';

interface Options {
  overlay: BookOverlay | null;
  fen: string;
  place: BookPlace;
  isExploring: boolean;
  goToEntry: (entry: NotebookEntry) => void;
  goToMove: (move: MoveNode) => void;
  resetBoard: () => void;
  saveReview: (entry: NotebookEntry, review: NonNullable<NotebookEntry['review']>) => Promise<boolean>;
  judgeMove: (fen: string, readerUci: string, bookSan: string) => Promise<MoveJudgement | null>;
}

/**
 * Brings back saved positions that are due. The reader finds the book's move with the page covered,
 * or, if the book has none from there, thinks it through. They then say whether they knew it.
 */
export function useReviewMode({ overlay, fen, place, isExploring, goToEntry, goToMove, resetBoard, saveReview, judgeMove }: Options) {
  const [queue, setQueue] = useState<readonly NotebookEntry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<ReviewFeedback>('ask');
  const [known, setKnown] = useState(0);
  const [failed, setFailed] = useState(false);
  const isGrading = useRef(false);
  const [judgement, setJudgement] = useState<MoveJudgement | null>(null);
  const judgeRun = useRef(0);

  const current = queue?.[index] ?? null;
  const isFinished = queue !== null && index >= queue.length;
  const expected = useMemo(() => (current && overlay && !isExploring ? bookMovesFrom(overlay, place) : []), [current, overlay, isExploring, place]);

  const show = useCallback(
    (entry: NotebookEntry) => {
      goToEntry(entry);
      judgeRun.current += 1;
      setJudgement(null);
      setFeedback('ask');
    },
    [goToEntry],
  );

  const start = useCallback(
    (due: readonly NotebookEntry[]) => {
      if (!due.length) return;
      setQueue(due);
      setIndex(0);
      setKnown(0);
      setFailed(false);
      show(due[0]!);
    },
    [show],
  );

  const stop = useCallback(() => setQueue(null), []);

  const reveal = useCallback(() => {
    const move = expected[0];
    if (move) goToMove(move);
    setFeedback('answered');
  }, [expected, goToMove]);

  /** Takes a move on the board. False means it is not for this mode to judge. */
  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      if (!current || feedback === 'answered') {
        resetBoard();
        return true;
      }
      // The book has nothing to compare with, so the reader may try things out as they think.
      if (!expected.length) return false;
      let san: string;
      let uci: string;
      try {
        const played = new Chess(fen).move({ from, to, promotion: 'q' });
        san = played.san;
        uci = `${played.from}${played.to}${played.promotion ?? ''}`;
      } catch {
        resetBoard();
        return true;
      }
      const verdict = judgeGuess(expected, san);
      judgeRun.current += 1;
      setJudgement(null);
      if (verdict.kind === 'right') {
        goToMove(verdict.move);
        setFeedback('answered');
      } else {
        setFeedback(verdict.kind);
        resetBoard();
        const run = judgeRun.current;
        void judgeMove(fen, uci, expected[0]!.san).then((found) => {
          if (run === judgeRun.current) setJudgement(found);
        });
      }
      return true;
    },
    [current, feedback, expected, fen, goToMove, resetBoard, judgeMove],
  );

  const grade = useCallback(
    async (knewIt: boolean) => {
      // A second click must not grade the next card as well.
      if (!current || !queue || isGrading.current) return;
      isGrading.current = true;
      const now = Date.now();
      const isSaved = await saveReview(current, nextReview(current.review ?? firstReview(current.createdAt), knewIt, now));
      isGrading.current = false;
      // The schedule stands as it was, so the reader can try the same card again.
      if (!isSaved) {
        setFailed(true);
        return;
      }
      setFailed(false);
      if (knewIt) setKnown((count) => count + 1);
      const next = index + 1;
      setIndex(next);
      if (next < queue.length) show(queue[next]!);
    },
    [current, index, queue, saveReview, show],
  );

  return {
    isOn: queue !== null,
    isFinished,
    current,
    index,
    total: queue?.length ?? 0,
    known,
    failed,
    feedback,
    judgement,
    hasBookMove: expected.length > 0,
    isDoubtful: expected[0]?.confidence === 'low',
    /** The page would give the answer away until it has been given. */
    coversPage: queue !== null && !isFinished && feedback !== 'answered',
    start,
    stop,
    reveal,
    tryMove,
    grade,
  };
}

export type ReviewMode = ReturnType<typeof useReviewMode>;
