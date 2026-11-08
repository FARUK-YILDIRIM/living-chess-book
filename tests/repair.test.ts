import { describe, expect, it } from 'vitest';
import { analyzeWords } from '../src/core/book';
import { correctMove, overlayFromJson, overlayToJson } from '../src/core/overlay';
import {
  alignToTokens,
  applyRepair,
  checkReply,
  findRepairJobs,
  normalizeSan,
  parseLineReply,
  type RepairJob,
} from '../src/core/repair';
import type { BookOverlay, Diagram, Word } from '../src/core/types';

const PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const diagram: Diagram = {
  id: 'd0',
  page: 0,
  box: { x0: 50, y0: 10, x1: 250, y1: 210 },
  placement: PLACEMENT,
  sideToMove: 'w',
  label: 'problem 1',
  issues: [],
  confidence: 1,
};

/** Words laid out left to right under the diagram. */
function wordsOf(texts: string[]): Word[] {
  return texts.map((text, i) => ({
    text,
    page: 0,
    box: { x0: 20 + i * 40, y0: 220, x1: 55 + i * 40, y1: 232 },
    ink: 0.3,
  }));
}

function bookOf(texts: string[], diagrams: Diagram[] = [diagram]): { overlay: BookOverlay; pages: Word[][] } {
  const pages = [wordsOf(texts)];
  const { moves, review } = analyzeWords({ pages, diagrams });
  return { overlay: { schemaVersion: 1, bookHash: 'test', pageCount: 1, diagrams, moves, review }, pages };
}

const onlyJob = (overlay: BookOverlay, pages: Word[][], scope: 'flagged' | 'all' = 'all'): RepairJob =>
  findRepairJobs(overlay, pages, scope).jobs[0]!;

const mainLine = (overlay: BookOverlay) => overlay.moves.filter((m) => m.isMainLine).map((m) => m.san);

describe('parseLineReply', () => {
  it('reads lines from a reply with text around the JSON', () => {
    const reply = 'Here it is: {"lines":[{"firstMoveNumber":12,"moves":["e4","e5"]}]} done';
    expect(parseLineReply(reply)).toEqual([{ firstMoveNumber: 12, moves: ['e4', 'e5'] }]);
  });

  it('drops a move number that makes no sense', () => {
    expect(parseLineReply('{"lines":[{"firstMoveNumber":-4,"moves":[]}]}')[0]!.firstMoveNumber).toBe(0);
  });

  it.each(['no json here', '{"lines":"e4"}', '{"lines":[{"moves":[1,2]}]}', '{"lines":[{}]}'])(
    'refuses %s',
    (reply) => {
      expect(() => parseLineReply(reply)).toThrow();
    },
  );
});

describe('normalizeSan', () => {
  it.each([
    ['0-0', 'O-O'],
    ['0-0-0+', 'O-O-O+'],
    ['♘f3', 'Nf3'],
    ['♞xe4!?', 'Nxe4'],
    ['e8Q+', 'e8=Q+'],
    ['exd6 e.p.', 'exd6'],
  ])('%s becomes %s', (printed, san) => {
    expect(normalizeSan(printed)).toBe(san);
  });
});

describe('alignToTokens', () => {
  const move = (to: string) => ({ to, castle: null });
  const token = (to: string) => ({ to, castle: null });

  it('matches squares in order and skips what has no match', () => {
    expect(alignToTokens([move('e4'), move('e5'), move('f3')], [token('e4'), token('c6'), token('f3')])).toEqual([0, -1, 2]);
  });

  it('never goes backwards', () => {
    expect(alignToTokens([move('f3'), move('e4')], [token('e4'), token('f3')]).filter((t) => t >= 0)).toHaveLength(1);
  });

  it('matches castling by side', () => {
    const castled = [{ to: 'g1', castle: 'k' as const }];
    expect(alignToTokens(castled, [{ to: null, castle: 'q' }, { to: null, castle: 'k' }])).toEqual([1]);
  });
});

