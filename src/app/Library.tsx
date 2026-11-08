import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import type { MessageKey, MessageParams } from './i18n';
import { useI18n } from './I18nContext';
import { dueEntries } from '../core/repetition';
import { bookTitle, listBooks, loadNotebook, removeBook, type LibraryBook } from './store';
import { forgetDraft } from './useNotebook';

interface Props {
  /** While a book is opening, cards wait, so that a book cannot be removed as it opens. */
  isBusy: boolean;
  error: string | null;
  progress: ReactNode;
  onFile: (file: File, wantsAi: boolean) => void;
  /** Where AI reading would send a book, or null if no provider is set up. */
  aiDestination: string | null;
  onOpen: (hash: string, name: string) => void;
  onSample: () => void;
  onSettings: () => void;
}

function factsOf(book: LibraryBook, t: (key: MessageKey, params?: MessageParams) => string, locale: string): string {
  if (book.moves === null) return t('{pages} pages, not analyzed yet', { pages: book.pageCount });
  return t('{pages} pages, {moves} moves', { pages: book.pageCount, moves: book.moves.toLocaleString(locale) });
}

/** What the reader has built up in a book. */
interface StudyFacts {
  entries: number;
  due: number;
}

function FilePicker({ label, onChange }: { label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="primary">
      {label}
      <input type="file" accept="application/pdf,.pdf" onChange={onChange} />
    </label>
  );
}

