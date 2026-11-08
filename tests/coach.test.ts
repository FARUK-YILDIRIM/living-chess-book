import { describe, expect, it } from 'vitest';
import { coachPrompt, coachSystem, hasBadMove, movesNamedIn, parseCoachReply, positionFacts, type CoachContext, type ReplyPart } from '../src/core/coach';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const context = (extra: Partial<CoachContext> = {}): CoachContext => ({
  page: 41,
  fen: START,
  isExploring: false,
  isGuessing: false,
  bookLine: [],
  bookNext: [],
  engineLines: [],
  notes: [],
  history: [],
  pageText: null,
  selectedText: null,
  question: 'What is the plan?',
  ...extra,
});

const show = (parts: readonly ReplyPart[]) =>
  parts.map((part) => (part.kind === 'text' ? part.text : part.kind === 'move' ? `<${part.san}>` : part.kind === 'idea' ? `~${part.text}~` : `!${part.text}!`)).join('');

describe('coachSystem', () => {
  it('asks for the reader\'s language', () => {
    expect(coachSystem('tr')).toContain('Answer in Turkish');
    expect(coachSystem('en')).toContain('Answer in English');
  });

  it('says that book text is data, not instructions', () => {
    expect(coachSystem('en')).toMatch(/not instructions/);
  });
});

describe('coachPrompt', () => {
  it('gives the page as printed, the position, the side and the legal moves', () => {
    const prompt = coachPrompt(context());
    expect(prompt).toContain('Page of the book: 42');
    expect(prompt).toContain(START);
    expect(prompt).toContain('Side to move: White');
    expect(prompt).toContain('Legal moves: a3 a4');
    expect(prompt).toContain('The reader asks: What is the plan?');
  });

  it('says plainly when nothing has been calculated', () => {
    expect(coachPrompt(context())).toContain('nothing has been calculated');
  });

  it('gives engine lines with their scores and depth', () => {
    const lines = [{ rank: 1, depth: 18, score: { kind: 'cp' as const, value: 35 }, moves: [{ san: 'e4', fen: '', from: 'e2', to: 'e4', uci: 'e2e4' }] }];
    const prompt = coachPrompt(context({ engineLines: lines }));
    expect(prompt).toContain('depth 18');
    expect(prompt).toContain('+0.35: e4');
    expect(prompt).not.toContain('nothing has been calculated');
  });

  it('marks moves in doubt', () => {
    const prompt = coachPrompt(context({ bookLine: [{ label: '1. e4', isDoubtful: false }, { label: '1... e5', isDoubtful: true }] }));
    expect(prompt).toContain('1. e4 1... e5 (?)');
  });

  it('sends book text only when it was given', () => {
    expect(coachPrompt(context())).not.toContain('<book_page>');
    expect(coachPrompt(context())).not.toContain('<selection>');
    expect(coachPrompt(context({ pageText: 'Some page' }))).toContain('<book_page>\nSome page\n</book_page>');
    expect(coachPrompt(context({ selectedText: 'A passage' }))).toContain('<selection>\nA passage\n</selection>');
  });

  it('keeps long text within limits', () => {
    const prompt = coachPrompt(context({ pageText: 'x'.repeat(50_000), selectedText: 'y'.repeat(50_000) }));
    expect(prompt.length).toBeLessThan(10_000);
  });

  it('copes with a note on a page and no position', () => {
    const prompt = coachPrompt(context({ fen: null }));
    expect(prompt).toContain('No position is on the board');
    expect(prompt).not.toContain('Legal moves');
  });

  it('copes with an unreadable position', () => {
    expect(coachPrompt(context({ fen: 'nonsense' }))).toContain('no legal moves');
  });

  it('keeps only the last few exchanges', () => {
    const history = Array.from({ length: 9 }, (_, index) => ({ question: `question ${index}`, answer: `answer ${index}` }));
    const prompt = coachPrompt(context({ history }));
    expect(prompt).toContain('question 8');
    expect(prompt).not.toContain('question 4');
  });

  it('asks for hints only while the reader is guessing', () => {
    expect(coachPrompt(context())).not.toContain('Give hints');
    expect(coachPrompt(context({ isGuessing: true }))).toContain('Do not name the move');
  });

  it('says when the reader has left the book', () => {
    expect(coachPrompt(context({ isExploring: true }))).toContain('try their own');
  });
});

describe('positionFacts', () => {
  it('counts material, which a real model got wrong', () => {
    const knightDown = 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 1 8';
    expect(positionFacts(knightDown)).toContain('White is ahead by 3 points');
    expect(positionFacts(knightDown)).toContain('White 1Q 2R 2B 2N 8P; Black 1Q 2R 2B 1N 8P');
  });

  it('says when material is level', () => {
    expect(positionFacts(START)).toContain('Material is level.');
  });

  it('copes with bare kings', () => {
    expect(positionFacts('k7/8/8/8/8/8/8/K7 w - - 0 1')).toContain('White king only; Black king only');
  });

  it('says when the game is over or a king is in check', () => {
    expect(positionFacts('R5k1/5ppp/8/8/8/8/8/K7 b - - 0 1')).toContain('checkmate');
    expect(positionFacts('k7/8/8/8/8/8/Q7/K7 b - - 0 1')).toContain('Black is in check.');
  });

  it('gives nothing for an unreadable position', () => {
    expect(positionFacts('nonsense')).toBeNull();
  });

  it('goes into the prompt', () => {
    expect(coachPrompt(context())).toContain('Material: White');
  });
});

