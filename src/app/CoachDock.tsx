import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { keepInside, type Offset } from '../core/floatingWindow';
import type { Anchor, NotebookEntry } from '../core/notebook';
import { CoachAnswer, submitKeys, useAnchorText, type PlayedMove } from './NotebookPanel';
import { readSetting, removeSetting, useI18n, writeSetting } from './I18nContext';
import type { MessageKey } from './i18n';
import type { CoachState } from './useCoach';
import type { NotebookState } from './useNotebook';

const SELECTION_SHOWN = 60;
const PLACE_KEY = 'chess-coach.coach-place';
const USUAL_PLACE: Offset = { x: 0, y: 0 };

function readPlace(): Offset {
  try {
    const stored = JSON.parse(readSetting(PLACE_KEY) ?? 'null') as Partial<Offset> | null;
    return typeof stored?.x === 'number' && typeof stored.y === 'number' ? { x: stored.x, y: stored.y } : USUAL_PLACE;
  } catch {
    return USUAL_PLACE;
  }
}

const QUESTIONS: readonly MessageKey[] = ['What is the plan here?', 'Why is this move played?', 'What should I watch out for?'];

interface Props {
  coach: CoachState;
  notebook: NotebookState;
  anchor: Anchor;
  isOpen: boolean;
  isGuessing: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGoTo: (entry: NotebookEntry) => void;
  onPlay: (entry: NotebookEntry, move: PlayedMove) => void;
  onSettings: () => void;
  /** Words to start a question with, such as a line from the engine. A new id puts them in the box again. */
  prefill?: { text: string; id: number } | null;
}

/**
 * The coach's button, and the window it opens. It does not block the page or the board, as its
 * moves play on the board. Answers are kept in the notebook. See ADR-0018.
 */
