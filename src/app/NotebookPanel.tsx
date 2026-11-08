import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { hasBadMove, parseCoachReply, type ReplyPart } from '../core/coach';
import { samePosition, type Anchor, type NotebookEntry } from '../core/notebook';
import { priceOf } from '../llm/estimate';
import { useI18n } from './I18nContext';
import type { NotebookFilter, NotebookState } from './useNotebook';

const PIECE_NAMES: Readonly<Record<string, string>> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SELECTION_SHOWN = 60;

export type PlayedMove = Extract<ReplyPart, { kind: 'move' }>;

/**
 * A small picture of a position, in the same pieces as the live board. Those styles need the board's
 * own `piece` tag, which React does not know, so this is written as markup. Everything in it comes
 * from the list above and from numbers, and nothing from the stored position is copied into it.
 */
function MiniBoard({ fen }: { fen: string }) {
  let pieces = '';
  (fen.split(' ')[0] ?? '').split('/').forEach((rank, row) => {
    let column = 0;
    for (const symbol of rank) {
      const empty = Number(symbol);
      if (empty) {
        column += empty;
        continue;
      }
      const name = PIECE_NAMES[symbol.toLowerCase()];
      const color = symbol === symbol.toLowerCase() ? 'black' : 'white';
      if (name) pieces += `<piece class="${name} ${color}" style="left:${column * 12.5}%;top:${row * 12.5}%"></piece>`;
      column += 1;
    }
  });
  return <span className="mini-board cg-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pieces }} />;
}

export function useAnchorText() {
  const { t } = useI18n();
  return (anchor: Anchor) => {
    const isOwn = Boolean(anchor.fen) && !samePosition(anchor.fen, anchor.bookFen);
    return [t('Page {page}', { page: anchor.page + 1 }), anchor.label, isOwn ? t('Your own moves') : null].filter(Boolean).join(' · ');
  };
}

/** Saves on Enter like a chat, with Shift+Enter for a new line, and leaves on Escape if asked. */
export function submitKeys(onSubmit: () => void, onCancel?: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
      // Key code 229 is the Enter that finishes composing a character, which some browsers do not flag.
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      onSubmit();
    }
  };
}

/** Answers run long, and the coach's window is their home. In the notebook they start short. */
const LONG_ANSWER = 240;

/** A coach's answer, with its moves checked again each time it is shown. */
export function CoachAnswer({ entry, onPlay, startsShort = false }: { entry: NotebookEntry; onPlay: (entry: NotebookEntry, move: PlayedMove) => void; startsShort?: boolean }) {
  const { t } = useI18n();
  const [isOpened, setIsOpened] = useState(false);
  const isShort = startsShort && !isOpened && entry.text.length > LONG_ANSWER;
  const parts = parseCoachReply(entry.text, entry.anchor.fen);
  const cost = entry.usage && entry.model ? priceOf(entry.model, entry.usage.input, entry.usage.output) : null;
  return (
    <>
      <p className="entry-question">{entry.question}</p>
      <p className={`entry-text coach-text${isShort ? ' short' : ''}`}>
        {parts.map((part, index) =>
          part.kind === 'text' ? (
            part.text
          ) : part.kind === 'move' ? (
            <button key={index} type="button" className="san coach-move" title={t('Show this move on the board')} onClick={() => onPlay(entry, part)}>
              {part.san}
            </button>
          ) : part.kind === 'idea' ? (
            <span key={index} className="idea-move" title={t('This cannot be played from this position. It may be meant for later in a plan.')}>
              {part.text}
            </span>
          ) : (
            <span key={index} className="bad-move" title={t('This does not fit the rules from this position, so the app cannot show it.')}>
              {part.text}
            </span>
          ),
        )}
      </p>
      {startsShort && entry.text.length > LONG_ANSWER && (
        <button type="button" className="quiet entry-more" aria-expanded={isOpened} onClick={() => setIsOpened(!isOpened)}>
          {isOpened ? t('Show less') : t('Show more')}
        </button>
      )}
      {!isShort && hasBadMove(parts) && <p className="fix-problem">{t('The moves marked here do not fit the rules from this position. The coach may be wrong about them.')}</p>}
      {!isShort && entry.usage && (
        <p className="entry-usage">
          {cost !== null
            ? t('{input} tokens in, {output} out, about {cost}', { input: entry.usage.input, output: entry.usage.output, cost: cost < 0.01 ? t('under $0.01') : `$${cost.toFixed(2)}` })
            : t('{input} tokens in, {output} out', { input: entry.usage.input, output: entry.usage.output })}
        </p>
      )}
    </>
  );
}

