import { useEffect, useRef, useState } from 'react';
import type { MessageKey } from './i18n';
import { useI18n } from './I18nContext';
import { advancePreparation, NEW_PREPARATION, type PreparationStage, type PreparationView, type Progress, type TimeLeft } from './preparation';

const STAGE_NAMES: Record<PreparationStage, MessageKey> = {
  opening: 'Opening the book',
  reading: 'Reading the pages',
  diagrams: 'Recognizing the diagrams',
  moves: 'Finding the moves',
};

/** Shows how far a book has come, in one bar that fills once. Mounted only while preparing. */
export function PreparationBar({ progress }: { progress: Progress }) {
  const { t } = useI18n();
  const state = useRef(NEW_PREPARATION);
  const [view, setView] = useState<PreparationView>(() => advancePreparation(NEW_PREPARATION, progress, Date.now()).view);

  useEffect(() => {
    const result = advancePreparation(state.current, progress, Date.now());
    state.current = result.state;
    setView(result.view);
  }, [progress]);

  const timeText = (time: TimeLeft) => {
    if (time.kind === 'calculating') return t('Working out the time left');
    if (time.kind === 'almost') return t('Almost done');
    if (time.kind === 'under-a-minute') return t('Less than a minute left');
    return time.minutes === 1 ? t('About a minute left') : t('About {minutes} minutes left', { minutes: time.minutes });
  };

  const title = t('Preparing the book: {percent}%', { percent: view.percent });
  return (
    <div className="preparation">
      <div className="preparation-line">
        <strong>{title}</strong>
        <span>{timeText(view.timeLeft)}</span>
      </div>
      <progress max={100} value={view.percent} aria-label={title} />
      <p className="hint">
        {t(STAGE_NAMES[view.stage])}. {t('You can read the pages meanwhile. The moves get their color when this is done.')}
      </p>
    </div>
  );
}
