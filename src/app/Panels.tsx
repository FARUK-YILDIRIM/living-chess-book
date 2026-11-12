import { useEffect, useRef, useState } from 'react';
import { moveLabel } from '../core/notebook';
import { diagramSide, firstReviewFrom, legalAlternatives, moveNumber, reviewInOrder } from '../core/overlay';
import type { BookOverlay, Color, MoveNode, ReviewItem } from '../core/types';
import type { Calibration, PieceCluster } from '../vision/classifySquares';
import { checkPlacement, labelsFromPlacement, placementFromLabels } from '../vision/placement';
import type { MessageKey } from './i18n';
import { useI18n } from './I18nContext';

const REASONS: Record<ReviewItem['reason'], MessageKey> = {
  'invalid-diagram': 'This diagram cannot be a real position',
  'low-confidence-diagram': 'This diagram may be misread',
  'low-confidence-move': 'This move may be misread',
  'unresolved-move': 'A move here could not be read',
};

const PIECE_NAMES: [string, MessageKey][] = [
  ['K', 'White king'],
  ['Q', 'White queen'],
  ['R', 'White rook'],
  ['B', 'White bishop'],
  ['N', 'White knight'],
  ['P', 'White pawn'],
  ['k', 'Black king'],
  ['q', 'Black queen'],
  ['r', 'Black rook'],
  ['b', 'Black bishop'],
  ['n', 'Black knight'],
  ['p', 'Black pawn'],
];

export function MoveList(props: { line: MoveNode[]; currentId: string | null; choices: readonly MoveNode[]; onSelect: (id: string) => void }) {
  const { line, currentId, choices, onSelect } = props;
  const { t } = useI18n();
  if (!line.length && choices.length < 2) return <p className="hint">{t('Click a move on the page to follow its line here.')}</p>;

  return (
    <>
    {/* Moving forward follows the main line, so the others would otherwise be found only on the page. */}
    {choices.length > 1 && (
      <div className="move-choices">
        <span>{t('The book looks at:')}</span>
        {choices.map((move) => (
          <button key={move.id} type="button" className={`san${move.confidence === 'low' ? ' doubtful' : ''}`} onClick={() => onSelect(move.id)}>
            {moveLabel(move)}
          </button>
        ))}
      </div>
    )}
    <ol className="moves">
      {line.map((move, index) => {
        const { number, movedWhite } = moveNumber(move);
        return (
          <li key={move.id}>
            {movedWhite && <span className="number">{number}.</span>}
            {!movedWhite && index === 0 && <span className="number">{number}...</span>}
            <button
              type="button"
              className={`san${move.id === currentId ? ' current' : ''}${move.confidence === 'low' ? ' doubtful' : ''}`}
              onClick={() => onSelect(move.id)}
            >
              {move.san}
            </button>
          </li>
        );
      })}
    </ol>
    </>
  );
}

/** Asks about a doubtful move where the reader meets it, so that no list needs working through. */
export function DoubtBar(props: { overlay: BookOverlay; move: MoveNode; onCorrect: (id: string, san: string) => void; onKeep: () => void }) {
  const { overlay, move, onCorrect, onKeep } = props;
  const { t } = useI18n();
  return (
    <div className="doubt-bar" role="status">
      <span>{t('The app is unsure of this move. Is it right in the book?')}</span>
      <MoveFix overlay={overlay} moveId={move.id} onCorrect={onCorrect} />
      <button type="button" onClick={onKeep}>
        {t('Looks right')}
      </button>
    </div>
  );
}

interface ReviewProps {
  overlay: BookOverlay;
  /** The page being read when this opened, which is where checking starts. */
  startPage: number;
  onGoTo: (item: ReviewItem) => void;
  onDismiss: (id: string) => void;
  onCorrectMove: (moveId: string, san: string) => void;
  onCorrectDiagram: (diagramId: string, placement: string, side: Color) => void;
  onReadWithAi: () => void;
}

