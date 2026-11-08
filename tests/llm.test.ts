import { describe, expect, it, vi } from 'vitest';
import type { RepairJob } from '../src/core/repair';
import type { BookOverlay, Word } from '../src/core/types';
import { analyzeWords } from '../src/core/book';
import { findRepairJobs } from '../src/core/repair';
import { cropPixels, estimateJobs, estimateMinutes, priceOf } from '../src/llm/estimate';
import { linePrompt, retryPrompt } from '../src/llm/prompt';
import { baseUrlProblem, createReader, ProviderError, type LineRequest, type ReadLines } from '../src/llm/providers';
import { runRepairs } from '../src/llm/runRepairs';

const request: LineRequest = { system: 'sys', prompt: 'read this', images: ['AAAA'] };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const job: RepairJob = {
  id: 'j0-1-1',
  diagramId: null,
  label: null,
  startFens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
  regions: [{ page: 0, box: { x0: 0, y0: 0, x1: 300, y1: 150 } }],
  tokens: [],
  moveIds: [],
};

describe('baseUrlProblem', () => {
  it.each(['https://api.example.com/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:8080/v1'])('allows %s', (url) => {
    expect(baseUrlProblem(url)).toBeNull();
  });
  it.each(['http://api.example.com/v1', 'ftp://localhost/v1', 'not a url', 'http://localhost.example.com/v1'])(
    'refuses %s',
    (url) => {
      expect(baseUrlProblem(url)).not.toBeNull();
    },
  );
});

describe('Anthropic adapter', () => {
  const message = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text: '{"lines":[]}' }],
    usage: { input_tokens: 11, output_tokens: 7 },
  };

  function reader(response: () => Response, model = 'claude-opus-5-5') {
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => response());
    return { fetch, read: createReader({ kind: 'anthropic', apiKey: 'test-key', model, fetch: fetch as never }) };
  }

  it('sends the image, the schema and the fallback setting', async () => {
    const { fetch, read } = reader(() => json(message));
    const reply = await read(request);
    expect(reply).toEqual({ text: '{"lines":[]}', usage: { input: 11, output: 7 } });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('/v1/messages');
    const headers = new Headers(init!.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(String(url)).toContain('https://api.anthropic.com/');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');

    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config.effort).toBe('medium');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
    expect(body.system).toBe('sys');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(init!.redirect).toBe('error');
  });

  it('does not resend by itself, which could bill twice', async () => {
    const { fetch, read } = reader(() => json({ type: 'error', error: { type: 'api_error', message: 'x' } }, 500));
    await expect(read(request)).rejects.toMatchObject({ kind: 'other' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks for no fallback on a model that has none', async () => {
    const { fetch, read } = reader(() => json({ ...message, model: 'claude-haiku-5-5' }), 'claude-haiku-5-5');
    await read(request);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).not.toHaveProperty('fallbacks');
  });

  it('sends nothing extra for a model it does not know', async () => {
    const { fetch, read } = reader(() => json({ ...message, model: 'claude-other' }), 'claude-other');
    await read(request);
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(body).not.toHaveProperty('fallbacks');
    expect(body.output_config).not.toHaveProperty('effort');
  });

  it('reports a refusal instead of reading an empty reply', async () => {
    const { read } = reader(() => json({ ...message, stop_reason: 'refusal', content: [] }));
    await expect(read(request)).rejects.toMatchObject({ kind: 'refused', usage: { input: 11, output: 7 } });
  });

  it('reports a reply that was cut off', async () => {
    const { read } = reader(() => json({ ...message, stop_reason: 'max_tokens' }));
    await expect(read(request)).rejects.toMatchObject({ kind: 'too-long' });
  });

  it('reports a bad key without repeating it', async () => {
    const { read } = reader(() => json({ type: 'error', error: { type: 'authentication_error', message: 'bad' } }, 401));
    const failure = await read(request).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).kind).toBe('auth');
    expect((failure as ProviderError).message).not.toContain('test-key');
  });
});

