import { Chess } from 'chess.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RawBook } from '../analysis/analyzeBook';
import type { LineMove } from '../core/uci';
import { findSavedPosition, highlightsOnPage, moveLabel, notebookToMarkdown, notedMoveIds, resolveAnchor, type Anchor, type NotebookEntry } from '../core/notebook';
import { bookMovesFrom, chapterProgress, diagramKey, nextUnsolved, solvableDiagrams, type Chapter, type MoveJudgement } from '../core/guess';
import { dueEntries } from '../core/repetition';
import {
  correctDiagram,
  correctMove,
  diagramFen,
  dismissReview,
  findBookLine,
  nextMoves,
  placeIn,
  previousMove,
} from '../core/overlay';
import type { BookOverlay, Box, Color, MoveNode, ReviewItem, Word } from '../core/types';
import { relabelCluster, type Calibration } from '../vision/classifySquares';
import { Board } from './Board';
import { AiPanel } from './AiPanel';
import { CoachDock } from './CoachDock';
import { isKnownMessage } from './i18n';
import { readSetting, useI18n, writeSetting } from './I18nContext';
import { MoreMenu, PopoverButton } from './MoreMenu';
import { NotebookPanel, type PlayedMove } from './NotebookPanel';
import { PreparationBar } from './PreparationBar';
import type { Progress } from './preparation';
import { hashBytes, openPdf, readBook, readChapters, readPageText, renderCover, renderJob, readWords, runAnalysis } from './bookLoader';
import { Library } from './Library';
import { SettingsDialog } from './SettingsDialog';
import { addBook, bookTitle, canRetryAnalysis, loadBookBytes, markAnalysisRetried, loadOverlay, openedBook, lastPlaceOf, rememberPage, rememberPlace, saveOverlay } from './store';
import { useAiSettings } from './useAiSettings';
import { useCoach, type CoachMoment } from './useCoach';
import { useEngine, type EngineState } from './useEngine';
import { useGuessMode } from './useGuessMode';
import { useNotebook } from './useNotebook';
import { useReviewMode, type ReviewMode } from './useReviewMode';
import { BookMap, GuessBar, NextStep, ReviewBar } from './StudyTools';
import { DEFAULT_ENGINE_SETTINGS, EnginePanel, EvalBar, type EngineSettings } from './EnginePanel';
import { threatFen } from '../core/engineView';
import { analysisFromFile, analysisToFile, notebookFromFile, notebookToFile, readerCorrections, type ImportedAnalysis } from '../core/sharing';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { PageView } from './PageView';
import { DiagramEditPanel, DoubtBar, MoveList, PiecesPanel, ReviewPanel } from './Panels';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const ENGINE_ON = 'chess-coach.engine-on';
const ENGINE_SETTINGS = 'chess-coach.engine-settings';

function readEngineSettings(): EngineSettings {
  try {
    const stored = JSON.parse(readSetting(ENGINE_SETTINGS) ?? 'null') as Partial<EngineSettings> | null;
    const merged = { ...DEFAULT_ENGINE_SETTINGS, ...(stored ?? {}) };
    return { ...merged, lines: [1, 3, 5].includes(merged.lines) ? merged.lines : DEFAULT_ENGINE_SETTINGS.lines };
  } catch {
    return DEFAULT_ENGINE_SETTINGS;
  }
}
const BOARD_FLIPPED = 'chess-coach.board-flipped';
const NOTEBOOK_HIDDEN = 'chess-coach.notebook-hidden';
const PAGE_ZOOM = 'chess-coach.page-zoom';
/** The first shows the whole page. The others are times the width of the page's column. */
const ZOOMS = ['fit', 1, 1.25, 1.5, 2] as const;

type Tab = 'moves' | 'review' | 'pieces' | 'ai';

/** From this width the notebook has a column of its own. Below it, it opens over the page. */
const NOTEBOOK_COLUMN_QUERY = '(min-width: 1100px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const HINT_SEEN = 'chess-coach.hint-seen';
const RESULT_SHOWN_MS = 8000;

interface OpenBook {
  name: string;
  hash: string;
  pdf: PDFDocumentProxy;
}

/** Where the board is. Exploring means the reader has left the book to try moves. */
interface BoardState {
  moveId: string | null;
  diagramId: string | null;
  exploreFen: string | null;
  lastMove?: [string, string] | undefined;
}

const EMPTY_BOARD: BoardState = { moveId: null, diagramId: null, exploreFen: null };
const PAGE_SAVE_DELAY_MS = 500;
/** Doubts above this share of the moves read make AI reading worth suggesting. */
const AI_SUGGESTION_SHARE = 0.05;