const LIST_SHOWN = 200;
const PLACEMENT_CHARACTERS = /^[pnbrqkPNBRQK1-8/]+$/;

const HOW_TO_FIX: Record<ReviewItem['reason'], MessageKey> = {
  'invalid-diagram': 'Make this board match the diagram on the page: choose a piece, then click a square.',
  'low-confidence-diagram': 'Make this board match the diagram on the page: choose a piece, then click a square.',
  'low-confidence-move': 'Compare with the marked place on the page. If the move differs, choose the right one.',
  'unresolved-move': 'The marked place on the page has a move the app could not read. You can have it read with AI, or leave it.',
};

/** One place at a time, shown on the page and the board, so that a long list does not have to be worked through. */
export function ReviewPanel({ overlay, startPage, onGoTo, onDismiss, onCorrectMove, onCorrectDiagram, onReadWithAi }: ReviewProps) {
  const { t } = useI18n();
  const items = reviewInOrder(overlay);
  const [chosenId, setChosenId] = useState(() => firstReviewFrom(items, startPage)?.id ?? null);
  const card = useRef<HTMLDivElement>(null);

  // What was just dealt with leaves the list, and the next one takes its place.
  const lastIndex = useRef(0);
  const found = items.findIndex((item) => item.id === chosenId);
  const index = found >= 0 ? found : Math.min(lastIndex.current, items.length - 1);
  lastIndex.current = Math.max(index, 0);
  const current = items[index] ?? null;
  const currentId = current?.id ?? null;

  const latest = useRef(current);
  latest.current = current;
  useEffect(() => {
    if (latest.current) onGoTo(latest.current);
    card.current?.scrollIntoView({ block: 'nearest' });
    // Only reaching another place should move the page and board, and not every change of the book.
  }, [currentId]);

  if (!current) return <p className="hint">{t('Nothing left to check.')}</p>;

  const isDiagram = current.reason === 'invalid-diagram' || current.reason === 'low-confidence-diagram';
  const canSayRight = current.reason === 'low-confidence-move' || current.reason === 'low-confidence-diagram';

  return (
    <div className="review-flow">
      <div className="review-nav">
        <button type="button" disabled={index === 0} aria-label={t('Previous place')} title={t('Previous place')} onClick={() => setChosenId(items[index - 1]!.id)}>
          ‹
        </button>
        <span>
          {index + 1} / {items.length}
        </span>
        <button type="button" disabled={index === items.length - 1} aria-label={t('Next place')} title={t('Next place')} onClick={() => setChosenId(items[index + 1]!.id)}>
          ›
        </button>
      </div>

      <div className="review-card" ref={card}>
        <strong>{t('Page {page}: {reason}', { page: current.page + 1, reason: t(REASONS[current.reason]) })}</strong>
        <p className="hint">{t(HOW_TO_FIX[current.reason])}</p>
        {current.reason === 'low-confidence-move' && current.targetId && <MoveFix overlay={overlay} moveId={current.targetId} onCorrect={onCorrectMove} />}
        {isDiagram && current.targetId && <DiagramFix key={current.targetId} overlay={overlay} diagramId={current.targetId} onCorrect={onCorrectDiagram} />}
        <div className="review-actions">
          {current.reason === 'unresolved-move' && (
            <button type="button" onClick={onReadWithAi}>
              {t('Read with AI')}
            </button>
          )}
          <button type="button" className="quiet" onClick={() => onDismiss(current.id)}>
            {canSayRight ? t('Looks right') : t('Leave it as it is')}
          </button>
        </div>
      </div>

      <details className="review-all">
        <summary>{t('All places to check ({count})', { count: items.length })}</summary>
        <ol>
          {items.slice(0, LIST_SHOWN).map((item) => (
            <li key={item.id}>
              <button type="button" className="link" aria-current={item.id === current.id ? 'true' : undefined} onClick={() => setChosenId(item.id)}>
                {t('Page {page}: {reason}', { page: item.page + 1, reason: t(REASONS[item.reason]) })}
              </button>
            </li>
          ))}
          {items.length > LIST_SHOWN && <li className="hint">{t('And {count} more, shown as you clear these.', { count: items.length - LIST_SHOWN })}</li>}
        </ol>
      </details>
    </div>
  );
}

