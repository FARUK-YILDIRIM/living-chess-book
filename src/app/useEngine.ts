import { useCallback, useEffect, useRef, useState } from 'react';
import { gradeMove, type MoveJudgement } from '../core/guess';
import { Chess } from 'chess.js';
import { parseBestMove, parseInfo, positionState, toEngineLine, type EngineLine, type EngineScore } from '../core/uci';

const LITE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;
/** The full build, with its large network: stronger, about 99 MB, and slower to start. */
const STRONG_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-single.js`;
const LIVE_DEPTH = 22;
/** Deep enough for a score to be kept for the graph of a line. */
const KEPT_SCORE_DEPTH = 12;
/** For each position in the graph of a line. */
const GRAPH_MS = 400;
/** Lines change many times a second at first, which is too fast to read or to draw. */
const REDRAW_MS = 250;
/** Deep enough for a coach to rely on for the moves ahead, and quickly reached. */
const GOOD_ENOUGH_DEPTH = 12;
/** A crash in the engine can pass with no error at all, so silence has to count as one. */
const JUDGE_MS = 1000;
const MIN_JUDGE_DEPTH = 6;
const SILENCE_WHILE_THINKING_MS = 30_000;
const SILENCE_AFTER_STOP_MS = 4000;
const SILENCE_WHILE_STARTING_MS = 20_000;
const STRONG_SILENCE_WHILE_STARTING_MS = 90_000;

export interface EngineOptions {
  /** How many of its best lines the engine shows. */
  lines: number;
  strong: boolean;
}

type Limit = { depth: number } | { movetime: number; searchMoves?: readonly string[] };

interface Search {
  fen: string;
  limit: Limit;
  lines: Map<number, EngineLine>;
  onLines?: ((lines: EngineLine[]) => void) | undefined;
  finish: (lines: EngineLine[]) => void;
}

const sorted = (lines: Map<number, EngineLine>) => [...lines.values()].sort((a, b) => a.rank - b.rank);

/** Talks to one engine in a worker, one search at a time. A new search replaces the last. */
class EngineClient {
  private readonly worker: Worker;
  private isReady = false;
  private active: Search | null = null;
  private waiting: Search | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private silenceLimit: number;
  private readonly onFailure: () => void;
  private multiPv: number;
  private appliedMultiPv = 0;

  constructor(url: string, multiPv: number, startLimit: number, onFailure: () => void) {
    this.onFailure = onFailure;
    this.multiPv = multiPv;
    this.silenceLimit = startLimit;
    this.worker = new Worker(url);
    this.worker.onerror = () => this.fail();
    this.worker.onmessage = (event: MessageEvent) => {
      this.watch();
      if (typeof event.data === 'string') this.onLine(event.data);
    };
    this.watch();
    this.send('uci');
  }

  private fail() {
    this.destroy();
    this.onFailure();
  }

  /** Starts over the wait for the engine's next word, if a word is expected. */
  private watch() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    if (this.isReady && !this.active) return;
    this.watchdog = setTimeout(() => this.fail(), this.silenceLimit);
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private finishAll() {
    this.active?.finish(this.active ? sorted(this.active.lines) : []);
    this.waiting?.finish([]);
    this.active = null;
    this.waiting = null;
  }

  private onLine(text: string) {
    if (text === 'uciok') {
      this.applyMultiPv();
      this.send('isready');
    } else if (text === 'readyok') {
      this.isReady = true;
      this.startNext();
      this.watch();
    } else if (parseBestMove(text)) {
      const done = this.active;
      this.active = null;
      done?.finish(sorted(done.lines));
      this.startNext();
      this.watch();
    } else {
      const info = parseInfo(text);
      const search = this.active;
      if (!info || !search) return;
      const line = toEngineLine(info, search.fen);
      if (line.moves.length) search.lines.set(line.rank, line);
      search.onLines?.(sorted(search.lines));
    }
  }

  private applyMultiPv() {
    if (this.appliedMultiPv === this.multiPv) return;
    this.send(`setoption name MultiPV value ${this.multiPv}`);
    this.appliedMultiPv = this.multiPv;
  }

  /** Taken up by the next search. */
  setMultiPv(count: number) {
    this.multiPv = count;
  }

  private startNext() {
    if (!this.isReady || this.active || !this.waiting) return;
    const next = this.waiting;
    this.waiting = null;
    this.active = next;
    this.silenceLimit = SILENCE_WHILE_THINKING_MS;
    this.watch();
    this.applyMultiPv();
    this.send(`position fen ${next.fen}`);
    const only = 'searchMoves' in next.limit && next.limit.searchMoves?.length ? ` searchmoves ${next.limit.searchMoves.join(' ')}` : '';
    this.send('depth' in next.limit ? `go depth ${next.limit.depth}` : `go movetime ${next.limit.movetime}${only}`);
  }

  /** Settles when the search ends or another replaces it, with the lines found by then. */
  search(fen: string, limit: Limit, onLines?: (lines: EngineLine[]) => void): Promise<EngineLine[]> {
    return new Promise((finish) => {
      this.waiting?.finish([]);
      this.waiting = { fen, limit, lines: new Map(), onLines, finish };
      // The engine ends with a `bestmove`, and only then can the next search begin.
      if (this.active) this.sendStop();
      else this.startNext();
    });
  }

  stop() {
    this.waiting?.finish([]);
    this.waiting = null;
    if (this.active) this.sendStop();
  }

  private sendStop() {
    this.silenceLimit = SILENCE_AFTER_STOP_MS;
    this.watch();
    this.send('stop');
  }

  destroy() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    this.worker.onmessage = null;
    this.finishAll();
    this.worker.terminate();
  }
}

export type EngineStatus = 'off' | 'thinking' | 'finished' | 'failed' | 'game-over' | 'impossible';

export interface EngineState {
  status: EngineStatus;
  lines: readonly EngineLine[];
  /** Lines for the coach. Quick, and empty if the engine cannot help. */
  linesFor: (fen: string, movetime: number) => Promise<readonly EngineLine[]>;
  /** The engine's view of particular moves, which may not be among its best. */
  linesForMoves: (fen: string, moves: readonly string[], movetime: number) => Promise<readonly EngineLine[]>;
  /** How a move of the reader's compares with the book's. */
  judgeMove: (fen: string, readerUci: string, bookSan: string) => Promise<MoveJudgement | null>;
  /** A score kept from earlier, from White's side, for the graph of a line. */
  scoreOf: (fen: string) => EngineScore | undefined;
  /** Scores the positions not scored yet, one after another. Settles when done or cut short. */
  scorePositions: (fens: readonly string[], onProgress: (done: number, total: number) => void) => Promise<void>;
  /** Changes whenever a score is kept, so that a graph knows to draw again. */
  scoresSeen: number;
}

/** Runs the engine on the board's position while it is on. It runs here, on this computer. */
export function useEngine(fen: string, isOn: boolean, options: EngineOptions): EngineState {
  const [lines, setLines] = useState<readonly EngineLine[]>([]);
  const [status, setStatus] = useState<EngineStatus>('off');
  const client = useRef<EngineClient | null>(null);
  const live = useRef<{ fen: string; lines: readonly EngineLine[] } | null>(null);
  /** After a failure nothing starts again by itself. Turning the engine on again tries once more. */
  const hasFailed = useRef(false);
  const isSearching = useRef(false);
  /** A search for the coach replaces the one on screen, which must then start again. */
  const [liveRun, setLiveRun] = useState(0);
  const scores = useRef(new Map<string, EngineScore>());
  const [scoresSeen, setScoresSeen] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const keepScore = useCallback((target: string, found: readonly EngineLine[]) => {
    const best = found[0];
    if (!best || best.depth < KEPT_SCORE_DEPTH) return;
    const known = scores.current.get(target);
    scores.current.set(target, best.score);
    if (!known || known.kind !== best.score.kind || known.value !== best.score.value) setScoresSeen((count) => count + 1);
  }, []);

  const getClient = useCallback(() => {
    if (!client.current) {
      try {
        const { strong, lines: count } = optionsRef.current;
        const created: EngineClient = new EngineClient(strong ? STRONG_URL : LITE_URL, count, strong ? STRONG_SILENCE_WHILE_STARTING_MS : SILENCE_WHILE_STARTING_MS, () => {
          // A crash is not retried by itself, and turning the engine on again starts a new one.
          if (client.current === created) client.current = null;
          hasFailed.current = true;
          setStatus('failed');
        });
        client.current = created;
      } catch {
        hasFailed.current = true;
        setStatus('failed');
      }
    }
    return client.current;
  }, []);

  useEffect(() => () => client.current?.destroy(), []);

  // Another build is another worker, started on the next search.
  const isFirstBuild = useRef(true);
  useEffect(() => {
    if (isFirstBuild.current) {
      isFirstBuild.current = false;
      return;
    }
    client.current?.destroy();
    client.current = null;
    hasFailed.current = false;
    isSearching.current = false;
    setLiveRun((run) => run + 1);
  }, [options.strong]);

  const isFirstCount = useRef(true);
  useEffect(() => {
    if (isFirstCount.current) {
      isFirstCount.current = false;
      return;
    }
    client.current?.setMultiPv(options.lines);
    setLiveRun((run) => run + 1);
  }, [options.lines]);

  useEffect(() => {
    live.current = null;
    setLines([]);
    // Only a search of this panel's own: the coach may be using the engine while the panel is off.
    const stopOwnSearch = () => {
      if (isSearching.current) client.current?.stop();
      isSearching.current = false;
    };
    if (!isOn) {
      stopOwnSearch();
      hasFailed.current = false;
      setStatus('off');
      return;
    }
    const state = positionState(fen);
    if (state !== 'playable') {
      stopOwnSearch();
      setStatus(state === 'over' ? 'game-over' : 'impossible');
      return;
    }
    if (hasFailed.current) {
      setStatus('failed');
      return;
    }
    const engine = getClient();
    if (!engine) return;
    setStatus('thinking');
    isSearching.current = true;
    live.current = { fen, lines: [] };

    let isCurrent = true;
    let newest: EngineLine[] | null = null;
    const timer = setInterval(() => {
      if (!newest) return;
      setLines(newest);
      newest = null;
    }, REDRAW_MS);
    void engine
      .search(fen, { depth: LIVE_DEPTH }, (found) => {
        if (!isCurrent) return;
        newest = found;
        live.current = { fen, lines: found };
      })
      .then((found) => {
        if (!isCurrent) return;
        isSearching.current = false;
        clearInterval(timer);
        keepScore(fen, found);
        // A failure ends the search too, and has already said so.
        if (hasFailed.current) return;
        setLines(found);
        setStatus('finished');
      });
    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
  }, [fen, isOn, getClient, liveRun, keepScore]);

  const linesFor = useCallback(
    async (target: string, movetime: number) => {
      if (positionState(target) !== 'playable' || hasFailed.current) return [];
      // The search on screen is already looking at this, and a second one would stop it.
      if (isOn && live.current?.fen === target) {
        const end = Date.now() + movetime;
        while (Date.now() < end && (live.current?.lines[0]?.depth ?? 0) < GOOD_ENOUGH_DEPTH) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return live.current?.fen === target ? live.current.lines : [];
      }
      const engine = getClient();
      return engine ? engine.search(target, { movetime }) : [];
    },
    [getClient, isOn],
  );

  const linesForMoves = useCallback(
    async (target: string, moves: readonly string[], movetime: number) => {
      if (!moves.length || positionState(target) !== 'playable' || hasFailed.current) return [];
      const engine = getClient();
      if (!engine) return [];
      // Only a search that was still running on screen has been cut short, and needs to start again.
      const wasLive = isSearching.current;
      const found = await engine.search(target, { movetime, searchMoves: moves });
      if (isOn && wasLive) setLiveRun((run) => run + 1);
      return found;
    },
    [getClient, isOn],
  );

  const judgeMove = useCallback(
    async (target: string, readerUci: string, bookSan: string): Promise<MoveJudgement | null> => {
      let bookUci: string;
      try {
        const played = new Chess(target).move(bookSan);
        bookUci = `${played.from}${played.to}${played.promotion ?? ''}`;
      } catch {
        return null;
      }
      const found = await linesForMoves(target, [readerUci, bookUci], JUDGE_MS);
      // Too shallow means another search cut this one short, and says little.
      const scoreOf = (uci: string) => found.find((line) => line.depth >= MIN_JUDGE_DEPTH && line.moves[0]?.uci === uci)?.score;
      const reader = scoreOf(readerUci);
      const book = scoreOf(bookUci);
      return reader && book ? gradeMove(reader, book, target.split(' ')[1] === 'w') : null;
    },
    [linesForMoves],
  );

  const scoreOf = useCallback((target: string) => scores.current.get(target), []);

  const scorePositions = useCallback(
    async (fens: readonly string[], onProgress: (done: number, total: number) => void) => {
      const todo = fens.filter((target, index) => fens.indexOf(target) === index && !scores.current.has(target) && positionState(target) === 'playable');
      const engine = getClient();
      if (!engine || hasFailed.current) return;
      const wasLive = isSearching.current;
      onProgress(0, todo.length);
      for (const [index, target] of todo.entries()) {
        const found = await engine.search(target, { movetime: GRAPH_MS });
        if (hasFailed.current || client.current !== engine) return;
        // A search cut short has few lines and little depth, and a new one has taken the engine.
        if (!found.length) break;
        const best = found[0]!;
        scores.current.set(target, best.score);
        setScoresSeen((count) => count + 1);
        onProgress(index + 1, todo.length);
      }
      if (isOn && wasLive) setLiveRun((run) => run + 1);
    },
    [getClient, isOn],
  );

  return { status, lines, linesFor, linesForMoves, judgeMove, scoreOf, scorePositions, scoresSeen };
}