describe('movesNamedIn', () => {
  const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

  it('finds a legal move in a question', () => {
    expect(movesNamedIn('Ya burada a6 oynasam ne olur?', ITALIAN)).toEqual([{ san: 'a6', uci: 'a7a6' }]);
  });

  it('reads pieces written the Turkish way', () => {
    expect(movesNamedIn('Af6 mı, Fc5 mi?', ITALIAN).map((m) => m.san)).toEqual(['Nf6', 'Bc5']);
    expect(movesNamedIn('Vh4 iyi mi?', ITALIAN).map((m) => m.san)).toEqual(['Qh4']);
  });

  it('skips what is not legal here, and words that only look like moves', () => {
    expect(movesNamedIn('Nf3 ya da e4 karesi, Be3-like', ITALIAN)).toEqual([]);
  });

  it('keeps to a few moves, and names each once', () => {
    expect(movesNamedIn('a6 a6 h6 g6 f6 b6', ITALIAN).map((m) => m.san)).toEqual(['a6', 'h6', 'g6']);
  });

  it('writes a promotion for the engine', () => {
    expect(movesNamedIn('a8=Q?', '8/P6k/8/8/8/8/8/K7 w - - 0 1')[0]?.uci).toBe('a7a8q');
  });

  it('has nothing to find with no position', () => {
    expect(movesNamedIn('a6', null)).toEqual([]);
  });
});

describe('parseCoachReply', () => {
  it('makes a legal line playable, move by move', () => {
    const parts = parseCoachReply('Try [[e4 e5 Nf3]] here.', START);
    expect(show(parts)).toBe('Try <e4> <e5> <Nf3> here.');
    const moves = parts.filter((p) => p.kind === 'move');
    expect(moves[2]).toMatchObject({ san: 'Nf3', from: 'g1', to: 'f3' });
    expect(moves[2]!.fen.split(' ')[1]).toBe('b');
  });

  it('takes move numbers, though it asked for none', () => {
    expect(show(parseCoachReply('[[1. e4 e5 2.Nf3]]', START))).toBe('<e4> <e5> <Nf3>');
  });

  it('marks a bad move, and everything after it, since it cannot be checked', () => {
    const parts = parseCoachReply('[[e4 Ke5 Nf3]]', START);
    expect(show(parts)).toBe('<e4> !Ke5! !Nf3!');
    expect(hasBadMove(parts)).toBe(true);
  });

  it('does not take passing a turn for a move', () => {
    const parts = parseCoachReply('[[-- e5 Nf3]] and [[Z0]]', START);
    expect(show(parts)).toBe('!--! !e5! !Nf3! and !Z0!');
  });

  it('never makes a move playable with no position', () => {
    expect(show(parseCoachReply('[[e4]]', null))).toBe('!e4!');
  });

  it('never makes a move playable from an unreadable position', () => {
    expect(show(parseCoachReply('[[e4]]', 'nonsense'))).toBe('!e4!');
  });

  it('checks a move named in a sentence from the current position', () => {
    expect(show(parseCoachReply('Play Nf3 now.', START))).toBe('Play <Nf3> now.');
  });

  it('does not call a move in a sentence wrong, since it may be meant for later', () => {
    const parts = parseCoachReply('Then Qh5 follows, and later ...O-O.', START);
    expect(show(parts)).toBe('Then ~Qh5~ follows, and later ...~O-O~.');
    expect(hasBadMove(parts)).toBe(false);
  });

  it('takes out Markdown, which real models write anyway', () => {
    expect(show(parseCoachReply('## Plan\n\n**Nf3** is **good**.', START))).toBe('Plan\n\n<Nf3> is good.');
  });

  it('does not take a bare square in a sentence for a move, even if it could be one', () => {
    const parts = parseCoachReply('The a3 square matters, and so does e4.', START);
    expect(show(parts)).toBe('The a3 square matters, and so does e4.');
  });

  it('leaves the name of a square alone', () => {
    const parts = parseCoachReply('The knight wants the d5 square.', START);
    expect(show(parts)).toBe('The knight wants the d5 square.');
    expect(hasBadMove(parts)).toBe(false);
  });

  it('does not touch words that only look like moves inside them', () => {
    expect(show(parseCoachReply('Be3-like ideas and b4b5.', START))).toBe('Be3-like ideas and b4b5.');
  });

  it('leaves a reply with no moves as it is', () => {
    expect(parseCoachReply('Keep calm.', START)).toEqual([{ kind: 'text', text: 'Keep calm.' }]);
  });

  it('keeps line breaks', () => {
    expect(show(parseCoachReply('One.\n\nTwo.', START))).toBe('One.\n\nTwo.');
  });

  it('copes with an empty line', () => {
    expect(hasBadMove(parseCoachReply('[[]]', START))).toBe(false);
  });

  it('copes with castling written in a sentence', () => {
    expect(show(parseCoachReply('Later O-O is useful.', START))).toBe('Later ~O-O~ is useful.');
  });
});
