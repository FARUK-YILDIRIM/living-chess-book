import type { ChapterProgress, MoveJudgement } from '../core/guess';
import { useI18n } from './I18nContext';
import type { GuessMode } from './useGuessMode';
import type { ReviewMode } from './useReviewMode';

/** What the engine makes of a move that is not the book's. It never names the book's move. */
function JudgementText({ judgement }: { judgement: MoveJudgement }) {
  const { t, language } = useI18n();
  const pawns = judgement.lossInPawns.toLocaleString(language, { maximumFractionDigits: 1 });
  // A mate is counted as a very large score, which means nothing as a number of pawns.
  const involvesMate = judgement.lossInPawns >= 50;
  const text = {
    'as-good': t('The engine rates your move about as highly. The book chose another, so look for that too.'),
    playable: t('Playable, but the engine prefers the book\'s move by about {pawns} pawns.', { pawns }),
    worse: t('This costs about {pawns} pawns by the engine. Look again.', { pawns }),
    losing: involvesMate ? t('This misses a forced mate, or allows one, by the engine. Look again.') : t('This is a serious mistake by the engine, about {pawns} pawns. Look again for what it allows.', { pawns }),
  }[judgement.grade];
  return <p className={`judgement ${judgement.grade}`}>{text}</p>;
}

