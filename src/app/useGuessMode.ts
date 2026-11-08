import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addToScore, bookMovesFrom, judgeGuess, movesAhead, NO_SCORE, type BookPlace, type GuessScore, type MoveJudgement } from '../core/guess';
import type { BookOverlay, Box, Color, MoveNode } from '../core/types';

/** Long enough to see the reply arrive, and short enough not to wait for it. */
const REPLY_DELAY_MS = 600;

export type GuessFeedback = 'ask' | 'right' | 'wrong' | 'side-line' | 'shown' | 'end' | 'no-line' | 'left-book';

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();
const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
const keyOf = ({ moveId, diagramId }: BookPlace) => `${moveId ?? ''}|${diagramId ?? ''}`;

interface Options {
  overlay: BookOverlay | null;
  fen: string;
  /** The book's position under any moves the reader is trying. */
  bookFen: string | null;
  isExploring: boolean;
  place: BookPlace;
  goToMove: (move: MoveNode) => void;
  /** Puts the board back after a move that does not count. */
  resetBoard: () => void;
  leaveExploring: () => void;
  /** The engine's view of a move against the book's. Null if it cannot say. */
  judgeMove: (fen: string, readerUci: string, bookSan: string) => Promise<MoveJudgement | null>;
  /** The reader did not find the book's move here, so it should come back for practice. */
  onMissed: () => Promise<boolean>;
  /** The reader found the first move from this diagram. */
  onSolved: (diagramId: string) => void;
}

/**
 * The reader plays the book's moves themselves, with those still to come covered on the page.
 * They choose a side by starting on its turn, and the other side's moves are played for them.
 */