/** Any diagram, opened from the board: one read wrongly but with confidence never reaches the list above. */
export function DiagramEditPanel(props: {
  overlay: BookOverlay;
  diagramId: string;
  onCorrect: (id: string, placement: string, side: Color) => void;
  onCancel: () => void;
}) {
  const { overlay, diagramId, onCorrect, onCancel } = props;
  const { t } = useI18n();
  const diagram = overlay.diagrams.find((d) => d.id === diagramId);
  if (!diagram) return null;
  return (
    <div className="review-flow">
      <div className="review-card">
        <strong>{t('The diagram on page {page}', { page: diagram.page + 1 })}</strong>
        <p className="hint">{t('Make this board match the diagram on the page: choose a piece, then click a square.')}</p>
        <DiagramFix key={diagramId} overlay={overlay} diagramId={diagramId} onCorrect={onCorrect} />
        <div className="review-actions">
          <button type="button" className="quiet" onClick={onCancel}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveFix(props: { overlay: BookOverlay; moveId: string; onCorrect: (id: string, san: string) => void }) {
  const { overlay, moveId, onCorrect } = props;
  const { t } = useI18n();
  const move = overlay.moves.find((m) => m.id === moveId);
  if (!move) return null;
  return (
    <label className="fix">
      {t('Move')}
      <select value={move.san} onChange={(event) => onCorrect(moveId, event.target.value)}>
        {[move.san, ...legalAlternatives(overlay, moveId).filter((san) => san !== move.san)].map((san) => (
          <option key={san}>{san}</option>
        ))}
      </select>
    </label>
  );
}

const PIECE_CLASSES: Readonly<Record<string, string>> = {
  K: 'king white',
  Q: 'queen white',
  R: 'rook white',
  B: 'bishop white',
  N: 'knight white',
  P: 'pawn white',
  k: 'king black',
  q: 'queen black',
  r: 'rook black',
  b: 'bishop black',
  n: 'knight black',
  p: 'pawn black',
};
const EMPTY_SQUARE = '.';
const FILES = 'abcdefgh';

/** The board's own piece drawings need its `piece` tag, which React does not know. The classes come from the list above. */
const pieceMarkup = (label: string) => ({ __html: PIECE_CLASSES[label] ? `<piece class="${PIECE_CLASSES[label]}"></piece>` : '' });

function DiagramFix(props: {
  overlay: BookOverlay;
  diagramId: string;
  onCorrect: (id: string, placement: string, side: Color) => void;
}) {
  const { overlay, diagramId, onCorrect } = props;
  const { t, tm } = useI18n();
  const diagram = overlay.diagrams.find((d) => d.id === diagramId);
  const [labels, setLabels] = useState(() => labelsFromPlacement(diagram?.placement ?? ''));
  const [typed, setTyped] = useState<string | null>(null);
  const [brush, setBrush] = useState('P');
  // The side the board shows, which for a diagram with no caption comes from its line. Saving keeps it.
  const [side, setSide] = useState<Color>(() => diagramSide(overlay, diagramId));
  if (!diagram) return null;

  const placement = placementFromLabels(labels);
  const shown = typed ?? placement;
  const problem = PLACEMENT_CHARACTERS.test(shown) ? checkPlacement(shown)[0] : t('Use FEN piece letters and digits');
  const isValid = !problem;
  const name = (label: string) => t(PIECE_NAMES.find(([letter]) => letter === label)?.[1] ?? 'White pawn');

  const paint = (square: number) => {
    setTyped(null);
    // Clicking the same piece again takes it off, so a slip does not need the eraser.
    setLabels(labels.map((label, i) => (i === square ? (label === brush ? EMPTY_SQUARE : brush) : label)));
  };

  return (
    <form
      className="diagram-fix"
      onSubmit={(event) => {
        event.preventDefault();
        if (isValid) onCorrect(diagramId, shown, side);
      }}
    >
      <div className="edit-board cg-wrap">
        {labels.map((label, square) => {
          const file = square % 8;
          const rank = Math.floor(square / 8);
          const where = `${FILES[file]}${8 - rank}`;
          return (
            <button
              key={where}
              type="button"
              className={`edit-square ${(file + rank) % 2 ? 'dark' : 'light'}`}
              aria-label={label === EMPTY_SQUARE ? where : `${where}: ${name(label)}`}
              title={where}
              onClick={() => paint(square)}
              dangerouslySetInnerHTML={pieceMarkup(label)}
            />
          );
        })}
      </div>

      <div className="edit-palette cg-wrap" role="group" aria-label={t('Piece to place')}>
        {PIECE_NAMES.map(([label, pieceName]) => (
          <button key={label} type="button" aria-pressed={brush === label} aria-label={t(pieceName)} title={t(pieceName)} onClick={() => setBrush(label)} dangerouslySetInnerHTML={pieceMarkup(label)} />
        ))}
        <button type="button" className="edit-eraser" aria-pressed={brush === EMPTY_SQUARE} title={t('Remove a piece')} onClick={() => setBrush(EMPTY_SQUARE)}>
          {t('Remove a piece')}
        </button>
      </div>

      <div className="diagram-fix-row">
        <select aria-label={t('Side to move')} value={side} onChange={(event) => setSide(event.target.value as Color)}>
          <option value="w">{t('White to move')}</option>
          <option value="b">{t('Black to move')}</option>
        </select>
        <button type="submit" className="coach-primary" disabled={!isValid}>
          {t('Save')}
        </button>
      </div>
      {problem && <span className="fix-problem">{tm(problem)}</span>}

      <details className="composer-sent fix">
        <summary>{t('Write it in FEN')}</summary>
        <input
          aria-label={t('Position in FEN notation')}
          aria-invalid={!isValid}
          value={shown}
          spellCheck={false}
          onChange={(event) => {
            const text = event.target.value.trim();
            setTyped(text);
            // A placement with the right shape also shows on the board above.
            if (PLACEMENT_CHARACTERS.test(text) && placementFromLabels(labelsFromPlacement(text)) === text) setLabels(labelsFromPlacement(text));
          }}
        />
      </details>
    </form>
  );
}

function ClusterImage({ cluster }: { cluster: PieceCluster }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    const size = Math.sqrt(cluster.template.length);
    const image = context.createImageData(size, size);
    cluster.template.forEach((value, i) => {
      image.data[i * 4] = value;
      image.data[i * 4 + 1] = value;
      image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
  }, [cluster]);
  const size = Math.sqrt(cluster.template.length);
  return <canvas ref={ref} width={size} height={size} className="cluster-image" />;
}

export function PiecesPanel(props: {
  calibration: Calibration | null;
  isBusy: boolean;
  onLabel: (clusterId: number, label: string) => void;
  onApply: () => void;
  isDirty: boolean;
}) {
  const { calibration, isBusy, onLabel, onApply, isDirty } = props;
  const { t } = useI18n();
  if (!calibration) {
    return <p className="hint">{t('Analyze this book again to check how its pieces were recognized.')}</p>;
  }

  return (
    <div className="pieces">
      <p className="hint">{t('The pieces as printed in this book. If a name is wrong, correct it and apply.')}</p>
      <ul>
        {calibration.clusters.map((cluster) => (
          <li key={cluster.id}>
            <ClusterImage cluster={cluster} />
            <select
              aria-label={t('Name of printed piece {number}', { number: cluster.id + 1 })}
              value={cluster.label}
              onChange={(event) => onLabel(cluster.id, event.target.value)}
            >
              {PIECE_NAMES.map(([label, name]) => (
                <option key={label} value={label}>
                  {t(name)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <button type="button" disabled={!isDirty || isBusy} onClick={onApply}>
        {t('Apply and analyze again')}
      </button>
    </div>
  );
}