describe('findRepairJobs', () => {
  it('leaves out a clean stretch unless all lines are asked for', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
    expect(findRepairJobs(overlay, pages, 'flagged').jobs).toHaveLength(0);
    expect(findRepairJobs(overlay, pages, 'all').jobs).toHaveLength(1);
  });

  it('picks up a stretch with a doubtful move', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
    const doubtful = { ...overlay, moves: overlay.moves.map((m, i) => (i === 1 ? { ...m, confidence: 'low' as const } : m)) };
    const { jobs } = findRepairJobs(doubtful, pages, 'flagged');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.startFens).toEqual([`${PLACEMENT} w KQkq - 0 1`]);
    expect(jobs[0]!.regions[0]!.page).toBe(0);
    expect(jobs[0]!.regions[0]!.box.y0).toBeGreaterThan(200);
  });

  it('tries both sides when a diagram does not say whose move it is', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3'], [{ ...diagram, sideToMove: null }]);
    expect(onlyJob(overlay, pages).startFens).toHaveLength(2);
  });

  it('leaves out a position that cannot be real', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3'], [{ ...diagram, issues: ['no white king'] }]);
    expect(findRepairJobs(overlay, pages, 'all').jobs).toHaveLength(0);
  });

  it("never touches a reader's correction", () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
    const corrected = correctMove(overlay, overlay.moves[1]!.id, 'c5');
    expect(findRepairJobs(corrected, pages, 'all').jobs).toHaveLength(0);
  });

  it('does not read a stretch again once a model has read it', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
    const job = onlyJob(overlay, pages);
    const { overlay: repaired } = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3'] }]));
    expect(findRepairJobs(repaired, pages, 'all').jobs).toHaveLength(0);
  });

  it('leaves out a stretch over too many pages, and counts it', () => {
    const pages: Word[][] = [0, 1, 2, 3].map((page) =>
      wordsOf(['1.e4', 'e5', '2.Nf3']).map((word) => ({ ...word, page })),
    );
    const { moves, review } = analyzeWords({ pages, diagrams: [] });
    const overlay: BookOverlay = { schemaVersion: 1, bookHash: 't', pageCount: 4, diagrams: [], moves, review };
    expect(findRepairJobs(overlay, pages, 'all')).toMatchObject({ jobs: [], tooLong: 1 });
  });
});