export function useGuessMode({ overlay, fen, bookFen, isExploring, place, goToMove, resetBoard, leaveExploring, judgeMove, onMissed, onSolved }: Options) {
  const [isOn, setIsOn] = useState(false);
  const [side, setSide] = useState<Color>('w');
  const [feedback, setFeedback] = useState<GuessFeedback>('ask');
  const [score, setScore] = useState<GuessScore>(NO_SCORE);
  const [judgement, setJudgement] = useState<MoveJudgement | null>(null);
  const [isJudging, setIsJudging] = useState(false);
  const [isUncovered, setIsUncovered] = useState(false);
  const [wasAddedToPractice, setWasAddedToPractice] = useState(false);
  const tries = useRef(0);
  /** Wrong tries the engine has not yet had its say on. They do not count until it has. */
  const unjudged = useRef(0);
  /** Only the latest move's answer may reach the screen. */
  const judgeRun = useRef(0);
  const reply = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A place this mode itself moved to, which unlike a reader's click is not a fresh start. */
  const ownPlace = useRef<string | null>(null);

  const expected = useMemo(() => (isOn && overlay ? bookMovesFrom(overlay, place) : []), [isOn, overlay, place]);
  const hidden = useMemo(() => (isOn && overlay ? movesAhead(overlay, place) : NOTHING_HIDDEN), [isOn, overlay, place]);

  /** What to keep covered: everything after the place the reader has reached. */
  const cover = useMemo<{ page: number; box: Box } | null>(() => {
    if (!isOn || !overlay || isUncovered || feedback === 'end' || feedback === 'no-line') return null;
    const move = overlay.moves.find((m) => m.id === place.moveId);
    if (move) return { page: move.page, box: move.box };
    const diagram = overlay.diagrams.find((d) => d.id === place.diagramId);
    return diagram ? { page: diagram.page, box: diagram.box } : null;
  }, [isOn, overlay, isUncovered, feedback, place]);

  const clearJudgement = useCallback(() => {
    judgeRun.current += 1;
    setJudgement(null);
    setIsJudging(false);
  }, []);

  const cancelReply = useCallback(() => {
    if (reply.current) clearTimeout(reply.current);
    reply.current = null;
  }, []);

  useEffect(() => cancelReply, [cancelReply]);

  // The reader went somewhere else in the book, and starts again from there.
  const placeKey = keyOf(place);
  useEffect(() => {
    if (!isOn || ownPlace.current === placeKey) return;
    cancelReply();
    clearJudgement();
    setIsUncovered(false);
    setWasAddedToPractice(false);
    ownPlace.current = null;
    tries.current = 0;
    unjudged.current = 0;
    setSide(turnOf(bookFen ?? fen));
    setFeedback(overlay && bookMovesFrom(overlay, place).length ? 'ask' : 'no-line');
    // Only a change of place starts again.
  }, [placeKey, isOn]);

  const go = useCallback(
    (move: MoveNode) => {
      ownPlace.current = keyOf({ moveId: move.id, diagramId: move.diagramId });
      goToMove(move);
    },
    [goToMove],
  );

  /** After a move of the reader's: plays the reply, if the book has one, or ends the line. */
  const carryOn = useCallback(
    (played: MoveNode, nextFeedback: GuessFeedback, reader: Color) => {
      if (!overlay) return;
      tries.current = 0;
      const next = bookMovesFrom(overlay, { moveId: played.id, diagramId: played.diagramId });
      if (!next.length) {
        setFeedback('end');
        return;
      }
      setFeedback(nextFeedback);
      if (turnOf(played.fen) === reader) return;
      reply.current = setTimeout(() => {
        reply.current = null;
        const answer = next[0]!;
        go(answer);
        if (!bookMovesFrom(overlay, { moveId: answer.id, diagramId: answer.diagramId }).length) setFeedback('end');
      }, REPLY_DELAY_MS);
    },
    [go, overlay],
  );

  const start = useCallback(() => {
    if (!overlay) return;
    leaveExploring();
    setIsOn(true);
    setSide(turnOf(bookFen ?? fen));
    // Going on to the next diagram is the same sitting.
    if (!isOn) setScore(NO_SCORE);
    setIsUncovered(false);
    setWasAddedToPractice(false);
    clearJudgement();
    tries.current = 0;
    unjudged.current = 0;
    ownPlace.current = placeKey;
    setFeedback(bookMovesFrom(overlay, place).length ? 'ask' : 'no-line');
  }, [isOn, overlay, fen, bookFen, place, placeKey, leaveExploring, clearJudgement]);

  const stop = useCallback(() => {
    cancelReply();
    clearJudgement();
    setIsOn(false);
    ownPlace.current = null;
  }, [cancelReply, clearJudgement]);

  const tryMove = useCallback(
    (from: string, to: string) => {
      // The other side's reply is on its way, so this move is out of turn.
      if (reply.current || !expected.length) {
        resetBoard();
        return;
      }
      // A click in the notebook can leave the book's moves, and a guess there cannot be judged.
      if (isExploring) {
        setFeedback('left-book');
        resetBoard();
        return;
      }
      if (turnOf(fen) !== side) {
        resetBoard();
        return;
      }
      let san: string;
      let uci: string;
      try {
        const played = new Chess(fen).move({ from, to, promotion: 'q' });
        san = played.san;
        uci = `${played.from}${played.to}${played.promotion ?? ''}`;
      } catch {
        resetBoard();
        return;
      }
      const verdict = judgeGuess(expected, san);
      clearJudgement();
      setWasAddedToPractice(false);
      if (verdict.kind === 'right') {
        const wasFirstTry = tries.current - unjudged.current === 0;
        setScore((current) => addToScore(current, wasFirstTry));
        if (!place.moveId && place.diagramId) onSolved(place.diagramId);
        if (!wasFirstTry) void onMissed().then(setWasAddedToPractice);
        unjudged.current = 0;
        go(verdict.move);
        carryOn(verdict.move, 'right', side);
        return;
      }
      tries.current += 1;
      unjudged.current += 1;
      setFeedback(verdict.kind);
      resetBoard();
      const bookMove = expected[0];
      if (!bookMove) return;
      const run = judgeRun.current;
      setIsJudging(true);
      void judgeMove(fen, uci, bookMove.san).then((found) => {
        if (run !== judgeRun.current) return;
        setIsJudging(false);
        setJudgement(found);
        // As good as the book's move, so looking further is no failure.
        if (found?.grade === 'as-good') tries.current = Math.max(0, tries.current - unjudged.current);
        unjudged.current = 0;
      });
    },
    [fen, side, expected, isExploring, place, go, carryOn, resetBoard, clearJudgement, judgeMove, onMissed, onSolved],
  );

  const show = useCallback(() => {
    const move = expected[0];
    if (!move || reply.current) return;
    clearJudgement();
    setScore((current) => addToScore(current, false));
    void onMissed().then(setWasAddedToPractice);
    go(move);
    carryOn(move, 'shown', side);
  }, [expected, go, carryOn, side, clearJudgement, onMissed]);

  return {
    isOn,
    side,
    feedback,
    score,
    expected,
    hidden,
    cover,
    judgement,
    isJudging,
    wasAddedToPractice,
    uncover: useCallback(() => setIsUncovered(true), []),
    start,
    stop,
    tryMove,
    show,
  };
}

export type GuessMode = ReturnType<typeof useGuessMode>;