export function App() {
  const { t, tm, language } = useI18n();
  const [book, setBook] = useState<OpenBook | null>(null);
  const [overlay, setOverlay] = useState<BookOverlay | null>(null);
  const [raw, setRaw] = useState<RawBook | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibrationDirty, setCalibrationDirty] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [tab, setTab] = useState<Tab>('moves');
  const [showSideLines, setShowSideLines] = useState(true);
  /** A new analysis replaces the reader's corrections, so it asks first. */
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);
  const [analysisRun, setAnalysisRun] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** The book whose reader chose AI reading as they added it, which opens once the first reading is done. */
  const [aiChoice, setAiChoice] = useState<{ hash: string; id: number } | null>(null);
  /** A book the app read with many doubts, for which AI reading is worth suggesting. */
  const [suggestAi, setSuggestAi] = useState(false);
  const [hasSeenHint, setHasSeenHint] = useState(() => readSetting(HINT_SEEN) === 'yes');
  /** The number of moves just found, shown for a moment as the result. */
  const [foundMoves, setFoundMoves] = useState<number | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const ai = useAiSettings();
  const notebook = useNotebook(book?.hash ?? null);
  const isWide = useMediaQuery(NOTEBOOK_COLUMN_QUERY);
  const [isNotebookOpen, setIsNotebookOpen] = useState(() => isWide && readSetting(NOTEBOOK_HIDDEN) !== 'yes');
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const isFixing = tab !== 'moves';
  /** The place being checked. */
  const [reviewMark, setReviewMark] = useState<ReviewItem | null>(null);
  /** A diagram the reader chose to correct from the board, shown instead of the Check list. */
  const [editedDiagramId, setEditedDiagramId] = useState<string | null>(null);
  /** Fixing the reading walks through the book, and closing it goes back to where the reader was. */
  const placeBeforeFixing = useRef<{ page: number; board: BoardState } | null>(null);
  const [isFlipped, setIsFlipped] = useState(() => readSetting(BOARD_FLIPPED) === 'yes');
  const [zoomStep, setZoomStep] = useState(() => {
    const stored = ZOOMS.findIndex((zoom) => String(zoom) === readSetting(PAGE_ZOOM));
    return stored === -1 ? 0 : stored;
  });
  const [isEngineWanted, setIsEngineWanted] = useState(() => readSetting(ENGINE_ON) === 'yes');
  const [engineSettings, setEngineSettingsState] = useState(readEngineSettings);
  const setEngineSettings = useCallback((next: EngineSettings) => {
    setEngineSettingsState(next);
    writeSetting(ENGINE_SETTINGS, JSON.stringify(next));
  }, []);
  const [isThreat, setIsThreat] = useState(false);
  /** In hint mode, the position whose moves the reader asked to see. */
  const [revealedFen, setRevealedFen] = useState<string | null>(null);
  /** A line pointed at in the engine's panel, shown on the board without being played. */
  const [preview, setPreview] = useState<{ fen: string; lastMove: [string, string] } | null>(null);
  const [coachPrefill, setCoachPrefill] = useState<{ text: string; id: number } | null>(null);
  const [boardReset, setBoardReset] = useState(0);

  /** Only the latest request may touch the screen. Anything older has been cancelled. */
  const request = useRef<AbortController | null>(null);
  const wordCache = useRef<{ hash: string; pages: Word[][] } | null>(null);
  const pageRef = useRef(0);
  pageRef.current = page;
  const bookRef = useRef<OpenBook | null>(null);
  bookRef.current = book;

  const dismissHint = useCallback(() => {
    setHasSeenHint(true);
    writeSetting(HINT_SEEN, 'yes');
  }, []);

  const beginRequest = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return controller;
  }, []);

  const closeBook = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setIsLeaving(false);
    setTab('moves');
    placeBeforeFixing.current = null;
    setFoundMoves(null);
    setProgress(null);
    setPendingReplace(null);
    setOverlay(null);
    setRaw(null);
    setCalibration(null);
    setError(null);
    setNotice(null);
    const current = bookRef.current;
    if (current) {
      // The delayed save below is cancelled with the book, so this one must not wait.
      void rememberPage(current.hash, pageRef.current).catch(() => {});
      void current.pdf.loadingTask.destroy();
    }
    setBook(null);
  }, []);

  const analyze = useCallback(
    async (target: OpenBook, givenCalibration?: Calibration, givenRaw?: RawBook): Promise<boolean> => {
      const controller = beginRequest();
      const { signal } = controller;
      setError(null);
      setFoundMoves(null);
      setProgress({ stage: 'reading', share: 0 });
      const report = (next: Progress) => {
        if (!signal.aborted) setProgress(next);
      };
      try {
        const source = givenRaw ?? (await readBook(target.pdf, target.hash, report, signal));
        if (signal.aborted) return false;
        setRaw(source);
        const result = await runAnalysis(source, givenCalibration, report, signal);
        if (signal.aborted) return false;
        setCalibration(result.calibration);
        setCalibrationDirty(false);
        setOverlay(result.overlay);
        setFoundMoves(result.overlay.moves.length);
        setAnalysisRun((run) => run + 1);
        setBoard(EMPTY_BOARD);
        await saveOverlay(result.overlay);
        return true;
      } catch (cause) {
        if (!signal.aborted) setError(cause instanceof Error && isKnownMessage(cause.message) ? cause.message : 'The analysis stopped unexpectedly.');
        return false;
      } finally {
        if (!signal.aborted) setProgress(null);
      }
    },
    [beginRequest],
  );

  /** Opens a book from wherever `load` gets it. A known hash means it came from the library. */
  const openBook = useCallback(
    async (load: () => Promise<{ bytes: Uint8Array; name: string; hash?: string }>, wantsAi = false) => {
      setError(null);
      setNotice(null);
      setSuggestAi(false);
      const controller = beginRequest();
      try {
        setProgress({ stage: 'opening', share: 0 });
        const { bytes, name, hash: knownHash } = await load();
        const hash = knownHash ?? (await hashBytes(bytes));
        const pdf = await openPdf(bytes);
        if (controller.signal.aborted) {
          void pdf.loadingTask.destroy();
          return;
        }
        const opened: OpenBook = { name, hash, pdf };

        // A book that cannot be kept can still be read, this once.
        let startPage = await openedBook(hash).catch(() => null);
        // Read before the book shows, as the board's empty start would soon be saved over it.
        const lastPlace = await lastPlaceOf(hash).catch(() => null);
        if (startPage === null && !knownHash) {
          try {
            await addBook({ hash, name, pageCount: pdf.numPages, cover: await renderCover(pdf) }, bytes);
            startPage = 0;
          } catch {
            setNotice('This book could not be added to your library, so you will need to choose the file again next time.');
          }
        }
        if (controller.signal.aborted) {
          void pdf.loadingTask.destroy();
          return;
        }

        setBook(opened);
        setPage(Math.min(startPage ?? 0, pdf.numPages - 1));
        setBoard(EMPTY_BOARD);
        setCalibration(null);
        setRaw(null);

        const stored = await loadOverlay(hash);
        if (controller.signal.aborted) return;
        if (stored) {
          setOverlay(stored);
          const place = lastPlace && placeIn(stored, lastPlace);
          const move = place?.moveId ? stored.moves.find((m) => m.id === place.moveId) : undefined;
          if (place) setBoard({ ...place, exploreFen: null, lastMove: move ? lastMoveOf(stored, move) : undefined });
          setProgress(null);
          // Every diagram impossible and no moves means the reading failed. A corrected diagram
          // would not look like this, so nothing of the reader's is lost by trying once more.
          const hasFailed = stored.moves.length === 0 && stored.diagrams.length > 0 && stored.diagrams.every((d) => d.issues.length > 0);
          if (hasFailed && (await canRetryAnalysis(hash).catch(() => false)) && !controller.signal.aborted) {
            if (await analyze(opened)) await markAnalysisRetried(hash).catch(() => {});
          }
        } else {
          setOverlay(null);
          // A finished analysis is the newest request, though it has replaced this one's.
          if ((await analyze(opened)) && !wantsAi) setSuggestAi(true);
        }
        // Still this book, and not one opened or closed meanwhile.
        if (wantsAi && bookRef.current?.hash === hash) setAiChoice({ hash, id: Date.now() });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setProgress(null);
        setError(cause instanceof Error && isKnownMessage(cause.message) ? cause.message : 'This PDF could not be opened.');
      }
    },
    [analyze, beginRequest],
  );

  const openFile = useCallback(
    (file: File, wantsAi: boolean) => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please choose a PDF file.');
        return;
      }
      void openBook(
        async () => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          name: file.name.replace(/\.pdf$/i, ''),
        }),
        wantsAi,
      );
    },
    [openBook],
  );

  const openSample = useCallback(() => {
    void openBook(async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-book.pdf`).catch(() => null);
      if (!response?.ok) throw new Error('The sample book could not be loaded.');
      return { bytes: new Uint8Array(await response.arrayBuffer()), name: t('Sample book') };
    });
  }, [openBook, t]);

  const openStored = useCallback(
    (hash: string, name: string) => {
      void openBook(async () => {
        const bytes = await loadBookBytes(hash);
        if (!bytes) throw new Error('The copy of this book is gone. Remove it, then open the file again.');
        return { bytes, name, hash };
      });
    },
    [openBook],
  );

  useEffect(() => {
    if (!book) return;
    const timer = setTimeout(() => void rememberPage(book.hash, page).catch(() => {}), PAGE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [book, page]);

  useEffect(() => {
    if (foundMoves === null) return;
    const timer = setTimeout(() => setFoundMoves(null), RESULT_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [foundMoves]);

  // Closing the window would throw the work away as well, so the browser asks first.
  const isPreparing = Boolean(book && progress && progress.stage !== 'opening');
  useEffect(() => {
    if (!isPreparing) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPreparing]);

  const update = useCallback((next: BookOverlay) => {
    setOverlay(next);
    void saveOverlay(next).catch(() => setError('Your corrections could not be saved.'));
  }, []);

  const moveById = useCallback((id: string | null) => overlay?.moves.find((m) => m.id === id) ?? null, [overlay]);
  const currentMove = moveById(board.moveId);

  const line = useMemo<MoveNode[]>(
    () => (overlay && board.moveId ? findBookLine(overlay, board.moveId) : []),
    [overlay, board.moveId],
  );

  const fen = useMemo(() => {
    if (board.exploreFen) return board.exploreFen;
    if (currentMove) return currentMove.fen;
    const shown = overlay && board.diagramId ? diagramFen(overlay, board.diagramId) : null;
    return shown ?? INITIAL_FEN;
  }, [board, currentMove, overlay]);

  const goToMove = useCallback(
    (move: MoveNode) => {
      setBoard({ moveId: move.id, diagramId: move.diagramId, exploreFen: null, lastMove: lastMoveOf(overlay, move) });
      setPage(move.page);
    },
    [overlay],
  );

  const resetBoard = useCallback(() => setBoardReset((count) => count + 1), []);
  const leaveExploring = useCallback(() => setBoard((b) => ({ ...b, exploreFen: null, lastMove: undefined })), []);
  const place = useMemo(() => ({ moveId: board.moveId, diagramId: board.diagramId }), [board.moveId, board.diagramId]);
  const bookFenNow = currentMove?.fen ?? (overlay && board.diagramId ? diagramFen(overlay, board.diagramId) : null);
  const engineRef = useRef<EngineState | null>(null);
  const judgeMove = useCallback(
    (target: string, readerUci: string, bookSan: string): Promise<MoveJudgement | null> =>
      engineRef.current ? engineRef.current.judgeMove(target, readerUci, bookSan) : Promise.resolve(null),
    [],
  );
  const onSolved = useCallback(
    (diagramId: string) => {
      const diagram = overlay?.diagrams.find((d) => d.id === diagramId);
      if (diagram) notebook.markSolved(diagramKey(diagram));
    },
    [overlay, notebook],
  );
  const anchorRef = useRef<Anchor | null>(null);
  const onMissed = useCallback(() => {
    const here = anchorRef.current;
    // The book's own position, where the move was missed, and not moves being tried or the page on screen.
    return here ? notebook.addMissed({ ...here, fen: here.bookFen, page: here.bookPage ?? here.page }) : Promise.resolve(false);
  }, [notebook]);
  const guess = useGuessMode({ overlay, fen, bookFen: bookFenNow, isExploring: Boolean(board.exploreFen), place, goToMove, resetBoard, leaveExploring, judgeMove, onMissed, onSolved });
  const [isPractising, setIsPractising] = useState(false);
  // It would give away the moves being worked out.
  const isEngineShown = Boolean(book) && isEngineWanted && !guess.isOn && !isPractising;
  const threatPosition = useMemo(() => threatFen(fen), [fen]);
  const isThreatShown = isThreat && threatPosition !== null;
  const engineFen = isThreatShown ? threatPosition : fen;
  const engine = useEngine(engineFen, isEngineShown, { lines: engineSettings.lines, strong: engineSettings.strong });
  useEffect(() => setPreview(null), [fen, isEngineShown]);
  engineRef.current = engine;

  // A question asked before this may name moves, or get an answer that shows what is being worked out.
  const isGuessingNow = guess.isOn;
  const stopCoachRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (isGuessingNow) stopCoachRef.current?.();
  }, [isGuessingNow]);

  const stopGuessing = guess.stop;
  useEffect(() => {
    if (!book) stopGuessing();
  }, [book, stopGuessing]);

  const shownLine = useMemo(() => {
    if (!guess.isOn && !isPractising) return line;
    const index = line.findIndex((m) => m.id === board.moveId);
    return line.slice(0, index + 1);
  }, [guess.isOn, isPractising, line, board.moveId]);

  const playEngineLine = useCallback((moves: readonly LineMove[]) => {
    const last = moves[moves.length - 1];
    if (last) setBoard((b) => ({ ...b, exploreFen: last.fen, lastMove: [last.from, last.to] }));
  }, []);

  const toggleFlip = useCallback(() => {
    setIsFlipped((flipped) => {
      writeSetting(BOARD_FLIPPED, flipped ? 'no' : 'yes');
      return !flipped;
    });
  }, []);

  const changeZoom = useCallback((change: number) => {
    setZoomStep((step) => {
      const next = Math.min(ZOOMS.length - 1, Math.max(0, step + change));
      writeSetting(PAGE_ZOOM, String(ZOOMS[next]));
      return next;
    });
  }, []);

  const openFixing = () => {
    placeBeforeFixing.current = { page, board };
    setTab('review');
    setEditedDiagramId(null);
  };

  const closeFixing = useCallback(() => {
    setTab('moves');
    setEditedDiagramId(null);
    const before = placeBeforeFixing.current;
    placeBeforeFixing.current = null;
    if (!before) return;
    setPage(before.page);
    setBoard(before.board);
  }, []);

  /** Leaves fixing where it is, for something the reader wants to do with what is on screen. */
  const showNotebook = useCallback(() => {
    setTab('moves');
    setEditedDiagramId(null);
    placeBeforeFixing.current = null;
    setIsNotebookOpen(true);
  }, []);

  /** Whether the diagram's editor was opened from the Check list, which it then goes back to. */
  const isDiagramFromList = useRef(false);
  const fixDiagram = (diagramId: string) => {
    const diagram = overlay?.diagrams.find((d) => d.id === diagramId);
    if (!diagram) return;
    isDiagramFromList.current = tab === 'review';
    if (!isFixing) placeBeforeFixing.current = { page, board };
    setTab('review');
    setEditedDiagramId(diagramId);
    setPage(diagram.page);
    setBoard({ moveId: null, diagramId, exploreFen: null });
  };

  /** After a save, or a move elsewhere: the reader stays where they are, to see the board it gives. */
  const leaveDiagramEditor = useCallback(() => {
    setEditedDiagramId(null);
    if (isDiagramFromList.current) return;
    setTab('moves');
    placeBeforeFixing.current = null;
  }, []);

  const cancelDiagramEditor = () => {
    if (isDiagramFromList.current) setEditedDiagramId(null);
    else closeFixing();
  };

  // Closing the column, practising or closing the book all leave the Check tab, and the editor with it.
  useEffect(() => {
    if (tab !== 'review') setEditedDiagramId(null);
  }, [tab]);

  // A click on another diagram or move takes the board away from the one being corrected.
  useEffect(() => {
    if (editedDiagramId && board.diagramId !== editedDiagramId) leaveDiagramEditor();
  }, [board.diagramId, editedDiagramId, leaveDiagramEditor]);

  // The reader chose AI reading as they added the book: it opens once the first reading is done.
  const aiChoiceId = aiChoice?.id;
  const isAiChoiceReady = Boolean(aiChoice && book?.hash === aiChoice.hash && overlay && !progress);
  const openedAiChoice = useRef<number | null>(null);
  useEffect(() => {
    if (!isAiChoiceReady || aiChoiceId === undefined || openedAiChoice.current === aiChoiceId) return;
    openedAiChoice.current = aiChoiceId;
    placeBeforeFixing.current = { page: pageRef.current, board: EMPTY_BOARD };
    setTab('ai');
  }, [isAiChoiceReady, aiChoiceId]);

  // Over the page it is only opened when asked for, as the page is what the reader came to see.
  useEffect(() => setIsNotebookOpen(isWide && readSetting(NOTEBOOK_HIDDEN) !== 'yes'), [isWide]);

  const setNotebookShown = useCallback(
    (isShown: boolean) => {
      setIsNotebookOpen(isShown);
      if (isWide) writeSetting(NOTEBOOK_HIDDEN, isShown ? 'no' : 'yes');
    },
    [isWide],
  );

  const toggleEngine = useCallback(() => {
    setIsEngineWanted((wanted) => {
      writeSetting(ENGINE_ON, wanted ? 'no' : 'yes');
      return !wanted;
    });
  }, []);

  const stepForward = useCallback(() => {
    if (!overlay || guess.isOn || isPractising) return;
    const next = board.moveId
      ? nextMoves(overlay, board.moveId)[0]
      : overlay.moves
          .filter((m) => m.parentId === null && m.diagramId === board.diagramId)
          .sort((a, b) => Number(b.isMainLine) - Number(a.isMainLine))[0];
    if (next) goToMove(next);
  }, [overlay, board, goToMove, guess.isOn, isPractising]);

  const stepBack = useCallback(() => {
    // A card is about its own position.
    if (isPractising) return;
    if (board.exploreFen) {
      setBoard((b) => ({ ...b, exploreFen: null, lastMove: undefined }));
      return;
    }
    if (!overlay || !board.moveId) return;
    const previous = previousMove(overlay, board.moveId);
    if (previous) goToMove(previous);
    else setBoard((b) => ({ ...b, moveId: null, lastMove: undefined }));
  }, [overlay, board, goToMove, isPractising]);

  /** Filled in below, where what they call is defined. */
  const shortcuts = useRef<Readonly<Record<string, () => void>>>({});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isSettingsOpen) return;
      // Arrow keys belong to whatever is being typed in.
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight') stepForward();
      else if (event.key === 'ArrowLeft') stepBack();
      else if (event.key === 'PageDown' && overlay) setPage((p) => Math.min(p + 1, overlay.pageCount - 1));
      else if (event.key === 'PageUp') setPage((p) => Math.max(p - 1, 0));
      else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (shortcuts.current[event.key.toLowerCase()]) shortcuts.current[event.key.toLowerCase()]!();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepForward, stepBack, overlay, isSettingsOpen]);

  const reviewRef = useRef<ReviewMode | null>(null);
  const tryMove = useCallback(
    (from: string, to: string) => {
      if (reviewRef.current?.isOn && reviewRef.current.tryMove(from, to)) return;
      if (guess.isOn) {
        guess.tryMove(from, to);
        return;
      }
      try {
        const chess = new Chess(fen);
        chess.move({ from, to, promotion: 'q' });
        setBoard((b) => ({ ...b, exploreFen: chess.fen(), lastMove: [from, to] }));
      } catch {
        resetBoard();
      }
    },
    [fen, guess, resetBoard],
  );

  const goToReview = useCallback(
    (item: ReviewItem) => {
      setReviewMark(item);
      setPage(item.page);
      const move = moveById(item.targetId);
      if (move) goToMove(move);
      else if (overlay?.diagrams.some((d) => d.id === item.targetId)) {
        setBoard({ moveId: null, diagramId: item.targetId, exploreFen: null });
      }
    },
    [moveById, goToMove, overlay],
  );

  /** The words of the book, which stay in memory only. A stored analysis does not have them. */
  const getWords = useCallback(
    async (signal: AbortSignal): Promise<Word[][]> => {
      if (raw) return raw.pageWords;
      if (!book) return [];
      const known = wordCache.current;
      if (known?.hash === book.hash) return known.pages;
      const pages = await readWords(book.pdf, signal);
      wordCache.current = { hash: book.hash, pages };
      return pages;
    },
    [raw, book],
  );


  const analysisInput = useRef<HTMLInputElement>(null);
  const notebookInput = useRef<HTMLInputElement>(null);

  const exportAnalysis = useCallback(() => {
    if (!overlay || !book) return;
    downloadText(`${book.name}.analysis.json`, analysisToFile(overlay), 'application/json');
  }, [overlay, book]);

  const applyAnalysis = useCallback(
    (imported: ImportedAnalysis) => {
      // Nothing running may write over it afterwards.
      beginRequest();
      setProgress(null);
      update(imported.overlay);
      setAnalysisRun((run) => run + 1);
      setBoard(EMPTY_BOARD);
      setSuggestAi(false);
      const moves = imported.overlay.moves.length.toLocaleString(language);
      setNotice(
        imported.dropped
          ? t('The analysis was added, with {moves} moves. {dropped} moves did not fit the rules of chess, so they were left out, and their places are listed to check.', { moves, dropped: imported.dropped })
          : t('The analysis was added, with {moves} moves.', { moves }),
      );
    },
    [beginRequest, update, language, t],
  );

  const importAnalysis = useCallback(
    async (file: File) => {
      if (!book) return;
      setError(null);
      setNotice(null);
      try {
        const imported = analysisFromFile(await file.text(), { hash: book.hash, pageCount: book.pdf.numPages });
        // The reader's own corrections are work, and are not replaced without asking.
        if (readerCorrections(overlay) > 0) setPendingReplace(() => () => applyAnalysis(imported));
        else applyAnalysis(imported);
      } catch (cause) {
        setError(cause instanceof Error && isKnownMessage(cause.message) ? cause.message : 'This is not a file this app can read.');
      }
    },
    [book, overlay, applyAnalysis],
  );

  const exportNotebook = useCallback(() => {
    if (!book) return;
    const kept = { schemaVersion: 1 as const, bookHash: book.hash, entries: notebook.entries, ...(notebook.solved ? { solved: notebook.solved } : {}) };
    downloadText(`${book.name}.notebook.json`, notebookToFile(kept), 'application/json');
  }, [book, notebook.entries, notebook.solved]);

  const importNotebook = useCallback(
    async (file: File) => {
      if (!book) return;
      setError(null);
      setNotice(null);
      try {
        const imported = notebookFromFile(await file.text(), book.hash);
        const added = await notebook.importEntries(imported);
        if (added === null) return;
        setNotice(t('{added} entries were added to your notebook, and {already} were already in it.', { added, already: imported.entries.length - added }));
      } catch (cause) {
        setError(cause instanceof Error && isKnownMessage(cause.message) ? cause.message : 'This is not a file this app can read.');
      }
    },
    [book, notebook, t],
  );

  const exportNotes = useCallback(() => {
    if (!book) return;
    const markdown = notebookToMarkdown(notebook.entries, {
      title: t('Notes on {name}', { name: book.name }),
      page: (number) => t('Page {page}', { page: number }),
      savedPosition: t('Saved position'),
      ownMoves: t('Your own moves'),
      coach: t('Coach'),
    });
    downloadText(`${book.name}.notes.md`, markdown, 'text/markdown');
  }, [book, notebook.entries, t]);

  /** What the reader is looking at, which anything they write attaches to. */
  const anchor = useMemo<Anchor>(() => {
    const bookFen = currentMove?.fen ?? (overlay && board.diagramId ? diagramFen(overlay, board.diagramId) : null);
    return {
      page,
      fen: board.exploreFen ?? bookFen,
      bookFen,
      moveId: board.moveId,
      diagramId: board.diagramId,
      bookPage: currentMove?.page ?? overlay?.diagrams.find((d) => d.id === board.diagramId)?.page ?? null,
      label: currentMove ? moveLabel(currentMove) : null,
    };
  }, [page, board, currentMove, overlay]);

  anchorRef.current = anchor;

  const notedMoves = useMemo(() => notedMoveIds(overlay ?? EMPTY_OVERLAY, notebook.entries), [overlay, notebook.entries]);
  const savedHere = anchor.fen ? findSavedPosition(notebook.entries, anchor.fen) : null;

  const goToEntry = useCallback(
    (entry: NotebookEntry) => {
      const target = resolveAnchor(overlay ?? EMPTY_OVERLAY, entry.anchor);
      if (bookRef.current) setPage(Math.min(target.page, bookRef.current.pdf.numPages - 1));
      if (!target.board) return;
      const move = moveById(target.board.moveId);
      setBoard({ ...target.board, lastMove: move && !target.board.exploreFen ? lastMoveOf(overlay, move) : undefined });
    },
    [overlay, moveById],
  );

  const review = useReviewMode({
    overlay,
    fen,
    place,
    isExploring: Boolean(board.exploreFen),
    goToEntry,
    goToMove,
    resetBoard,
    saveReview: notebook.saveReview,
    judgeMove,
  });
  reviewRef.current = review;
  const isReviewOn = review.isOn;
  useEffect(() => setIsPractising(isReviewOn), [isReviewOn]);
  // A card in practice is not where the reader was reading.
  const boardMoveId = board.moveId;
  const boardDiagramId = board.diagramId;
  useEffect(() => {
    if (!book || isReviewOn) return;
    const place = { moveId: boardMoveId, diagramId: boardDiagramId };
    const timer = setTimeout(() => void rememberPlace(book.hash, place).catch(() => {}), PAGE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [book, boardMoveId, boardDiagramId, isReviewOn]);

  // Leaving practice goes back to the page being read, and not to the last card.
  const placeBeforePractice = useRef<{ page: number; board: BoardState } | null>(null);
  const isBookOpen = Boolean(book);
  useEffect(() => {
    const before = placeBeforePractice.current;
    if (isReviewOn || !before) return;
    placeBeforePractice.current = null;
    if (!isBookOpen) return;
    setPage(before.page);
    setBoard(before.board);
    resetBoard();
  }, [isReviewOn, isBookOpen, resetBoard]);
  const stopReview = review.stop;
  useEffect(() => {
    if (!book) stopReview();
  }, [book, stopReview]);

  // It needs the book's moves to ask about, and a new analysis would move the board under a card.
  const dueNow = overlay && !progress ? dueEntries(notebook.entries, Date.now()) : [];
  const startPractice = () => {
    guess.stop();
    coach.stop();
    setIsCoachOpen(false);
    setTab('moves');
    placeBeforeFixing.current = null;
    placeBeforePractice.current = { page, board };
    review.start(dueNow);
  };

  const getMoment = useCallback((): CoachMoment => {
    const index = line.findIndex((m) => m.id === board.moveId);
    const toBookMove = (move: MoveNode) => ({ label: moveLabel(move), isDoubtful: move.confidence === 'low' });
    return {
      anchor,
      isExploring: Boolean(board.exploreFen),
      isGuessing: guess.isOn,
      bookLine: line.slice(0, index + 1).map(toBookMove),
      // Not while the reader is working the moves out for themselves.
      bookNext: guess.isOn || isPractising ? [] : line.slice(index + 1, index + 7).map(toBookMove),
    };
  }, [line, board, anchor, guess.isOn, isPractising]);

  const getPageText = useCallback((target: number) => {
    const current = bookRef.current;
    return current ? readPageText(current.pdf, target) : Promise.resolve('');
  }, []);

  const coach = useCoach({
    bookHash: book?.hash ?? null,
    provider: ai.resolved,
    language,
    notebook,
    engine,
    getMoment,
    getPageText,
    explainQuestion: t('Explain the selected passage.'),
  });

  stopCoachRef.current = coach.stop;

  const playAnswerMove = useCallback(
    (entry: NotebookEntry, move: PlayedMove) => {
      const target = resolveAnchor(overlay ?? EMPTY_OVERLAY, entry.anchor);
      if (bookRef.current) setPage(Math.min(target.page, bookRef.current.pdf.numPages - 1));
      setBoard({
        moveId: target.board?.moveId ?? null,
        diagramId: target.board?.diagramId ?? null,
        exploreFen: move.fen,
        lastMove: [move.from, move.to],
      });
    },
    [overlay],
  );

  const onSelectionNote = useCallback(
    (text: string, boxes: Box[]) => {
      notebook.setPendingSelection({ page, text, boxes });
      notebook.focusComposer();
      showNotebook();
    },
    [notebook, page, showNotebook],
  );

  const onSelectionExplain = useCallback(
    (text: string, boxes: Box[]) => {
      setIsCoachOpen(true);
      void coach.ask({ selection: { page, text, boxes } });
    },
    [coach, page],
  );

  // A selection belongs to its page, and must not go with a question about another.
  const selectionPage = notebook.pendingSelection?.page;
  const clearSelection = notebook.setPendingSelection;
  useEffect(() => {
    if (selectionPage !== undefined && selectionPage !== page) clearSelection(null);
  }, [selectionPage, page, clearSelection]);

  // A repeat that has just come due shows without waiting for something else to change.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const [chapters, setChapters] = useState<readonly Chapter[]>([]);
  const openPdfDocument = book?.pdf ?? null;
  useEffect(() => {
    setChapters([]);
    if (!openPdfDocument) return;
    let isCurrent = true;
    void readChapters(openPdfDocument).then((found) => {
      if (isCurrent) setChapters(found);
    });
    return () => {
      isCurrent = false;
    };
  }, [openPdfDocument]);

  const solvedKeys = useMemo(() => new Set(notebook.solved ?? []), [notebook.solved]);
  const solvedDiagramIds = useMemo(
    () => new Set((overlay?.diagrams ?? []).filter((d) => solvedKeys.has(diagramKey(d))).map((d) => d.id)),
    [overlay, solvedKeys],
  );
  const solvable = useMemo(() => (overlay ? solvableDiagrams(overlay) : []), [overlay]);
  const currentDiagram = overlay?.diagrams.find((d) => d.id === board.diagramId) ?? null;
  const nextDiagram = overlay ? nextUnsolved(overlay, solvedKeys, page, currentDiagram) : null;
  const goToNextDiagram = nextDiagram
    ? () => {
        setPage(nextDiagram.page);
        setBoard({ moveId: null, diagramId: nextDiagram.id, exploreFen: null });
      }
    : null;
  const solveNextDiagram = goToNextDiagram
    ? () => {
        goToNextDiagram();
        // Started on the next render, once the board is at the diagram.
        setShouldStartGuessing(true);
      }
    : null;
  const [shouldStartGuessing, setShouldStartGuessing] = useState(false);
  const startGuessing = guess.start;
  useEffect(() => {
    if (!shouldStartGuessing) return;
    setShouldStartGuessing(false);
    startGuessing();
  }, [shouldStartGuessing, startGuessing]);
  // Not while the diagram is being corrected, since a save replays the lines being guessed.
  const isDiagramSolvable = Boolean(!editedDiagramId && !guess.isOn && !review.isOn && !board.moveId && !board.exploreFen && currentDiagram && solvable.some((d) => d.id === currentDiagram.id));

  // The diagram on the board comes first while it is still to be solved. Otherwise the next one is.
  const isStepHere = Boolean(isDiagramSolvable && currentDiagram && !solvedKeys.has(diagramKey(currentDiagram)));
  const stepDiagram = isStepHere ? currentDiagram : nextDiagram;

  const doubtfulMove = currentMove?.confidence === 'low' && !board.exploreFen && !guess.isOn && !review.isOn && !isFixing ? currentMove : null;
  const doubtItem = doubtfulMove ? overlay?.review.find((item) => item.targetId === doubtfulMove.id) : undefined;
  // A book can print one move in several lines, which is one choice for the reader.
  const choices = overlay && !board.exploreFen && !guess.isOn && !review.isOn
    ? bookMovesFrom(overlay, place).filter((move, index, all) => all.findIndex((other) => other.san === move.san) === index)
    : [];

  const onSavePosition = useCallback(() => {
    // The star shows that it was saved, with no need to cover the page. Pressing it again goes to the entry.
    if (savedHere) {
      notebook.showEntry(savedHere.id);
      showNotebook();
    } else void notebook.savePosition(anchor);
  }, [savedHere, notebook, anchor, showNotebook]);

  // The engine's view, drawn on the board and offered to the coach.
  const bookNext = overlay && !board.exploreFen && !isThreatShown ? bookMovesFrom(overlay, place)[0] : undefined;
  const bookMoveForEngine = useMemo(() => {
    if (!bookNext) return null;
    try {
      const played = new Chess(fen).move(bookNext.san);
      return { san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ''}` };
    } catch {
      return null;
    }
  }, [bookNext, fen]);
  const isRevealed = revealedFen === fen;
  const engineArrows = useMemo<DrawShape[]>(() => {
    if (!isEngineShown || !engineSettings.arrows || preview || (engineSettings.hints && !isRevealed)) return [];
    return engine.lines.slice(0, engineSettings.lines).flatMap((found) => {
      const first = found.moves[0];
      if (!first) return [];
      return [{ orig: first.from as Key, dest: first.to as Key, brush: found.rank === 1 ? (isThreatShown ? 'red' : 'green') : 'paleBlue' }];
    });
  }, [isEngineShown, engineSettings, preview, isRevealed, engine.lines, isThreatShown]);
  const previewLine = useCallback((moves: readonly LineMove[] | null) => {
    const last = moves?.[moves.length - 1];
    setPreview(last ? { fen: last.fen, lastMove: [last.from, last.to] } : null);
  }, []);
  const askCoach = useCallback((text: string) => {
    setIsCoachOpen(true);
    setCoachPrefill({ text, id: Date.now() });
  }, []);

  shortcuts.current = {
    f: toggleFlip,
    n: () => {
      showNotebook();
      notebook.focusComposer();
    },
    // A menu that is open takes Escape first.
    ...(isFixing
      ? {
          escape: () => {
            if (!document.querySelector('.more-list')) closeFixing();
          },
        }
      : {}),
    ...(review.isOn
      ? {
          escape: () => {
            if (!document.querySelector('.more-list')) review.stop();
          },
        }
      : { c: () => setIsCoachOpen((open) => !open) }),
    ...(anchor.fen ? { s: onSavePosition } : {}),
    ...(review.isOn || guess.isOn ? {} : { e: toggleEngine }),
    ...(review.isOn || !overlay ? {} : { g: guess.isOn ? guess.stop : guess.start }),
  };

  // Always the first child below, so that a book opening behind it does not reset what is typed.
  const settingsDialog = isSettingsOpen && ai.isLoaded && <SettingsDialog ai={ai} onClose={() => setIsSettingsOpen(false)} />;

  if (!book) {
    return (
      <>
        {settingsDialog}
        <Library
          error={error}
          progress={progress && <OpeningNote />}
          isBusy={Boolean(progress)}
          onFile={openFile}
          aiDestination={ai.resolved.config ? ai.resolved.destination : null}
          onOpen={openStored}
          onSample={openSample}
          onSettings={() => setIsSettingsOpen(true)}
        />
      </>
    );
  }

  return (
    <>
      {settingsDialog}
    <div className="app">
      <header className="bar">
        <button type="button" className="quiet" onClick={() => (isPreparing ? setIsLeaving(true) : closeBook())}>
          ‹ {t('Library')}
        </button>
        <h1 title={book.name}>{bookTitle(book.name)}</h1>
        <nav className="pager" aria-label={t('Pages')}>
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t('Previous page')}>
            ‹
          </button>
          <label>
            <input
              type="number"
              min={1}
              max={book.pdf.numPages}
              value={page + 1}
              aria-label={t('Page number')}
              onChange={(event) => {
                const value = Number(event.target.value) - 1;
                if (value >= 0 && value < book.pdf.numPages) setPage(value);
              }}
            />{' '}
            {t('of {total}', { total: book.pdf.numPages })}
          </label>
          <button
            type="button"
            disabled={page >= book.pdf.numPages - 1}
            onClick={() => setPage(page + 1)}
            aria-label={t('Next page')}
          >
            ›
          </button>
          <span className="zoom">
            <button type="button" disabled={zoomStep === 0} onClick={() => changeZoom(-1)} aria-label={t('Smaller page')} title={t('Smaller page')}>
              −
            </button>
            <span className="zoom-level" title={t('Page size')}>
              {ZOOMS[zoomStep] === 'fit' ? t('Whole page') : `${Math.round(Number(ZOOMS[zoomStep]) * 100)}%`}
            </span>
            <button type="button" disabled={zoomStep === ZOOMS.length - 1} onClick={() => changeZoom(1)} aria-label={t('Larger page')} title={t('Larger page')}>
              +
            </button>
          </span>
        </nav>
        {overlay && solvable.length > 0 && (
          <PopoverButton label={t('Contents')}>
            {(close) => (
              <BookMap
                chapters={chapterProgress(chapters, overlay, solvedKeys)}
                solved={solvable.filter((d) => solvedKeys.has(diagramKey(d))).length}
                total={solvable.length}
                onGoTo={(target) => {
                  setPage(target);
                  close();
                }}
                onNextDiagram={
                  solveNextDiagram && !review.isOn
                    ? () => {
                        solveNextDiagram();
                        close();
                      }
                    : null
                }
              />
            )}
          </PopoverButton>
        )}
        {review.isOn ? (
          <button type="button" className="practise-close" onClick={review.stop} title={`${t('Close practice')} (Esc)`}>
            × {t('Close practice')}
          </button>
        ) : (
          dueNow.length > 0 && (
            <button type="button" className="practise" onClick={startPractice} title={t('Saved positions are waiting to be practised')}>
              {t('Practise ({count})', { count: dueNow.length })}
            </button>
          )
        )}
        <button
          type="button"
          className={`quiet${isNotebookOpen && !isFixing ? ' on' : ''}`}
          aria-pressed={isNotebookOpen && !isFixing}
          onClick={() => (isFixing ? showNotebook() : setNotebookShown(!isNotebookOpen))}
          title={`${t('Show or hide the notebook beside the page')} (N)`}
        >
          {t('Notebook ({count})', { count: notebook.entries.length })}
        </button>
        <MoreMenu>
          {(close) => (
            <>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setIsSettingsOpen(true);
                  close();
                }}
              >
                {t('Settings')}
              </button>
              {overlay && (
                <button
                  type="button"
                  className={`quiet${isFixing ? ' on' : ''}`}
                  aria-pressed={isFixing}
                  disabled={review.isOn}
                  title={t('Go over what the app was unsure of when it read this book')}
                  onClick={() => {
                    if (isFixing) closeFixing();
                    else openFixing();
                    close();
                  }}
                >
                  {t('Fix the reading ({count})', { count: overlay.review.length })}
                </button>
              )}
              <label className="toggle">
                <input type="checkbox" checked={showSideLines} onChange={(e) => setShowSideLines(e.target.checked)} /> {t('Show side lines')}
              </label>
              <button
                type="button"
                className="quiet"
                disabled={!overlay}
                onClick={() => {
                  exportAnalysis();
                  close();
                }}
              >
                {t('Export the analysis')}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={Boolean(progress) || review.isOn}
                onClick={() => {
                  analysisInput.current?.click();
                  close();
                }}
              >
                {t('Import an analysis…')}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={!notebook.entries.length}
                onClick={() => {
                  exportNotebook();
                  close();
                }}
              >
                {t('Back up the notebook')}
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  notebookInput.current?.click();
                  close();
                }}
              >
                {t('Restore a notebook…')}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={!notebook.entries.length}
                onClick={() => {
                  exportNotes();
                  close();
                }}
              >
                {t('Export notes')}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={Boolean(progress) || review.isOn}
                onClick={() => {
                  setPendingReplace(() => () => void analyze(book, undefined, raw ?? undefined));
                  close();
                }}
              >
                {t('Analyze again')}
              </button>
              <p className="more-note">{t('An analysis or notebook file fits only the very PDF it was made from, and holds no text of the book.')}</p>
              <p className="more-note">{t('Keys: N note, C coach, S save, F flip, E engine, G guess')}</p>
            </>
          )}
        </MoreMenu>
      </header>

      {/* Outside the menu, which is gone by the time a file is chosen. */}
      <input
        ref={analysisInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importAnalysis(file);
        }}
      />
      <input
        ref={notebookInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importNotebook(file);
        }}
      />

      {progress && progress.stage !== 'opening' && <PreparationBar progress={progress} />}

      {suggestAi && !progress && overlay && overlay.review.length > overlay.moves.length * AI_SUGGESTION_SHARE && (
        <div className="first-hint" role="status">
          <span>{t('The app is unsure of many places in this book, as happens with scanned books. AI reading can make it more accurate.')}</span>
          <button
            type="button"
            onClick={() => {
              setSuggestAi(false);
              openFixing();
              setTab('ai');
            }}
          >
            {t('See AI reading')}
          </button>
          <button type="button" className="quiet" onClick={() => setSuggestAi(false)} aria-label={t('Dismiss')} title={t('Dismiss')}>
            ×
          </button>
        </div>
      )}

      {isLeaving && isPreparing && (
        <div className="confirm" role="alertdialog" aria-label={t('Leave the book')}>
          <span>{t('Preparing this book will stop, and start over next time.')}</span>
          <button type="button" onClick={closeBook}>
            {t('Leave the book')}
          </button>
          <button type="button" className="quiet" autoFocus onClick={() => setIsLeaving(false)}>
            {t('Stay here')}
          </button>
        </div>
      )}

      {foundMoves !== null && !progress && (
        <div className="first-hint ready" role="status">
          <span>
            {foundMoves > 0
              ? t('Ready: {moves} moves found. Click a colored move.', { moves: foundMoves.toLocaleString(language) })
              : t('Ready, but no moves were found in this book. You can still click its diagrams.')}
          </span>
          <button type="button" className="quiet" onClick={() => setFoundMoves(null)} aria-label={t('Dismiss')} title={t('Dismiss')}>
            ×
          </button>
        </div>
      )}

      {foundMoves === null && !hasSeenHint && !progress && Boolean(overlay?.moves.length) && (
        <div className="first-hint" role="status">
          <span>{t('Click a colored move on the page, and the board goes to that position. The app is unsure of the yellow ones.')}</span>
          <button type="button" className="quiet" onClick={dismissHint} aria-label={t('Dismiss')} title={t('Dismiss')}>
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {tm(error)}
        </p>
      )}

      {notice && (
        <p className="hint notice" role="status">
          {tm(notice)}
        </p>
      )}

      {pendingReplace && (
        <div className="confirm" role="alertdialog" aria-label={t('Analyze again')}>
          <span>{t('A new analysis replaces your corrections to this book. Your notes stay.')}</span>
          <button
            type="button"
            onClick={() => {
              pendingReplace();
              setPendingReplace(null);
            }}
          >
            {t('Replace them')}
          </button>
          {/* The safe answer takes focus, because the menu item that opened this has gone. */}
          <button type="button" className="quiet" autoFocus onClick={() => setPendingReplace(null)}>
            {t('Keep them')}
          </button>
        </div>
      )}

      <main className={`reader${isNotebookOpen || isFixing ? ' notebook-open' : ''}${(isNotebookOpen || isFixing) && isWide ? ' with-notebook' : ''}`}>
        <div className="page-area">
        <section className="left" aria-label={t('Book page')}>
          <PageView
            pdf={book.pdf}
            overlay={overlay ?? EMPTY_OVERLAY}
            page={page}
            currentMoveId={board.moveId}
            currentDiagramId={board.diagramId}
            showSideLines={showSideLines}
            notedMoveIds={notedMoves}
            hiddenMoveIds={guess.hidden}
            highlights={highlightsOnPage(notebook.entries, page)}
            isCovered={review.coversPage || Boolean(guess.cover && page > guess.cover.page)}
            coverFrom={guess.cover && guess.cover.page === page ? guess.cover.box : null}
            solvedDiagramIds={solvedDiagramIds}
            solvableDiagramId={isDiagramSolvable ? board.diagramId : null}
            onSolve={guess.start}
            markedBox={tab === 'review' && !editedDiagramId && reviewMark?.page === page ? reviewMark.box : null}
            zoom={ZOOMS[zoomStep] ?? 'fit'}
            onSelectionNote={onSelectionNote}
            onSelectionExplain={onSelectionExplain}
            onMove={(id) => {
              const move = moveById(id);
              if (move) goToMove(move);
              // The hint has done its work once a reader has found the moves.
              dismissHint();
            }}
            onDiagram={(id) => setBoard({ moveId: null, diagramId: id, exploreFen: null })}
          />
        </section>
        {/* Over the page, because its moves play on the board and must leave that in view. */}
        {!review.isOn && (
          <CoachDock
            key={book.hash}
            coach={coach}
            notebook={notebook}
            anchor={anchor}
            isOpen={isCoachOpen}
            isGuessing={guess.isOn}
            onOpenChange={setIsCoachOpen}
            onGoTo={goToEntry}
            onPlay={playAnswerMove}
            onSettings={() => setIsSettingsOpen(true)}
            prefill={coachPrefill}
          />
        )}
        </div>

        <aside className="right" aria-label={t('Board and tools')}>
          <Board
            fen={preview?.fen ?? fen}
            lastMove={preview?.lastMove ?? board.lastMove}
            onUserMove={tryMove}
            resetKey={boardReset}
            orientation={isFlipped ? 'black' : 'white'}
            arrows={engineArrows}
            isPreview={Boolean(preview)}
          />
          {isEngineShown && !isThreatShown && <EvalBar score={engine.lines[0]?.score ?? null} />}

          <div className="controls">
            <button type="button" onClick={stepBack} aria-label={t('Previous move')} title={t('Left arrow key')}>
              ←
            </button>
            <button type="button" onClick={stepForward} aria-label={t('Next move')} title={t('Right arrow key')}>
              →
            </button>
            <button type="button" onClick={toggleFlip} aria-label={t('Flip the board')} title={`${t('Flip the board')} (F)`} aria-pressed={isFlipped}>
              ⇅
            </button>
            {board.exploreFen ? (
              <button type="button" className="back-to-book" onClick={() => setBoard((b) => ({ ...b, exploreFen: null, lastMove: undefined }))}>
                {t('Back to the book')}
              </button>
            ) : (
              <span className="turn" title={fen.split(' ')[1] === 'w' ? t('White to move') : t('Black to move')}>
                <span className={`turn-dot ${fen.split(' ')[1] === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
                {fen.split(' ')[1] === 'w' ? t('White') : t('Black')}
              </span>
            )}
            <span className="controls-gap" />
            <button
              type="button"
              className={savedHere ? 'saved' : ''}
              disabled={!anchor.fen}
              aria-label={savedHere ? t('Saved position') : t('Save position')}
              title={anchor.fen ? `${savedHere ? t('Saved position') : t('Save position')} (S)` : t('Click a move or diagram first, or try a move on the board.')}
              onClick={onSavePosition}
            >
              {savedHere ? `★ ${t('Saved')}` : `☆ ${t('Save')}`}
            </button>
            {!review.isOn && (
              <div className="controls-study">
                <button type="button" aria-pressed={isEngineWanted && !guess.isOn} disabled={guess.isOn} onClick={toggleEngine} title={`${t('A chess engine that runs on this computer')} (E)`}>
                  {t('Engine')}
                </button>
                <button
                  type="button"
                  aria-pressed={guess.isOn}
                  disabled={!overlay}
                  onClick={guess.isOn ? guess.stop : guess.start}
                  title={`${t("Find the book's moves yourself, with those still to come covered on the page")} (G)`}
                >
                  {guess.isOn ? t('Stop guessing') : t('Guess the move')}
                </button>
              </div>
            )}
          </div>

          {/* Only at the diagram itself, where the board can be compared with the page. */}
          {overlay && board.diagramId && !board.moveId && !board.exploreFen && !guess.isOn && !review.isOn && editedDiagramId !== board.diagramId && (
            <button
              type="button"
              className="quiet fix-diagram"
              title={t('Correct the pieces or the side to move, if the board does not match the page')}
              onClick={() => board.diagramId && fixDiagram(board.diagramId)}
            >
              <PencilIcon />
              {t('Fix this diagram')}
            </button>
          )}

          {review.isOn && <ReviewBar review={review} />}

          {doubtfulMove && doubtItem && overlay && (
            <DoubtBar
              overlay={overlay}
              move={doubtfulMove}
              onCorrect={(id, san) => update(correctMove(overlay, id, san))}
              onKeep={() => update(dismissReview(overlay, doubtItem.id))}
            />
          )}

          {guess.isOn && <GuessBar guess={guess} onNextDiagram={goToNextDiagram} />}
          {isEngineShown && !review.isOn && (
            <EnginePanel
              engine={engine}
              fen={engineFen}
              settings={engineSettings}
              onSettings={setEngineSettings}
              isThreat={isThreatShown}
              canShowThreat={threatPosition !== null}
              onThreat={setIsThreat}
              isRevealed={isRevealed}
              onReveal={() => setRevealedFen(fen)}
              bookMove={bookMoveForEngine}
              line={line}
              currentMoveId={board.moveId}
              onGoToMove={goToMove}
              onPlay={(moves) => {
                // What follows is a position of its own, and no longer the other side's threat.
                setIsThreat(false);
                playEngineLine(moves);
              }}
              onPreview={previewLine}
              onAskCoach={askCoach}
            />
          )}

          {/* Each of these could lead away from the card, or show its answer. */}
          <div hidden={review.isOn} className="tools-below">
          <div className="panel">
            {(shownLine.length > 0 || !guess.isOn) && (
              <MoveList
                line={shownLine}
                currentId={board.moveId}
                choices={choices}
                onSelect={(id) => {
                  const move = moveById(id);
                  if (move) goToMove(move);
                }}
              />
            )}
          </div>
          {solvable.length > 0 && !guess.isOn && !review.isOn && (
            <NextStep
              solved={solvable.filter((d) => solvedKeys.has(diagramKey(d))).length}
              total={solvable.length}
              next={
                stepDiagram
                  ? {
                      page: stepDiagram.page,
                      chapter: chapters.filter((c) => c.page <= stepDiagram.page).sort((a, b) => b.page - a.page)[0]?.title ?? null,
                      isHere: isStepHere,
                    }
                  : null
              }
              onSolve={() => (isStepHere ? guess.start() : solveNextDiagram?.())}
              onShow={() => goToNextDiagram?.()}
            />
          )}
          </div>
        </aside>

        {/* In the notebook's place, with the page and board beside it. Stays mounted, so that a run, its Stop button and the key outlive closing it. */}
        <aside className="notebook-column fix-column" hidden={!isFixing} aria-label={t('Fix the reading')}>
          <div className="notebook-head">
            <h2>{t('Fix the reading')}</h2>
            <button type="button" className="quiet" aria-label={t('Close')} title={`${t('Close')} (Esc)`} onClick={closeFixing}>
              ×
            </button>
          </div>
          <div className="tabs" role="tablist">
            {(['review', 'pieces', 'ai'] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? 'active' : ''}
                onClick={() => {
                  setTab(name);
                  setEditedDiagramId(null);
                }}
              >
                {name === 'review' ? t('Check ({count})', { count: overlay?.review.length ?? 0 }) : name === 'pieces' ? t('Pieces') : t('Read with AI')}
              </button>
            ))}
          </div>
          <div className="fix-body">
            {tab === 'review' && overlay && editedDiagramId && (
              <DiagramEditPanel
                overlay={overlay}
                diagramId={editedDiagramId}
                onCorrect={(id, placement, side: Color) => {
                  update(correctDiagram(overlay, id, placement, side));
                  leaveDiagramEditor();
                }}
                onCancel={cancelDiagramEditor}
              />
            )}
            {tab === 'review' && overlay && !editedDiagramId && (
              <ReviewPanel
                overlay={overlay}
                startPage={page}
                onGoTo={goToReview}
                onDismiss={(id) => update(dismissReview(overlay, id))}
                onCorrectMove={(id, san) => update(correctMove(overlay, id, san))}
                onCorrectDiagram={(id, placement, side: Color) => update(correctDiagram(overlay, id, placement, side))}
                onReadWithAi={() => setTab('ai')}
              />
            )}
            {overlay && (
              <AiPanel
                key={book.hash}
                isVisible={tab === 'ai'}
                analysisRun={analysisRun}
                overlay={overlay}
                provider={ai.resolved}
                onRunEnded={ai.chatGpt.refresh}
                onSettings={() => setIsSettingsOpen(true)}
                getWords={getWords}
                renderJob={(job) => renderJob(book.pdf, job)}
                onOverlay={update}
                beginRequest={beginRequest}
                isBusy={Boolean(progress)}
                chosenAtStart={aiChoice?.hash === book.hash ? aiChoice.id : null}
              />
            )}
            {tab === 'pieces' && (
              <PiecesPanel
                calibration={calibration}
                isBusy={Boolean(progress)}
                isDirty={calibrationDirty}
                onLabel={(id, label) => {
                  if (!calibration) return;
                  setCalibration(relabelCluster(calibration, id, label));
                  setCalibrationDirty(true);
                }}
                onApply={() => {
                  if (calibration && raw) setPendingReplace(() => () => void analyze(book, calibration, raw));
                }}
              />
            )}
          </div>
        </aside>

        {isNotebookOpen && !isFixing && (
          <aside
            className="notebook-column"
            aria-label={t('Study notebook')}
            onKeyDown={(event) => {
              // Escape belongs to a note being edited first.
              if (event.key === 'Escape' && !isWide && !event.defaultPrevented) setIsNotebookOpen(false);
            }}
          >
            <div className="notebook-head">
              <h2>{t('Study notebook')}</h2>
              <button type="button" className="quiet" aria-label={t('Close the notebook')} title={t('Close the notebook')} onClick={() => setNotebookShown(false)}>
                ×
              </button>
            </div>
            <NotebookPanel notebook={notebook} anchor={anchor} isPractising={review.isOn} hidesAnswers={guess.isOn} onGoTo={goToEntry} onPlay={playAnswerMove} />
          </aside>
        )}
      </main>
    </div>
    </>
  );
}

const EMPTY_OVERLAY: BookOverlay = {
  schemaVersion: 1,
  bookHash: '',
  pageCount: 0,
  diagrams: [],
  moves: [],
  review: [],
};

function lastMoveOf(overlay: BookOverlay | null, move: MoveNode): [string, string] | undefined {
  if (!overlay) return undefined;
  const parent = move.parentId ? overlay.moves.find((m) => m.id === move.parentId) : null;
  try {
    const before = parent?.fen;
    if (!before) return undefined;
    const played = new Chess(before).move(move.san);
    return [played.from, played.to];
  } catch {
    return undefined;
  }
}

function OpeningNote() {
  const { t } = useI18n();
  return (
    <div className="progress" role="status">
      <span>{t('Opening the book')}</span>
    </div>
  );
}

/** A pencil, drawn like the coach's icon, for changing what the app read. */
function PencilIcon() {
  return (
    <svg className="fix-diagram-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.2 5.3l3.5 3.5M4.5 19.5l1-4.3L16.4 4.3a1.6 1.6 0 0 1 2.3 0l1 1a1.6 1.6 0 0 1 0 2.3L8.8 18.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