describe('OpenAI-compatible adapter', () => {
  const completion = {
    choices: [{ message: { content: '{"lines":[]}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3 },
  };

  function reader(respond: (attempt: number) => Response, apiKey = 'test-key', baseUrl = 'https://llm.example.com/v1/') {
    let attempt = 0;
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => respond(attempt++));
    return { fetch, read: createReader({ kind: 'openai-compatible', apiKey, model: 'some-model', baseUrl, fetch: fetch as never }) };
  }

  it('sends the image and the schema to the given address', async () => {
    const { fetch, read } = reader(() => json(completion));
    expect(await read(request)).toEqual({ text: '{"lines":[]}', usage: { input: 5, output: 3 } });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://llm.example.com/v1/chat/completions');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(String(init!.body));
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[1].content[0].image_url.url).toBe('data:image/png;base64,AAAA');
  });

  it('sends no key header when there is no key', async () => {
    const { fetch, read } = reader(() => json(completion), '', 'http://localhost:11434/v1');
    await read(request);
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).has('authorization')).toBe(false);
  });

  it('tries again without a schema when the server refuses one', async () => {
    const { fetch, read } = reader((attempt) => (attempt === 0 ? json({ error: 'response_format is not supported' }, 400) : json(completion)));
    await read(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).not.toHaveProperty('response_format');
  });

  it('does not resend for any other bad request', async () => {
    const { fetch, read } = reader(() => json({ error: 'image too large' }, 400));
    await expect(read(request)).rejects.toMatchObject({ kind: 'other' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('follows no redirects', async () => {
    const { fetch, read } = reader(() => json(completion));
    await read(request);
    expect(fetch.mock.calls[0]![1]!.redirect).toBe('error');
  });

  it('will not send a key in the clear', async () => {
    const { fetch, read } = reader(() => json(completion), 'test-key', 'http://llm.example.com/v1');
    await expect(read(request)).rejects.toMatchObject({ kind: 'auth' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth'],
    [404, 'auth'],
    [429, 'rate-limit'],
    [500, 'other'],
  ])('reports status %i as %s', async (status, kind) => {
    const { read } = reader(() => json({}, status));
    await expect(read(request)).rejects.toMatchObject({ kind });
  });

  it('reports a reply that was cut off', async () => {
    const { read } = reader(() => json({ choices: [{ message: { content: '{"li' }, finish_reason: 'length' }] }));
    await expect(read(request)).rejects.toMatchObject({ kind: 'too-long' });
  });

  it('turns a failed connection into a plain message', async () => {
    const read = createReader({
      kind: 'openai-compatible',
      apiKey: '',
      model: 'm',
      baseUrl: 'https://llm.example.com/v1',
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as never,
    });
    await expect(read(request)).rejects.toMatchObject({ kind: 'other' });
  });
});

describe('prompts', () => {
  it('gives the position, and both when the side is unknown', () => {
    expect(linePrompt(job)).toContain(job.startFens[0]);
    expect(linePrompt({ ...job, startFens: ['a', 'b'] })).toContain('one of');
  });

  it('points at the illegal move when asking again', () => {
    const prompt = retryPrompt(job, { lineIndex: 0, moveIndex: 2, san: 'Qh8', fen: 'FEN', legal: ['Nf3'] }, ['e4', 'e5', 'Qh8']);
    expect(prompt).toContain('"Qh8"');
    expect(prompt).toContain('number 3');
    expect(prompt).toContain('Nf3');
  });
});

describe('estimates', () => {
  it('keeps a crop within the longest side allowed', () => {
    const { width, height } = cropPixels(800, 1200);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1500);
  });

  it('prices a known model, and admits when it cannot', () => {
    expect(priceOf('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(priceOf('someone-elses-model', 100, 100)).toBeNull();
  });

  it('grows with the work', () => {
    const one = estimateJobs([job], 'claude-opus-5-5');
    const two = estimateJobs([job, job], 'claude-opus-5-5');
    expect(two.dollars!).toBeGreaterThan(one.dollars!);
    expect(estimateJobs([job], 'unknown').dollars).toBeNull();
  });
});

describe('runRepairs', () => {
  function book(): { overlay: BookOverlay; jobs: RepairJob[] } {
    const lines = [0, 1, 2, 3].map((n) => ['1.e4', 'e5', '2.Nf3'].map((text, i): Word => ({
      text,
      page: 0,
      box: { x0: 20 + i * 40, y0: 20 + n * 300, x1: 55 + i * 40, y1: 32 + n * 300 },
      ink: 0.3,
    })));
    const diagrams = [0, 1, 2, 3].map((n) => ({
      id: `d${n}`,
      page: 0,
      box: { x0: 20, y0: n * 300 - 10, x1: 200, y1: n * 300 + 5 },
      placement: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      sideToMove: 'w' as const,
      label: null,
      issues: [],
      confidence: 1,
    }));
    const pages = [lines.flat()];
    const { moves, review } = analyzeWords({ pages, diagrams });
    const overlay: BookOverlay = { schemaVersion: 1, bookHash: 't', pageCount: 1, diagrams, moves, review };
    return { overlay, jobs: findRepairJobs(overlay, pages, 'all').jobs };
  }

  const good = JSON.stringify({ lines: [{ firstMoveNumber: 1, moves: ['e4', 'c5', 'Nf3'] }] });
  const usage = { input: 10, output: 5 };
  const run = (read: ReadLines, signal?: AbortSignal) => {
    const { overlay, jobs } = book();
    const updates: BookOverlay[] = [];
    let latest = overlay;
    return {
      jobs,
      updates,
      setLatest: (change: (current: BookOverlay) => BookOverlay) => {
        latest = change(latest);
      },
      result: runRepairs({
        jobs,
        getOverlay: () => latest,
        read,
        renderJob: async () => ['AAAA'],
        sleep: async () => {},
        onProgress: (_tally, next) => {
          latest = next;
          updates.push(next);
        },
        ...(signal ? { signal } : {}),
      }),
    };
  };

  it('applies every result and counts the tokens', async () => {
    const { result, updates, jobs } = run(async () => ({ text: good, usage }));
    const tally = await result;
    expect(jobs).toHaveLength(4);
    expect(tally).toMatchObject({ done: 4, replaced: 4, failed: 0, inputTokens: 40, outputTokens: 20 });
    expect(updates.at(-1)!.moves.filter((m) => m.source === 'llm')).toHaveLength(12);
  });

  it('asks once more about an illegal move, and uses the better reading', async () => {
    const read = vi.fn<ReadLines>(async ({ prompt }) => ({
      text: prompt.includes('earlier reading') ? good : JSON.stringify({ lines: [{ firstMoveNumber: 1, moves: ['e4', 'Qh8'] }] }),
      usage,
    }));
    const tally = await run(read).result;
    expect(read).toHaveBeenCalledTimes(8);
    expect(tally.replaced).toBe(4);
    expect(tally.moves).toBe(12);
  });

  it('keeps the first reading when asking again fails', async () => {
    const illegal = JSON.stringify({ lines: [{ firstMoveNumber: 1, moves: ['e4', 'e5', 'Nf3', 'Qh8'] }] });
    const tally = await run(async ({ prompt }) => {
      if (prompt.includes('earlier reading')) throw new ProviderError('other', 'Down');
      return { text: illegal, usage };
    }).result;
    expect(tally).toMatchObject({ failed: 0, replaced: 4, moves: 12 });
  });

  it('prefers the longer reading when asking again gets less', async () => {
    const tally = await run(async ({ prompt }) => ({
      text: JSON.stringify({ lines: [{ firstMoveNumber: 1, moves: prompt.includes('earlier reading') ? ['e4'] : ['e4', 'e5', 'Nf3', 'Qh8'] }] }),
      usage,
    })).result;
    expect(tally.moves).toBe(12);
  });

  it('waits out a rate limit, and then reads', async () => {
    let calls = 0;
    const tally = await run(async () => {
      if (calls++ === 0) throw new ProviderError('rate-limit', 'Slow down');
      return { text: good, usage };
    }).result;
    expect(tally).toMatchObject({ failed: 0, replaced: 4 });
  });

  it('counts a failed reply that still cost something', async () => {
    const tally = await run(async () => {
      throw new ProviderError('refused', 'No', usage);
    }).result;
    expect(tally).toMatchObject({ failed: 4, inputTokens: 40, outputTokens: 20 });
  });

  it('lists what was read without improvement, and not what failed', async () => {
    let calls = 0;
    const tally = await run(async () => {
      calls++;
      if (calls === 1) throw new ProviderError('other', 'Down');
      return { text: JSON.stringify({ lines: [] }), usage };
    }).result;
    expect(tally.failed).toBe(1);
    expect(tally.unchangedIds).toHaveLength(3);
  });

  it('does not undo a correction made during the run', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { result, setLatest, updates } = run(async () => {
      if (calls++ === 3) await gate;
      return { text: good, usage };
    });
    await vi.waitFor(() => expect(updates.length).toBeGreaterThanOrEqual(3));
    setLatest((current) => ({ ...current, pageCount: 99 }));
    release();
    await result;
    expect(updates.at(-1)!.pageCount).toBe(99);
  });

  it('keeps going after one bad reply', async () => {
    let calls = 0;
    const tally = await run(async () => ({ text: calls++ === 0 ? 'not json' : good, usage })).result;
    expect(tally).toMatchObject({ done: 4, failed: 1, replaced: 3 });
    expect(tally.lastProblem).toBeTruthy();
  });

  it('stops the whole run on a bad key', async () => {
    const tally = await run(async () => {
      throw new ProviderError('auth', 'The provider did not accept this key.');
    }).result;
    expect(tally.stoppedBecause).toContain('key');
    expect(tally.done).toBeLessThan(4);
  });

  it('keeps what was read when cancelled', async () => {
    const controller = new AbortController();
    let calls = 0;
    const { result, updates } = run(async () => {
      calls++;
      if (calls === 3) controller.abort();
      if (calls > 3) throw new DOMException('Cancelled', 'AbortError');
      return { text: good, usage };
    }, controller.signal);
    const tally = await result;
    expect(tally.done).toBeLessThan(4);
    expect(updates.length).toBe(tally.done);
  });
});

describe('estimateMinutes', () => {
  it('counts stretches read a few at a time', () => {
    expect(estimateMinutes(202, 'deepseek-flash')).toBe(57);
    expect(estimateMinutes(6, 'claude-opus-5-5')).toBe(1);
  });

  it('is nothing for nothing', () => {
    expect(estimateMinutes(0, 'deepseek-flash')).toBe(0);
  });
});