describe('checkReply', () => {
  const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
  const job = onlyJob(overlay, pages);

  it('accepts a legal line', () => {
    const { lines, illegal } = checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3'] }]);
    expect(illegal).toBeNull();
    expect(lines[0]!.played.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(lines[0]!.isCut).toBe(false);
  });

  it('cuts a line at an illegal move and says what was legal', () => {
    const { lines, illegal } = checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Qh8', 'Nc6'] }]);
    expect(lines[0]!.played).toHaveLength(2);
    expect(lines[0]!.isCut).toBe(true);
    expect(illegal).toMatchObject({ moveIndex: 2, san: 'Qh8' });
    expect(illegal!.legal).toContain('Nf3');
  });

  it('does not accept a null move', () => {
    const { lines, illegal } = checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', '--'] }]);
    expect(lines[0]!.played).toHaveLength(1);
    expect(illegal).toMatchObject({ moveIndex: 1 });
  });

  it('finds whose move it is when the diagram does not say', () => {
    const open = bookOf(['1.e4', 'e5', '2.Nf3'], [{ ...diagram, sideToMove: null }]);
    const openJob = onlyJob(open.overlay, open.pages);
    const { lines } = checkReply(openJob, [{ firstMoveNumber: 1, moves: ['e5', 'e4'] }]);
    expect(lines[0]!.startFen.split(' ')[1]).toBe('b');
  });
});

describe('applyRepair', () => {
  const texts = ['1.e4', 'e5', '2.Nf3', 'Nc6', '3.Bb5'];

  it('replaces the main line, in the place each move is printed', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'] }]));

    expect(result.outcome).toBe('replaced');
    expect(mainLine(result.overlay)).toEqual(['e4', 'c5', 'Nf3', 'Nc6', 'Bb5']);
    const nf3 = result.overlay.moves.find((m) => m.san === 'Nf3')!;
    expect(nf3.box).toEqual(pages[0]![2]!.box);
    expect(nf3.confidence).toBe('high');
    expect(nf3.source).toBe('llm');
  });

  it('flags a move no word on the page supports', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'] }]));

    expect(result).toMatchObject({ confirmed: 4, flagged: 1 });
    const c5 = result.overlay.moves.find((m) => m.san === 'c5')!;
    expect(c5.confidence).toBe('low');
    expect(result.overlay.review.some((r) => r.targetId === c5.id && r.reason === 'low-confidence-move')).toBe(true);
    // It points at the next move that has a place on the page.
    expect(c5.box).toEqual(pages[0]![2]!.box);
  });

  it('keeps a longer line when the reply was cut short', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'Qh8'] }]));
    expect(result.outcome).toBe('kept-longer');
    expect(result.overlay).toBe(overlay);
  });

  it('keeps a much longer line even when the reply looks complete', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4'] }]));
    expect(result.outcome).toBe('kept-longer');
    expect(result.overlay).toBe(overlay);
  });

  it('leaves a note when a somewhat shorter line replaces the old one', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6'] }]));
    expect(result.outcome).toBe('replaced');
    expect(result.overlay.review.some((r) => r.id.endsWith('-shorter'))).toBe(true);
  });

  it('never replaces a correction made while the model was reading', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const corrected = correctMove(overlay, overlay.moves[1]!.id, 'c5');
    const result = applyRepair(corrected, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(result.outcome).toBe('changed-meanwhile');
    expect(result.overlay).toBe(corrected);
  });

  it('never applies a reading from a diagram corrected meanwhile', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const changed = { ...overlay, diagrams: [{ ...diagram, placement: '4k3/8/8/8/8/8/8/4K3' }] };
    const result = applyRepair(changed, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(result.outcome).toBe('changed-meanwhile');
  });

  it('puts the new line where the old one was', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const other = { ...overlay.moves[0]!, id: 'later', box: { x0: 1, y0: 1, x1: 2, y1: 2 }, page: 3, parentId: null };
    const withOther = { ...overlay, moves: [...overlay.moves, other] };
    const { overlay: repaired } = applyRepair(withOther, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(repaired.moves.at(-1)!.id).toBe('later');
  });

  it('notes where a line was cut when it still replaces a shorter one', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', 'Nc6']);
    const shorter = { ...overlay, moves: overlay.moves.slice(0, 1) };
    const job = onlyJob(shorter, pages);
    const result = applyRepair(shorter, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Qh8'] }]));
    expect(result.outcome).toBe('replaced');
    expect(result.overlay.review.some((r) => r.reason === 'unresolved-move' && r.id.endsWith('-cut'))).toBe(true);
  });

  it('changes nothing when nothing was read', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const result = applyRepair(overlay, job, checkReply(job, []));
    expect(result.outcome).toBe('nothing-read');
    expect(result.overlay).toBe(overlay);
  });

  it('stores the number printed on the first move', () => {
    const { overlay, pages } = bookOf(['12.e4', 'e5', '13.Nf3']);
    const job = onlyJob(overlay, pages);
    const { overlay: repaired } = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 12, moves: ['e4', 'e5', 'Nf3'] }]));
    expect(repaired.moves.at(-1)!.numberOffset).toBe(11);
  });

  it('keeps several lines apart, each from the start', () => {
    const { overlay, pages } = bookOf(['1.e4', 'e5', '2.Nf3', '1.d4', 'd5', '2.c4']);
    const job = onlyJob(overlay, pages);
    const { overlay: repaired } = applyRepair(
      overlay,
      job,
      checkReply(job, [
        { firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3'] },
        { firstMoveNumber: 1, moves: ['d4', 'd5', 'c4'] },
      ]),
    );
    const roots = repaired.moves.filter((m) => m.parentId === null && m.isMainLine);
    expect(roots.map((m) => m.san)).toEqual(['e4', 'd4']);
    expect(roots[1]!.box).toEqual(pages[0]![3]!.box);
  });

  describe('side lines', () => {
    function withSideLine() {
      const { overlay, pages } = bookOf(texts);
      const job = onlyJob(overlay, pages);
      const e5 = overlay.moves.find((m) => m.san === 'e5')!;
      const side = {
        ...e5,
        id: 'side1',
        parentId: e5.id,
        san: 'Nc3',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
        isMainLine: false,
        box: pages[0]![3]!.box,
      };
      const next = { ...overlay, moves: [...overlay.moves, side] };
      return { overlay: next, job: { ...job, moveIds: [...job.moveIds, 'side1'] } };
    }

    it('follows its position to the new main line', () => {
      const { overlay, job } = withSideLine();
      const { overlay: repaired } = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
      const side = repaired.moves.find((m) => m.id === 'side1')!;
      expect(repaired.moves.find((m) => m.id === side.parentId)!.san).toBe('e5');
    });

    it('leaves a note when its position is gone', () => {
      const { overlay, job } = withSideLine();
      const { overlay: repaired } = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['d4', 'd5', 'c4'] }]));
      expect(repaired.moves.some((m) => m.id === 'side1')).toBe(false);
      expect(repaired.review.some((r) => r.id.includes('side-side1'))).toBe(true);
    });
  });

  it('keeps a note about a side line, which is not read again', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const side = { ...overlay.moves[1]!, id: 'side1', parentId: overlay.moves[0]!.id, isMainLine: false, san: 'c5', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' };
    const note = { id: 'n1', reason: 'unresolved-move' as const, page: 0, box: pages[0]![1]!.box, targetId: 'side1' };
    const noted = { ...overlay, moves: [...overlay.moves, side], review: [note] };
    const { overlay: repaired } = applyRepair(noted, { ...job, moveIds: [...job.moveIds, 'side1'] }, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(repaired.review.map((r) => r.id)).toContain('n1');
  });

  it('clears old notes about the stretch, and leaves others', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const elsewhere = { id: 'other', reason: 'unresolved-move' as const, page: 9, box: pages[0]![0]!.box, targetId: null };
    const here = { id: 'here', reason: 'unresolved-move' as const, page: 0, box: pages[0]![1]!.box, targetId: null };
    const noted = { ...overlay, review: [elsewhere, here] };
    const { overlay: repaired } = applyRepair(noted, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(repaired.review.map((r) => r.id)).toEqual(['other']);
  });

  it('survives saving, with no text from the reply', () => {
    const { overlay, pages } = bookOf(texts);
    const job = onlyJob(overlay, pages);
    const { overlay: repaired } = applyRepair(overlay, job, checkReply(job, [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]));
    expect(overlayFromJson(overlayToJson(repaired)).moves.at(-1)!.source).toBe('llm');
  });
});