function BookCard(props: { book: LibraryBook; study: StudyFacts | undefined; isLatest: boolean; isBusy: boolean; onOpen: Props['onOpen']; onRemoved: (problem: string | null) => void }) {
  const { book, study, isLatest, isBusy, onOpen, onRemoved } = props;
  const { t, language } = useI18n();
  const [isConfirming, setIsConfirming] = useState(false);

  const remove = async () => {
    try {
      await removeBook(book.hash);
      forgetDraft(book.hash);
      onRemoved(null);
    } catch {
      onRemoved('This book could not be removed.');
    }
  };

  return (
    <li className={`book${isLatest ? ' latest' : ''}`}>
      <button type="button" className="book-open" disabled={isBusy} onClick={() => onOpen(book.hash, book.name)}>
        {book.cover ? <img className="book-cover" src={book.cover} alt="" /> : <span className="book-cover" />}
        <span className="book-text">
          <span className="book-title" title={book.name}>
            {bookTitle(book.name)}
          </span>
          <span className="book-facts">{factsOf(book, t, language)}</span>
          {Boolean(study?.entries) && <span className="book-facts">{t('{count} in your notebook', { count: study!.entries })}</span>}
          {Boolean(study?.due) && <span className="book-facts book-due">{t('{count} positions to practise', { count: study!.due })}</span>}
          {isLatest ? (
            <span className="book-continue">{book.lastPage > 0 ? t('Continue from page {page}', { page: book.lastPage + 1 }) : t('Start reading')}</span>
          ) : (
            book.lastPage > 0 && <span className="book-facts">{t('Last read: page {page}', { page: book.lastPage + 1 })}</span>
          )}
        </span>
      </button>
      <div className="book-remove">
        {isConfirming ? (
          <>
            <p role="alert">
              {t('Remove this book, its analysis, your corrections and your notes from the app? The file on your computer stays.')}
              {Boolean(study?.entries) && ` ${t('{count} in your notebook', { count: study!.entries })}.`}
            </p>
            <div className="actions">
              <button type="button" disabled={isBusy} onClick={() => void remove()}>
                {t('Remove')}
              </button>
              <button type="button" className="quiet" autoFocus onClick={() => setIsConfirming(false)}>
                {t('Keep it')}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="quiet" disabled={isBusy} aria-label={t('Remove {name}', { name: book.name })} onClick={() => setIsConfirming(true)}>
            {t('Remove')}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * How to analyze a book that is being added. The app's own reading always runs first, since AI reading
 * starts from its diagrams and its doubts, and only then is the exact cost known. See ADR-0019.
 */
function AnalysisChoice(props: { file: File; aiDestination: string | null; onChoose: (wantsAi: boolean) => void; onCancel: () => void; onSettings: () => void }) {
  const { file, aiDestination, onChoose, onCancel, onSettings } = props;
  const { t, tm } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="settings analysis-choice" aria-labelledby="analysis-choice-title" onClose={onCancel}>
      <h2 id="analysis-choice-title">{t('How should this book be read?')}</h2>
      <p className="hint">{bookTitle(file.name.replace(/\.pdf$/i, ''))}</p>
      <button type="button" className="choice" autoFocus onClick={() => onChoose(false)}>
        <strong>{t('Quick, and free')}</strong>
        <span>{t('Read on this computer in a few minutes, and nothing leaves it. Most moves come out right in a digital book. In a scanned one, about half do, and the rest are marked for you to check.')}</span>
      </button>
      <button type="button" className="choice" disabled={!aiDestination} onClick={() => onChoose(true)}>
        <strong>{t('With AI, more accurate and paid')}</strong>
        <span>
          {aiDestination
            ? t('The same quick reading first, and then the lines of moves are read again by {destination}, which helps most with scanned books. The exact cost and time are shown after the first reading, and nothing is sent before you agree. Only for a book you may share this way.', { destination: tm(aiDestination) })
            : t('This needs an AI provider, chosen in Settings.')}
        </span>
      </button>
      <div className="settings-actions">
        {!aiDestination && (
          <button type="button" className="quiet" onClick={onSettings}>
            {t('Open Settings')}
          </button>
        )}
        <button type="button" className="quiet" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </dialog>
  );
}

/** The first screen: the books a reader has opened before, and a way to add another. */
export function Library({ isBusy, error, progress, onFile, aiDestination, onOpen, onSample, onSettings }: Props) {
  const { t, tm } = useI18n();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [study, setStudy] = useState<Readonly<Record<string, StudyFacts>>>({});
  /** A new PDF waits here while the reader chooses how to analyze it. */
  const [chosen, setChosen] = useState<File | null>(null);

  const reload = useCallback(() => {
    listBooks().then(
      (found) => {
        setBooks(found);
        // Only extra facts, so a book whose notebook cannot be read still opens.
        void Promise.all(
          found.map(async (book) => {
            const { entries } = await loadNotebook(book.hash).catch(() => ({ entries: [] }));
            return [book.hash, { entries: entries.length, due: dueEntries(entries, Date.now()).length }] as const;
          }),
        ).then((facts) => setStudy(Object.fromEntries(facts)));
      },
      () => {
        setBooks([]);
        setProblem('Your library could not be read.');
      },
    );
  }, []);

  useEffect(reload, [reload]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    const file = event.dataTransfer.files[0];
    if (file) setChosen(file);
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Choosing the same file twice must still count as a choice.
    event.target.value = '';
    if (file) setChosen(file);
  };

  const note = t('Your books stay on this computer, where the app keeps a private copy. Parts of a book leave it only if you start AI reading.');
  const shownError = error ?? problem;

  return (
    <main
      className={`library${isOver ? ' over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
    >
      {chosen && (
        <AnalysisChoice
          file={chosen}
          aiDestination={aiDestination}
          onChoose={(wantsAi) => {
            setChosen(null);
            onFile(chosen, wantsAi);
          }}
          onCancel={() => setChosen(null)}
          onSettings={onSettings}
        />
      )}
      <header className="library-bar">
        <h1>{t('Living Chess Book')}</h1>
        <button type="button" className="quiet" onClick={onSettings}>
          {t('Settings')}
        </button>
      </header>

      {(progress || shownError) && (
        <div className="library-status">
          {progress}
          {shownError && (
            <p className="error" role="alert">
              {tm(shownError)}
            </p>
          )}
        </div>
      )}

      {books?.length ? (
        <>
          <div className="library-actions">
            <FilePicker label={t('Open another PDF')} onChange={onChange} />
          </div>
          <ul className="books" aria-label={t('Your books')}>
            {books.map((book, index) => (
              <BookCard
                key={book.hash}
                book={book}
                study={study[book.hash]}
                isLatest={index === 0}
                isBusy={isBusy}
                onOpen={onOpen}
                onRemoved={(failure) => {
                  setProblem(failure);
                  reload();
                }}
              />
            ))}
          </ul>
          <p className="note library-note">{note}</p>
        </>
      ) : (
        books && (
          <div className="empty-library">
            <h2>{t('Open a chess book')}</h2>
            <p>{t('Choose a PDF you own. Click any move or diagram on its pages to see it on a live board.')}</p>
            <FilePicker label={t('Choose a PDF')} onChange={onChange} />
            <button type="button" disabled={isBusy} onClick={onSample}>
              {t('Try the sample book')}
            </button>
            <p className="note">{note}</p>
          </div>
        )
      )}
    </main>
  );
}