function Entry(props: {
  entry: NotebookEntry;
  isHere: boolean;
  notebook: NotebookState;
  onGoTo: (entry: NotebookEntry) => void;
  onPlay: (entry: NotebookEntry, move: PlayedMove) => void;
}) {
  const { entry, isHere, notebook, onGoTo, onPlay } = props;
  const { t, language } = useI18n();
  const anchorText = useAnchorText();
  const editing = notebook.editing?.entryId === entry.id ? notebook.editing.text : null;
  const isPosition = entry.kind === 'position';
  const isCoach = entry.kind === 'coach';
  const canSave = editing !== null && (isPosition || Boolean(editing.trim()));

  const save = () => {
    if (canSave) void notebook.saveEdit();
  };
  // Escape is easy to press by accident, so it gives up nothing that was typed. Cancel does.
  const leave = () => {
    if (editing === entry.text) notebook.cancelEdit();
  };

  return (
    <li className={`entry${isHere ? ' here' : ''}${isCoach ? ' coach' : ''}`} data-entry={entry.id} aria-current={isHere ? 'true' : undefined}>
      <button
        type="button"
        className="entry-go"
        title={entry.anchor.fen ? t('Go back to this page and position') : t('Go back to this page')}
        onClick={() => onGoTo(entry)}
      >
        {isPosition && entry.anchor.fen && <MiniBoard fen={entry.anchor.fen} />}
        <span className="entry-where">
          {isPosition && <strong>{entry.wasMissed ? t('A move you missed') : t('Saved position')}</strong>}
          {isCoach && <strong>{t('Coach')}</strong>}
          <span>{anchorText(entry.anchor)}</span>
        </span>
      </button>

      {isCoach ? (
        <CoachAnswer entry={entry} onPlay={onPlay} startsShort />
      ) : editing === null ? (
        entry.text && <p className="entry-text">{entry.text}</p>
      ) : (
        <div className="entry-edit">
          <textarea
            autoFocus
            rows={3}
            value={editing}
            aria-label={t('Your note')}
            onChange={(event) => notebook.setEditText(event.target.value)}
            onKeyDown={submitKeys(save, leave)}
          />
          <div className="entry-actions">
            <button type="button" disabled={!canSave} onClick={save}>
              {t('Save')}
            </button>
            <button type="button" className="quiet" onClick={notebook.cancelEdit}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      {editing === null && (
        <div className="entry-actions">
          <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleDateString(language)}</time>
          {!isCoach && (
            <button type="button" className="quiet" onClick={() => notebook.startEdit(entry)}>
              {entry.text ? t('Edit') : t('Add a note')}
            </button>
          )}
          <button type="button" className="quiet" onClick={() => void notebook.remove(entry)}>
            {t('Delete')}
          </button>
        </div>
      )}
    </li>
  );
}

interface Props {
  notebook: NotebookState;
  anchor: Anchor;
  /** The entries can give away an answer, so they stay out of sight during practice. */
  isPractising: boolean;
  /** A coach's earlier answers can name the moves the reader is now working out. */
  hidesAnswers: boolean;
  onGoTo: (entry: NotebookEntry) => void;
  onPlay: (entry: NotebookEntry, move: PlayedMove) => void;
}

/** One stream for everything the reader keeps. Questions are asked in the coach's window. See ADR-0018. */
export function NotebookPanel({ notebook, anchor, isPractising, hidesAnswers, onGoTo, onPlay }: Props) {
  const { t } = useI18n();
  const anchorText = useAnchorText();
  const list = useRef<HTMLOListElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const { entries, draft, reveal, removed, problem, filter, setFilter, editing, clearReveal, clearComposerFocus, pendingSelection, composerFocus } = notebook;

  const onPage = entries.filter((e) => e.anchor.page === anchor.page);
  const positions = entries.filter((e) => e.kind === 'position');
  // An entry being edited stays, so that turning a page cannot take away what is being typed.
  const shown = entries.filter(
    (e) => !(hidesAnswers && e.kind === 'coach') && (e.id === editing?.entryId || filter === 'all' || (filter === 'page' ? e.anchor.page === anchor.page : e.kind === 'position')),
  );

  const scrollTo = (selector: string) => {
    list.current?.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  };

  // An entry asked for must be seen, even if the filter was hiding it.
  useEffect(() => {
    if (!reveal) return;
    if (!shown.some((e) => e.id === reveal.entryId) && entries.some((e) => e.id === reveal.entryId)) setFilter('all');
    // Waits for the entry to be drawn, or for the filter above to take effect.
    const frame = requestAnimationFrame(() => {
      scrollTo(`[data-entry="${CSS.escape(reveal.entryId)}"]`);
      clearReveal();
    });
    return () => cancelAnimationFrame(frame);
    // Only a new request should move the list, and not every change of the entries.
  }, [reveal]);

  // Reaching a position brings up what was written about it.
  useEffect(() => {
    if (anchor.fen) scrollTo('.entry.here');
  }, [anchor.fen]);

  useEffect(() => {
    if (!composerFocus) return;
    box.current?.focus();
    clearComposerFocus();
  }, [composerFocus, clearComposerFocus]);

  const filters: [NotebookFilter, string][] = [
    ['all', t('All ({count})', { count: entries.length })],
    ['page', t('This page ({count})', { count: onPage.length })],
    ['positions', t('Positions ({count})', { count: positions.length })],
  ];

  return (
    <section className="notebook" aria-label={t('Study notebook')}>
      {isPractising ? (
        <p className="hint entries-empty">{t('Your notebook stays closed during practice, so that it gives nothing away.')}</p>
      ) : (
        <>
          <div className="notebook-filters" role="group" aria-label={t('Show')}>
            {filters.map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'active' : 'quiet'} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>

          {shown.length ? (
            <ol className="entries" ref={list}>
              {shown.map((entry) => (
                <Entry key={entry.id} entry={entry} isHere={samePosition(entry.anchor.fen, anchor.fen)} notebook={notebook} onGoTo={onGoTo} onPlay={onPlay} />
              ))}
            </ol>
          ) : (
            <p className="hint entries-empty">
              {entries.length
                ? t('Nothing here yet.')
                : t('Write something below, or save a position. It stays tied to this page and position, and a click brings you back.')}
            </p>
          )}
        </>
      )}

      {removed && (
        <div className="notebook-undo" role="status">
          <span>{t('Deleted.')}</span>
          <button type="button" onClick={() => void notebook.undoRemove()}>
            {t('Undo')}
          </button>
          <button type="button" className="quiet" aria-label={t('Dismiss')} title={t('Dismiss')} onClick={notebook.dismissRemoved}>
            ×
          </button>
        </div>
      )}

      {problem && (
        <p className="fix-problem" role="alert">
          {t(problem)}
        </p>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void notebook.addNote(anchor);
        }}
      >
        <span className="composer-where">{t('Attaches to: {where}', { where: anchorText(anchor) })}</span>
        {pendingSelection && (
          <span className="composer-selection">
            <span>
              {t('Selected: {text}', {
                text: pendingSelection.text.length > SELECTION_SHOWN ? `${pendingSelection.text.slice(0, SELECTION_SHOWN)}…` : pendingSelection.text,
              })}
            </span>
            <button type="button" className="quiet" aria-label={t('Dismiss')} title={t('Dismiss')} onClick={() => notebook.setPendingSelection(null)}>
              ×
            </button>
          </span>
        )}
        <textarea
          ref={box}
          rows={2}
          value={draft}
          placeholder={t('Write a note')}
          aria-label={t('Your note')}
          onChange={(event) => notebook.setDraft(event.target.value)}
          onKeyDown={submitKeys(() => void notebook.addNote(anchor))}
        />
        <div className="composer-actions">
          <span className="hint">{t('Enter saves, Shift+Enter starts a new line.')}</span>
          <button type="submit" className="composer-save" disabled={!draft.trim()}>
            {t('Take note')}
          </button>
        </div>
      </form>
    </section>
  );
}
