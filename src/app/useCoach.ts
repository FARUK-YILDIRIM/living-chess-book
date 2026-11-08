import { useCallback, useEffect, useRef, useState } from 'react';
import { coachPrompt, coachSystem, movesNamedIn, type CoachBookMove } from '../core/coach';
import { samePosition, type Anchor } from '../core/notebook';
import { createReader } from '../llm/providers';
import type { ResolvedProvider } from '../llm/settings';
import type { Language } from './i18n';
import type { EngineState } from './useEngine';
import type { NotebookState, PendingSelection } from './useNotebook';

/** Enough for the engine to see the moves ahead, and short enough not to feel like waiting. */
const ENGINE_MS = 2000;
const ASKED_MOVES_MS = 1500;

/** What the app knows about the moment a question is asked. */
export interface CoachMoment {
  anchor: Anchor;
  isExploring: boolean;
  isGuessing: boolean;
  bookLine: readonly CoachBookMove[];
  bookNext: readonly CoachBookMove[];
}

interface Options {
  bookHash: string | null;
  provider: ResolvedProvider;
  language: Language;
  notebook: NotebookState;
  engine: EngineState;
  getMoment: () => CoachMoment;
  getPageText: (page: number) => Promise<string>;
  explainQuestion: string;
}

/**
 * Asks the coach about what the reader is looking at. Nothing leaves this computer until the reader
 * has agreed for this destination, and book text goes only if they say so each session.
 */
export function useCoach({ bookHash, provider, language, notebook, engine, getMoment, getPageText, explainQuestion }: Options) {
  const [consentFor, setConsentFor] = useState<string | null>(null);
  /** The destination the reader agreed to send page text to. */
  const [pageFor, setPageFor] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const hasConsent = consentFor === provider.consentKey;
  const sendsPage = pageFor === provider.consentKey;

  const stop = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setAsking(null);
  }, []);

  // Words must only go where the screen says, and only about the book that is open.
  useEffect(() => stop, [bookHash, provider.consentKey, stop]);
  useEffect(() => {
    setPageFor(null);
    setLastPrompt(null);
    setProblem(null);
  }, [bookHash]);
  // Agreement is for one destination, so coming back to it asks again.
  useEffect(() => {
    setConsentFor(null);
    setPageFor(null);
  }, [provider.consentKey]);

  const ask = useCallback(
    /** True once the answer is saved. Otherwise the reader still has what they asked, to try again. */
    async ({ written, selection }: { written?: string; selection?: PendingSelection }): Promise<boolean> => {
      // Kept in view, so that it is not lost if it cannot go yet.
      if (selection) notebook.setPendingSelection(selection);
      if (request.current) return false;
      const shown = selection ?? notebook.pendingSelection ?? null;
      const question = written?.trim() || (shown ? explainQuestion : '');
      if (!question) return false;
      // The window says what is missing, and nothing goes until the reader has dealt with it.
      if (!provider.config || !hasConsent) return false;
      setProblem(null);
      setAsking(question);
      const controller = new AbortController();
      request.current = controller;
      const moment = getMoment();
      const { anchor, isGuessing } = moment;

      try {
        // Both would show the moves that the reader is trying to find.
        const engineLines = anchor.fen && !isGuessing ? await engine.linesFor(anchor.fen, ENGINE_MS) : [];
        // "What if I play a6?" deserves a calculated answer, even if a6 is not among the best moves.
        const named = isGuessing ? [] : movesNamedIn(question, anchor.fen);
        const askedLines = anchor.fen && named.length ? await engine.linesForMoves(anchor.fen, named.map((move) => move.uci), ASKED_MOVES_MS) : [];
        const pageText = sendsPage && !isGuessing ? await getPageText(anchor.page) : null;
        if (controller.signal.aborted) return false;
        const entries = notebook.entries;
        const prompt = coachPrompt({
          page: anchor.page,
          fen: anchor.fen,
          isExploring: moment.isExploring,
          isGuessing,
          bookLine: moment.bookLine,
          bookNext: moment.bookNext,
          engineLines,
          askedLines,
          notes: entries.filter((e) => e.kind !== 'coach' && e.text && samePosition(e.anchor.fen, anchor.fen)).map((e) => e.text),
          history: entries.filter((e) => e.kind === 'coach').map((e) => ({ question: e.question ?? '', answer: e.text })),
          pageText,
          selectedText: shown?.text ?? null,
          question,
        });
        setLastPrompt(prompt);
        const reply = await createReader(provider.config)({ system: coachSystem(language), prompt, images: [], freeText: true, signal: controller.signal });
        if (controller.signal.aborted) return false;
        const answer = reply.text.trim();
        if (!answer) {
          setProblem('The provider sent an empty reply.');
          return false;
        }
        const isSaved = await notebook.addAnswer(question, answer, anchor, provider.model, reply.usage, shown);
        if (!isSaved) setProblem('The answer could not be saved.');
        return isSaved;
      } catch (cause) {
        if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : 'The coach could not answer.');
        return false;
      } finally {
        if (request.current === controller) {
          request.current = null;
          setAsking(null);
        }
      }
    },
    [engine, explainQuestion, getMoment, getPageText, hasConsent, language, notebook, provider, sendsPage],
  );

  return {
    destination: provider.destination,
    setupProblem: provider.problem,
    hasConsent,
    needsSetup: !provider.config,
    /** Nothing is sent by this. The reader asks when they are ready, as they may have moved on since. */
    giveConsent: useCallback(() => setConsentFor(provider.consentKey), [provider.consentKey]),
    sendsPage,
    setSendsPage: useCallback((sends: boolean) => setPageFor(sends ? provider.consentKey : null), [provider.consentKey]),
    asking,
    problem,
    lastPrompt,
    ask,
    stop,
  };
}

export type CoachState = ReturnType<typeof useCoach>;