/** Says what to do next while the reader is guessing the book's moves. */
export function GuessBar({ guess, onNextDiagram }: { guess: GuessMode; onNextDiagram: (() => void) | null }) {
  const { t } = useI18n();
  const { feedback, side, score, expected, judgement, isJudging, wasAddedToPractice, cover } = guess;
  const ask = side === 'w' ? t('What does White play? Make the move on the board.') : t('What does Black play? Make the move on the board.');
  const isDoubtful = expected[0]?.confidence === 'low';

  const message = {
    ask,
    right: `${t('Right.')} ${ask}`,
    shown: ask,
    wrong: t('The book plays something else here. Try again, or show its move.'),
    'side-line': t('The book looks at this in a side line, but prefers another move. Try again, or show its move.'),
    end: t('That is the end of this line.'),
    'no-line': t('The book has no move to follow from here. Click a move or diagram on the page.'),
    'left-book': t('You have left the book\'s moves. Go back to the book to carry on.'),
  }[feedback];

  return (
    <div className={`guess-bar ${feedback}`} role="status">
      <p>
        {message}
        {feedback !== 'end' && feedback !== 'no-line' && feedback !== 'ask' && isDoubtful ? ` ${t('The app is unsure it read the next move correctly.')}` : ''}
      </p>
      {isJudging && <p className="judgement">{t('The engine is looking at your move…')}</p>}
      {judgement && <JudgementText judgement={judgement} />}
      {wasAddedToPractice && <p className="judgement">{t('This position will come back for practice soon.')}</p>}
      <div className="guess-actions">
        {score.asked > 0 && <span>{t('{right} of {total} at the first try', { right: score.firstTry, total: score.asked })}</span>}
        <span className="guess-buttons">
          {cover && (
            <button type="button" className="quiet" onClick={guess.uncover}>
              {t('Show the page')}
            </button>
          )}
          {expected.length > 0 && feedback !== 'left-book' && (
            <button type="button" onClick={guess.show}>
              {t('Show the move')}
            </button>
          )}
          {(feedback === 'end' || feedback === 'no-line') && onNextDiagram && (
            <button type="button" className="composer-save" onClick={onNextDiagram}>
              {t('Next diagram')}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** Practice with the positions that are due. */
export function ReviewBar({ review }: { review: ReviewMode }) {
  const { t } = useI18n();
  const { feedback, index, total, known, isFinished, hasBookMove, failed, current, judgement, isDoubtful } = review;

  if (isFinished) {
    return (
      <div className="guess-bar" role="status">
        <p>{t('Practice is done: you knew {known} of {total}.', { known, total })}</p>
        <div className="guess-actions">
          <button type="button" onClick={review.stop}>
            {t('Close')}
          </button>
        </div>
      </div>
    );
  }

  const isAnswered = feedback === 'answered';
  const hasNote = Boolean(current?.text);
  const canGrade = isAnswered || (!hasBookMove && !hasNote);
  const message = isAnswered
    ? t('Did you know it?')
    : feedback === 'wrong'
      ? t('The book plays something else here. Try again, or show its move.')
      : feedback === 'side-line'
        ? t('The book looks at this in a side line, but prefers another move. Try again, or show its move.')
        : hasBookMove
          ? t('What would you play here? Make the move on the board.')
          : t('The book has no move from this position. Think about your plan, then say whether you knew it.');

  return (
    <div className={`guess-bar ${feedback}`} role="status">
      <p>
        <strong>{t('Position {number} of {total}', { number: index + 1, total })}.</strong> {message}
      </p>
      {judgement && feedback !== 'answered' && <JudgementText judgement={judgement} />}
      {isDoubtful && (feedback === 'wrong' || feedback === 'side-line') && <p className="judgement">{t('The app is unsure it read the next move correctly.')}</p>}
      {isAnswered && hasNote && <p className="entry-text">{current!.text}</p>}
      {failed && <p className="fix-problem">{t('This change could not be saved.')}</p>}
      <div className="guess-actions">
        {!canGrade && (
          <button type="button" onClick={review.reveal}>
            {hasBookMove ? t('Show the move') : t('Show my note')}
          </button>
        )}
        {canGrade && (
          <>
            <button type="button" onClick={() => void review.grade(false)}>
              {t('I did not know it')}
            </button>
            <button type="button" className="composer-save" onClick={() => void review.grade(true)}>
              {t('I knew it')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The book's chapters and how much of each has been solved, with the way to the next diagram. */
export function BookMap(props: {
  chapters: readonly ChapterProgress[];
  solved: number;
  total: number;
  onGoTo: (page: number) => void;
  onNextDiagram: (() => void) | null;
}) {
  const { chapters, solved, total, onGoTo, onNextDiagram } = props;
  const { t } = useI18n();
  return (
    <div className="book-map">
      <p className="book-map-total">
        <strong>{t('{solved} of {total} diagrams solved', { solved, total })}</strong>
      </p>
      <progress value={solved} max={Math.max(total, 1)} aria-label={t('{solved} of {total} diagrams solved', { solved, total })} />
      {onNextDiagram && (
        <button type="button" className="composer-save" onClick={onNextDiagram}>
          {t('Solve the next diagram')}
        </button>
      )}
      {chapters.length > 0 ? (
        <ol>
          {chapters.map((chapter) => (
            <li key={`${chapter.page}-${chapter.title}`}>
              <button type="button" className="quiet" onClick={() => onGoTo(chapter.page)}>
                <span className="chapter-title">{chapter.title}</span>
                <span className="chapter-count">{chapter.total ? `${chapter.solved}/${chapter.total}` : t('Page {page}', { page: chapter.page + 1 })}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">{t('This PDF has no table of contents the app can read.')}</p>
      )}
    </div>
  );
}

/** What to do next, so that a reader who opens the book is not left looking at an empty board. */
export function NextStep(props: {
  solved: number;
  total: number;
  /** The next diagram not yet solved, or null when all are. */
  next: { page: number; chapter: string | null; isHere: boolean } | null;
  onSolve: () => void;
  onShow: () => void;
}) {
  const { solved, total, next, onSolve, onShow } = props;
  const { t } = useI18n();
  const progress = t('{solved} of {total} diagrams solved', { solved, total });
  return (
    <section className="next-step" aria-label={t('Next step')}>
      <div className="next-step-head">
        <strong>{t('Next step')}</strong>
        <span title={progress}>
          {solved}/{total}
        </span>
      </div>
      <progress value={solved} max={Math.max(total, 1)} aria-label={progress} />
      {next ? (
        <>
          <p>
            {next.isHere ? t('This diagram is not solved yet. Find the moves the book plays from it.') : t('The diagram on page {page}', { page: next.page + 1 })}
            {next.chapter && !next.isHere && <span className="next-step-chapter">{next.chapter}</span>}
          </p>
          <div className="next-step-actions">
            {!next.isHere && (
              <button type="button" className="quiet" onClick={onShow}>
                {t('Show it')}
              </button>
            )}
            <button type="button" className="coach-primary" onClick={onSolve}>
              {t('Solve')}
            </button>
          </div>
        </>
      ) : (
        <p>{t('You have solved every diagram in this book.')}</p>
      )}
    </section>
  );
}
