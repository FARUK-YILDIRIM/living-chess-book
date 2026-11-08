import { useEffect, useState } from 'react';
import { compareBookMove, lineText, numberedLine, verdictOf, whiteShare, type BookComparison } from '../core/engineView';
import type { MoveNode } from '../core/types';
import { formatScore, type EngineLine, type EngineScore, type LineMove } from '../core/uci';
import { useI18n } from './I18nContext';
import { PopoverButton } from './MoreMenu';
import type { EngineState } from './useEngine';

export interface EngineSettings {
  /** How many of its best lines the engine shows. */
  lines: number;
  /** The full build of the engine, about 99 MB. */
  strong: boolean;
  /** The best moves drawn as arrows on the board. */
  arrows: boolean;
  /** Only how the position stands, with the moves shown when asked for. */
  hints: boolean;
  /** Every line in full, and not only the best one. */
  expanded: boolean;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = { lines: 3, strong: false, arrows: true, hints: false, expanded: false };
const LINE_COUNTS = [1, 3, 5] as const;
const SHORT_MOVES = 6;
const LONG_MOVES = 12;
/** Shallower lines change too much to compare the book's move with. */
const COMPARE_DEPTH = 12;
const BOOK_MOVE_MS = 1000;
const MIN_SCORED_DEPTH = 6;

interface Props {
  engine: EngineState;
  /** The position the engine looks at: the board's, or with the other side to move while looking for threats. */
  fen: string;
  settings: EngineSettings;
  onSettings: (next: EngineSettings) => void;
  isThreat: boolean;
  /** False while the side to move is in check, when the other side cannot be given the move. */
  canShowThreat: boolean;
  onThreat: (isOn: boolean) => void;
  /** In hint mode, whether the reader has asked to see the moves here. */
  isRevealed: boolean;
  onReveal: () => void;
  /** The book's next move from this position, if the board is on the book's line. */
  bookMove: { san: string; uci: string } | null;
  /** The book's line up to here, for the graph. */
  line: readonly MoveNode[];
  currentMoveId: string | null;
  onGoToMove: (move: MoveNode) => void;
  onPlay: (moves: readonly LineMove[]) => void;
  /** Shows a line on the board while it is pointed at, without playing it. */
  onPreview: (moves: readonly LineMove[] | null) => void;
  onAskCoach: (text: string) => void;
}

/** What the engine thinks of the board's position, in words, lines, arrows and a graph. See ADR-0014. */
export function EnginePanel(props: Props) {
  const { engine, fen, settings, onSettings, isThreat, canShowThreat, onThreat, isRevealed, onReveal, bookMove, line, currentMoveId, onGoToMove, onPlay, onPreview, onAskCoach } = props;
  const { t } = useI18n();
  const [isGraphShown, setIsGraphShown] = useState(false);
  const { status, lines } = engine;
  const best = lines[0];
  const isHidden = settings.hints && !isRevealed;

  const note =
    status === 'failed'
      ? t('The engine could not start. Turn it off and on to try again.')
      : status === 'game-over'
        ? t('The game has ended in this position.')
        : status === 'impossible'
          ? t('This position cannot occur in a game, so the engine cannot look at it. The diagram may be misread.')
          : !best
            ? settings.strong
              ? t('The stronger engine is starting. The first time can take a while.')
              : t('The engine is starting…')
            : null;

  const shown = settings.expanded ? lines : lines.slice(0, 1);

  return (
    <section className="engine" aria-label={t('Engine')}>
      {note ? (
        <p className="hint">{note}</p>
      ) : (
        best && (
          <>
            <div className="engine-head">
              <strong className="engine-verdict">{isThreat ? <ThreatText line={best} fen={fen} /> : <VerdictText score={best.score} />}</strong>
              {!isThreat && <span className="engine-score">{formatScore(best.score)}</span>}
            </div>

            {isHidden ? (
              <button type="button" className="engine-reveal" onClick={onReveal}>
                {t('Show the moves')}
              </button>
            ) : (
              <ol className="engine-lines">
                {shown.map((found) => (
                  <EngineLineRow key={found.rank} line={found} fen={fen} count={settings.expanded ? LONG_MOVES : SHORT_MOVES} isThreat={isThreat} onPlay={onPlay} onPreview={onPreview} onAskCoach={onAskCoach} />
                ))}
              </ol>
            )}

            {bookMove && !isThreat && !isHidden && <BookMoveText engine={engine} fen={fen} bookMove={bookMove} />}
          </>
        )
      )}

      <div className="engine-tools">
        <button type="button" aria-pressed={isThreat} disabled={!canShowThreat && !isThreat} title={canShowThreat ? t('What the other side would play if it could move now') : t('Not while the side to move is in check')} onClick={() => onThreat(!isThreat)}>
          {t('Threat')}
        </button>
        <button type="button" aria-pressed={isGraphShown} disabled={line.length < 2} title={t('How the score changes along the book\'s line')} onClick={() => setIsGraphShown(!isGraphShown)}>
          {t('Graph')}
        </button>
        {lines.length > 1 && (
          <button type="button" aria-expanded={settings.expanded} onClick={() => onSettings({ ...settings, expanded: !settings.expanded })}>
            {settings.expanded ? t('Fewer lines') : t('All lines')}
          </button>
        )}
        <span className="engine-status" title={best ? t('How many moves ahead the engine has looked') : undefined}>
          {best ? (status === 'thinking' ? t('Thinking, depth {depth}', { depth: best.depth }) : t('Depth {depth}', { depth: best.depth })) : ''}
        </span>
        <PopoverButton label="⚙" ariaLabel={t('Engine settings')} className="engine-settings-button">
          {() => <EngineSettingsMenu settings={settings} onSettings={onSettings} />}
        </PopoverButton>
      </div>

      {isGraphShown && line.length >= 2 && <EvalGraph engine={engine} line={line} currentMoveId={currentMoveId} onGoToMove={onGoToMove} />}
    </section>
  );
}

function VerdictText({ score }: { score: EngineScore }) {
  const { t } = useI18n();
  const verdict = verdictOf(score);
  if (verdict.kind === 'equal') return <>{t('The position is level')}</>;
  if (verdict.kind === 'mate') return <>{verdict.side === 'white' ? t('White mates in {moves}', { moves: verdict.moves }) : t('Black mates in {moves}', { moves: verdict.moves })}</>;
  const words = {
    white: { slightly: t('White is slightly better'), clearly: t('White is clearly better'), winning: t('White is winning') },
    black: { slightly: t('Black is slightly better'), clearly: t('Black is clearly better'), winning: t('Black is winning') },
  };
  return <>{words[verdict.side][verdict.degree]}</>;
}

function ThreatText({ line, fen }: { line: EngineLine; fen: string }) {
  const { t } = useI18n();
  const first = numberedLine(fen, line.moves.slice(0, 1));
  return <>{first.length ? t('If the other side could move now, it would play {move}.', { move: lineText(first) }) : t('The other side has nothing to play.')}</>;
}

function EngineLineRow(props: {
  line: EngineLine;
  fen: string;
  count: number;
  isThreat: boolean;
  onPlay: (moves: readonly LineMove[]) => void;
  onPreview: (moves: readonly LineMove[] | null) => void;
  onAskCoach: (text: string) => void;
}) {
  const { line, fen, count, isThreat, onPlay, onPreview, onAskCoach } = props;
  const { t } = useI18n();
  const numbered = numberedLine(fen, line.moves.slice(0, count));
  const all = lineText(numberedLine(fen, line.moves.slice(0, LONG_MOVES)));
  return (
    <li>
      <span className="engine-line-score">{formatScore(line.score)}</span>
      <span className="engine-moves" onMouseLeave={() => onPreview(null)}>
        {numbered.map(({ number, move, index }) => (
          <span key={`${index}-${move.san}`} className="engine-move">
            {number && <span className="number">{number}</span>}
            <button
              type="button"
              className="san"
              title={t('Point at it to see it on the board, click to play it')}
              onMouseEnter={() => onPreview(line.moves.slice(0, index + 1))}
              onFocus={() => onPreview(line.moves.slice(0, index + 1))}
              onBlur={() => onPreview(null)}
              onClick={() => {
                onPreview(null);
                onPlay(line.moves.slice(0, index + 1));
              }}
            >
              {move.san}
            </button>
          </span>
        ))}
      </span>
      <button
        type="button"
        className="quiet engine-ask"
        title={t('Ask the coach about this line')}
        onClick={() => onAskCoach(isThreat ? t('What does the other side threaten here, with {line}?', { line: all }) : t('Explain this line from the engine: {line}', { line: all }))}
      >
        {t('Ask')}
      </button>
    </li>
  );
}

/** The book's move against the engine's, which is where a book can be checked, or found out. */
function BookMoveText({ engine, fen, bookMove }: { engine: EngineState; fen: string; bookMove: { san: string; uci: string } }) {
  const { t, language } = useI18n();
  const { lines, status } = engine;
  const key = `${fen}|${bookMove.uci}`;
  const [ownScore, setOwnScore] = useState<{ key: string; score: EngineScore | null } | null>(null);
  const isAmongLines = lines.some((line) => line.moves[0]?.uci === bookMove.uci);
  const linesForMoves = engine.linesForMoves;

  // A move outside the best lines needs a search of its own, once the one on screen has finished.
  useEffect(() => {
    if (isAmongLines || status !== 'finished' || ownScore?.key === key) return;
    let isCurrent = true;
    void linesForMoves(fen, [bookMove.uci], BOOK_MOVE_MS).then((found) => {
      if (!isCurrent) return;
      const scored = found.find((line) => line.moves[0]?.uci === bookMove.uci && line.depth >= MIN_SCORED_DEPTH);
      setOwnScore({ key, score: scored?.score ?? null });
    });
    return () => {
      isCurrent = false;
    };
  }, [key, isAmongLines, status, ownScore?.key, linesForMoves, fen, bookMove.uci]);

  const move = lineText(numberedLine(fen, [{ san: bookMove.san, fen: '', from: '', to: '', uci: bookMove.uci }]));
  const isDeepEnough = (lines[0]?.depth ?? 0) >= COMPARE_DEPTH;
  const comparison: BookComparison | null = isDeepEnough
    ? compareBookMove(lines, bookMove.uci, fen.split(' ')[1] !== 'b', ownScore?.key === key ? ownScore.score : null)
    : null;
  const engineBest = lines[0]?.moves[0] ? lineText(numberedLine(fen, lines[0].moves.slice(0, 1))) : '';

  if (!comparison) return <p className="engine-book">{t('The book plays {move}. The engine is still weighing it.', { move })}</p>;
  const { rank, judgement } = comparison;
  const pawns = judgement.lossInPawns.toLocaleString(language, { maximumFractionDigits: 1 });
  const text =
    rank === 1
      ? t('The book plays {move}, which is the engine\'s first choice too.', { move })
      : judgement.grade === 'as-good'
        ? rank
          ? t('The book plays {move}, the engine\'s choice number {rank}, and about as good.', { move, rank })
          : t('The book plays {move}, and the engine rates it about as highly as its own choice.', { move })
        : judgement.grade === 'playable'
          ? t('The book plays {move}. It is playable, but the engine prefers {best} by about {pawns} pawns.', { move, best: engineBest, pawns })
          : judgement.lossInPawns >= 50
            ? t('The book plays {move}, but by the engine it misses a mate, or allows one. The engine plays {best}.', { move, best: engineBest })
            : t('The book plays {move}, but the engine finds it weak, about {pawns} pawns worse than {best}.', { move, best: engineBest, pawns });
  return <p className={`engine-book ${judgement.grade}`}>{text}</p>;
}

function EngineSettingsMenu({ settings, onSettings }: { settings: EngineSettings; onSettings: (next: EngineSettings) => void }) {
  const { t } = useI18n();
  return (
    <div className="engine-settings">
      <span className="engine-settings-label">{t('Lines to show')}</span>
      <div className="engine-count" role="group" aria-label={t('Lines to show')}>
        {LINE_COUNTS.map((count) => (
          <button key={count} type="button" aria-pressed={settings.lines === count} onClick={() => onSettings({ ...settings, lines: count })}>
            {count}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={settings.arrows} onChange={(event) => onSettings({ ...settings, arrows: event.target.checked })} /> {t('Arrows on the board')}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.hints} onChange={(event) => onSettings({ ...settings, hints: event.target.checked })} /> {t('Hint mode: hide the moves until asked')}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={settings.strong} onChange={(event) => onSettings({ ...settings, strong: event.target.checked })} /> {t('Stronger engine (about 99 MB, slower to start)')}
      </label>
    </div>
  );
}

/** How the score moves along the book's line, to find where it turns. */
function EvalGraph({ engine, line, currentMoveId, onGoToMove }: { engine: EngineState; line: readonly MoveNode[]; currentMoveId: string | null; onGoToMove: (move: MoveNode) => void }) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Read again whenever a score is kept.
  void engine.scoresSeen;
  const points = line.map((move) => engine.scoreOf(move.fen));
  const missing = points.filter((score) => !score).length;
  const isScoring = progress !== null && progress.done < progress.total;

  const width = 100;
  const height = 36;
  const step = line.length > 1 ? width / (line.length - 1) : width;
  const y = (score: EngineScore) => height * (1 - whiteShare(score));
  let path = '';
  points.forEach((score, index) => {
    if (!score) return;
    const command = index > 0 && points[index - 1] ? 'L' : 'M';
    path += `${command}${(index * step).toFixed(2)},${y(score).toFixed(2)} `;
  });
  const current = line.findIndex((move) => move.id === currentMoveId);

  return (
    <div className="engine-graph">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t('How the score changes along the book\'s line')}>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="engine-graph-middle" />
        {current >= 0 && <line x1={current * step} x2={current * step} y1="0" y2={height} className="engine-graph-current" />}
        <path d={path} className="engine-graph-line" />
        {line.map((move, index) => {
          const score = points[index];
          return (
            <rect key={move.id} x={index * step - step / 2} y="0" width={step} height={height} className="engine-graph-hit" onClick={() => onGoToMove(move)}>
              <title>{`${move.san}${score ? `: ${formatScore(score)}` : ''}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="engine-graph-foot">
        <span>{t('White above the middle, Black below. Click to go to a move.')}</span>
        {missing > 0 &&
          (isScoring ? (
            <span>{t('Scoring {done} of {total}…', { done: progress.done, total: progress.total })}</span>
          ) : (
            <button type="button" onClick={() => void engine.scorePositions(line.map((move) => move.fen), (done, total) => setProgress({ done, total }))}>
              {t('Score {count} positions', { count: missing })}
            </button>
          ))}
      </div>
    </div>
  );
}

/** A bar of White's share, under the board. */
export function EvalBar({ score }: { score: EngineScore | null }) {
  const { t } = useI18n();
  const share = score ? whiteShare(score) : 0.5;
  return (
    <div className="eval-bar" role="meter" aria-label={t('Who stands better')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-valuetext={score ? formatScore(score) : t('Not known yet')}>
      <span className="eval-bar-white" style={{ width: `${share * 100}%` }} />
      <span className={`eval-bar-label ${share >= 0.5 ? 'on-white' : 'on-black'}`}>{score ? formatScore(score) : ''}</span>
    </div>
  );
}