export function CoachDock({ coach, notebook, anchor, isOpen, isGuessing, onOpenChange, onGoTo, onPlay, onSettings, prefill }: Props) {
  const { t, tm } = useI18n();
  const anchorText = useAnchorText();
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLOListElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  // Only put in the box, so that the reader reads and sends it, and nothing goes by itself.
  const prefillId = prefill?.id;
  const prefillText = useRef(prefill?.text);
  prefillText.current = prefill?.text;
  useEffect(() => {
    if (prefillId === undefined || prefillText.current === undefined) return;
    setDraft(prefillText.current);
    box.current?.focus();
  }, [prefillId]);
  const [place, setPlace] = useState(readPlace);
  const placeNow = useRef(place);
  placeNow.current = place;
  const windowBox = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerX: number; pointerY: number; from: Offset } | null>(null);

  /** The room is the whole reader, so the window can also be taken off the page. */
  const fit = useCallback((wanted: Offset): Offset => {
    const box = windowBox.current;
    const room = box?.closest('.reader');
    return box && room ? keepInside(wanted, placeNow.current, box.getBoundingClientRect(), room.getBoundingClientRect()) : wanted;
  }, []);

  const refit = useCallback(() => {
    const now = placeNow.current;
    const fitted = fit(now);
    if (fitted.x !== now.x || fitted.y !== now.y) setPlace(fitted);
  }, [fit]);

  // The notebook opening or a smaller window can leave it out of reach, as can a place saved on a larger screen.
  useLayoutEffect(refit);
  useEffect(() => {
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [refit]);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, from: placeNow.current };
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const started = drag.current;
    if (started) setPlace(fit({ x: started.from.x + event.clientX - started.pointerX, y: started.from.y + event.clientY - started.pointerY }));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    writeSetting(PLACE_KEY, JSON.stringify(placeNow.current));
  };

  const putBack = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('button')) return;
    setPlace(fit(USUAL_PLACE));
    removeSetting(PLACE_KEY);
  };

  // Earlier answers can hold the moves being worked out, so only what is asked now is shown.
  const guessStart = useRef<number | null>(null);
  if (isGuessing) guessStart.current ??= Date.now();
  else guessStart.current = null;
  const answers = notebook.entries.filter((e) => e.kind === 'coach' && (guessStart.current === null || e.createdAt >= guessStart.current));
  const latest = answers[answers.length - 1]?.createdAt ?? 0;

  const isAsking = coach.asking !== null;
  const canType = !coach.needsSetup && coach.hasConsent;
  const selection = notebook.pendingSelection;
  const canSend = canType && !isAsking && Boolean(draft.trim() || selection);

  useEffect(() => {
    if (isOpen) setLastSeen(Date.now());
  }, [isOpen, latest]);

  // The keyboard goes in with the window and comes back to the button, which is only drawn once it has closed.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen) box.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const list = thread.current;
    if (isOpen && list) list.scrollTop = list.scrollHeight;
  }, [isOpen, latest, isAsking]);

  // The window changes size with the notebook and the app's own window, and the latest answer stays in view.
  const isThreadShown = isOpen && (answers.length > 0 || isAsking);
  useEffect(() => {
    const list = thread.current;
    if (!isThreadShown || !list || typeof ResizeObserver === 'undefined') return;
    let lastHeight = list.clientHeight;
    const observer = new ResizeObserver(() => {
      if (list.clientHeight !== lastHeight) list.scrollTop = list.scrollHeight;
      lastHeight = list.clientHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [isThreadShown]);

  const close = () => onOpenChange(false);

  const send = async (written: string) => {
    setDraft('');
    const isAnswered = await coach.ask({ written });
    // Stopped or failed: what was asked comes back, unless something new has been typed.
    if (!isAnswered) setDraft((now) => now || written);
  };

  if (!isOpen) {
    const label = isAsking ? t('The coach is thinking…') : t('Ask the coach');
    // Small, as it sits over the page. Its words show on pointing, and stay while the coach thinks.
    return (
      <div className="coach-dock">
        <button
          ref={opener}
          type="button"
          className={`coach-open${isAsking ? ' thinking' : ''}`}
          aria-label={`${label} (C)`}
          title={`${t('Open the coach')} (C)`}
          onClick={() => onOpenChange(true)}
        >
          <CoachIcon />
          <span className="coach-open-label" aria-hidden="true">
            {label}
          </span>
          {latest > lastSeen && <span className="coach-new" role="status" aria-label={t('A new answer from the coach')} />}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={windowBox}
      className="coach-dock coach-window"
      style={{ transform: `translate(${place.x}px, ${place.y}px)` }}
      role="dialog"
      aria-label={t('Coach')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <header
        className="coach-head"
        title={t('Drag to move. Double-click to put it back.')}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={putBack}
      >
        <strong>{t('Coach')}</strong>
        <span className="coach-where" title={anchorText(anchor)}>
          {t('Ask about: {where}', { where: anchorText(anchor) })}
        </span>
        <button type="button" className="quiet" aria-label={t('Close the coach')} title={t('Close the coach')} onClick={close}>
          ×
        </button>
      </header>

      <div className="coach-body">
        {coach.needsSetup ? (
          <div className="coach-setup">
            <p>
              {t('The coach needs a connection to an AI provider.')} {coach.setupProblem && tm(coach.setupProblem)}
            </p>
            <button type="button" className="coach-primary" onClick={onSettings}>
              {t('Open Settings')}
            </button>
          </div>
        ) : (
          !coach.hasConsent && (
            <div className="coach-setup">
              <p>
                {t("Your questions, this position, the book's line, the engine lines, your notes on this position and any text you selected go to {destination}. Their terms apply. This holds until you close the app or choose another provider.", {
                  destination: tm(coach.destination),
                })}
              </p>
              <button type="button" className="coach-primary" onClick={coach.giveConsent}>
                {t('I agree')}
              </button>
            </div>
          )
        )}

        {answers.length > 0 || isAsking ? (
          <ol className="coach-thread" ref={thread}>
            {answers.map((entry) => (
              <li key={entry.id} className="coach-turn">
                <CoachAnswer entry={entry} onPlay={onPlay} />
                <button type="button" className="entry-where coach-turn-where" title={t('Go back to this page and position')} onClick={() => onGoTo(entry)}>
                  {anchorText(entry.anchor)}
                </button>
              </li>
            ))}
            {isAsking && (
              <li className="coach-turn" role="status">
                <p className="entry-question">{coach.asking}</p>
                <div className="entry-actions">
                  <span className="thinking">{t('The coach is thinking. This can take up to a minute.')}</span>
                  <button type="button" className="quiet" onClick={coach.stop}>
                    {t('Stop')}
                  </button>
                </div>
              </li>
            )}
          </ol>
        ) : (
          canType && (
            <p className="hint coach-empty">
              {isGuessing
                ? t('While you guess, the coach only gives hints.')
                : anchor.fen
                  ? t('Ask about this position, or about text you select on the page.')
                  : t('Click a move or diagram on the page, and the coach can talk about that position.')}
            </p>
          )
        )}
      </div>

      {coach.problem && (
        <p className="fix-problem" role="alert">
          {tm(coach.problem)}
        </p>
      )}

      <form
        className="coach-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void send(draft);
        }}
      >
        {selection && (
          <span className="composer-selection">
            <span>
              {t('Selected: {text}', { text: selection.text.length > SELECTION_SHOWN ? `${selection.text.slice(0, SELECTION_SHOWN)}…` : selection.text })}
            </span>
            <button type="button" className="quiet" aria-label={t('Dismiss')} title={t('Dismiss')} onClick={() => notebook.setPendingSelection(null)}>
              ×
            </button>
          </span>
        )}
        {canType && !isAsking && !draft && !selection && anchor.fen && (
          <div className="coach-suggestions">
            {(isGuessing ? (['Give me a hint.'] as const) : QUESTIONS).map((question) => (
              <button key={question} type="button" onClick={() => void send(t(question))}>
                {t(question)}
              </button>
            ))}
          </div>
        )}
        <div className="coach-ask">
          <textarea
            ref={box}
            rows={2}
            value={draft}
            disabled={!canType}
            placeholder={t('Ask anything about this position')}
            aria-label={t('Ask the coach')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={submitKeys(() => {
              if (canSend) void send(draft);
            })}
          />
          <button type="submit" className="coach-primary" disabled={!canSend}>
            {t('Ask the coach')}
          </button>
        </div>
        {coach.hasConsent && (
          <details className="composer-sent">
            <summary>{t('Options')}</summary>
            <label className="composer-option">
              <input type="checkbox" checked={coach.sendsPage} onChange={(event) => coach.setSendsPage(event.target.checked)} />
              {t('Also send the text of this page to {destination}. Only do this with a book you may share this way.', { destination: tm(coach.destination) })}
            </label>
            {coach.lastPrompt && !isGuessing && (
              <details className="composer-sent">
                <summary>{t('What was last sent')}</summary>
                <pre>{coach.lastPrompt}</pre>
              </details>
            )}
          </details>
        )}
      </form>
    </div>
  );
}

/** A speech bubble with a question in it: something to ask, which a chess piece alone did not say. */
function CoachIcon() {
  return (
    <svg className="coach-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11.2l-4 3.3c-.6.5-1.5.1-1.5-.7V17H6.5A2.5 2.5 0 0 1 4 14.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10.1 8.9a1.9 1.9 0 1 1 2.8 1.7c-.6.3-.9.7-.9 1.3v.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="14.6" r="1.05" fill="currentColor" />
    </svg>
  );
}
