import { CHATGPT_API, CHATGPT_HEADER, type ChatGptReadReply, type ChatGptReadRequest } from './chatgptProtocol';
import { LINE_REPLY_SCHEMA } from './prompt';

export type ProviderKind = 'anthropic' | 'openai-compatible' | 'chatgpt-plan';

export interface ProviderConfig {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  /** For OpenAI-compatible endpoints. */
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof globalThis.fetch;
}

export interface LineRequest {
  system: string;
  prompt: string;
  /** PNG images, base64 encoded. */
  images: readonly string[];
  /** An answer in the model's own words, and not the moves of a line. */
  freeText?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

export interface LineReplyText {
  text: string;
  usage: { input: number; output: number } | null;
}

export type ReadLines = (request: LineRequest) => Promise<LineReplyText>;

/** `auth` and `plan-limit` stop a whole run, because every later request would fail in the same way. */
export type ProviderErrorKind = 'auth' | 'plan-limit' | 'rate-limit' | 'refused' | 'too-long' | 'other';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** What a failed reply still cost. */
  readonly usage: LineReplyText['usage'];

  constructor(kind: ProviderErrorKind, message: string, usage: LineReplyText['usage'] = null) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.usage = usage;
  }
}

const MAX_OUTPUT_TOKENS = 8000;
const TIMEOUT_MS = 180_000;
const SCHEMA_COMPLAINT = /response_format|json_schema|schema/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** The Claude models this app knows, and what their first-party API accepts. */
export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', hasServerFallback: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', hasServerFallback: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', hasServerFallback: false },
] as const;

export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0].id;

/**
 * Places a reader may want. Model names are left to the reader, since they change often, unless
 * the service gives one stable name for its current model.
 */
export const OPENAI_COMPATIBLE_PRESETS: readonly { name: string; baseUrl: string; defaultModel?: string; models?: readonly string[] }[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  // Only `deepseek-flash` reads images, as AI reading needs. Checked on 2026-11-05.
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Ollama, on this computer', baseUrl: 'http://localhost:11434/v1' },
];

export function isLocalAddress(baseUrl: string): boolean {
  try {
    return LOCAL_HOST.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/** Returns what is wrong with a base URL, or null. A key must not travel in the clear. */
export function baseUrlProblem(baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return 'This is not a web address.';
  }
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && LOCAL_HOST.test(url.hostname)) return null;
  return 'Use an https address, or http on this computer only.';
}

async function readWithAnthropic(config: ProviderConfig, request: LineRequest): Promise<LineReplyText> {
  // Loaded on first use, so that the book reader carries no network code until asked.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: config.apiKey,
    // Stated outright, so that nothing in the environment can send the key elsewhere.
    baseURL: 'https://api.anthropic.com',
    // The key is the reader's own, typed into their own copy of the app.
    dangerouslyAllowBrowser: true,
    timeout: TIMEOUT_MS,
    // A resent request can be billed twice, and only limits are worth waiting out: see runRepairs.
    maxRetries: 0,
    // A redirect would carry the images and key to an address the reader did not agree to.
    fetchOptions: { redirect: 'error' },
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  const known = ANTHROPIC_MODELS.find((m) => m.id === config.model);
  try {
    const response = await client.beta.messages.create(
      {
        model: config.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: request.system,
        output_config: {
          ...(request.freeText ? {} : { format: { type: 'json_schema' as const, schema: LINE_REPLY_SCHEMA as unknown as Record<string, unknown> } }),
          // Reading print does not repay deep thought, and models differ on the default.
          ...(known ? { effort: 'medium' as const } : {}),
        },
        ...(known?.hasServerFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        messages: [
          {
            role: 'user',
            content: [
              ...request.images.map((data) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: 'image/png' as const, data },
              })),
              { type: 'text' as const, text: request.prompt },
            ],
          },
        ],
      },
      request.signal ? { signal: request.signal } : {},
    );

    const usage = { input: response.usage.input_tokens, output: response.usage.output_tokens };
    if (response.stop_reason === 'refusal') throw new ProviderError('refused', 'The model declined to read this part.', usage);
    if (response.stop_reason === 'max_tokens') throw new ProviderError('too-long', 'The reply was cut off.', usage);
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    return { text, usage };
  } catch (cause) {
    if (cause instanceof Anthropic.AuthenticationError || cause instanceof Anthropic.PermissionDeniedError) {
      throw new ProviderError('auth', 'The provider did not accept this key.');
    }
    if (cause instanceof Anthropic.NotFoundError) throw new ProviderError('auth', 'The provider does not offer this model.');
    if (cause instanceof Anthropic.RateLimitError) throw new ProviderError('rate-limit', 'The provider is limiting requests.');
    if (cause instanceof Anthropic.APIUserAbortError) throw new DOMException('Cancelled', 'AbortError');
    if (cause instanceof Anthropic.APIConnectionError) {
      throw new ProviderError('other', 'The provider could not be reached.');
    }
    if (cause instanceof Anthropic.APIError) throw new ProviderError('other', `The provider returned an error (${cause.status}).`);
    throw cause;
  }
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

async function postChat(config: ProviderConfig, request: LineRequest, withSchema: boolean): Promise<Response> {
  const send = config.fetch ?? globalThis.fetch.bind(globalThis);
  const url = `${(config.baseUrl ?? '').replace(/\/+$/, '')}/chat/completions`;
  const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  try {
    return await send(url, {
      method: 'POST',
      // A redirect would carry the images and key to an address the reader did not agree to.
      redirect: 'error',
      signal,
      headers: {
        'content-type': 'application/json',
        // Local servers often need no key.
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: request.system },
          {
            role: 'user',
            content: [
              ...request.images.map((data) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } })),
              { type: 'text', text: request.prompt },
            ],
          },
        ],
        ...(withSchema
          ? { response_format: { type: 'json_schema', json_schema: { name: 'chess_lines', strict: true, schema: LINE_REPLY_SCHEMA } } }
          : {}),
      }),
    });
  } catch (cause) {
    if (request.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (cause instanceof Error && cause.name === 'TimeoutError') throw new ProviderError('other', 'The provider took too long.');
    throw new ProviderError('other', 'The provider could not be reached. It may be down, or not allow requests from this app.');
  }
}

async function readWithOpenAiCompatible(config: ProviderConfig, request: LineRequest): Promise<LineReplyText> {
  const problem = baseUrlProblem(config.baseUrl ?? '');
  if (problem) throw new ProviderError('auth', problem);

  let response = await postChat(config, request, !request.freeText);
  // Not every server supports schemas. The reply is checked either way.
  if (!request.freeText && (response.status === 400 || response.status === 422) && SCHEMA_COMPLAINT.test(await response.clone().text())) {
    response = await postChat(config, request, false);
  }

  if (response.status === 401 || response.status === 403) throw new ProviderError('auth', 'The provider did not accept this key.');
  if (response.status === 404) throw new ProviderError('auth', 'The provider does not offer this model, or the address is wrong.');
  if (response.status === 429) throw new ProviderError('rate-limit', 'The provider is limiting requests.');
  if (!response.ok) throw new ProviderError('other', `The provider returned an error (${response.status}).`);

  let body: ChatCompletion;
  try {
    body = (await response.json()) as ChatCompletion;
  } catch {
    throw new ProviderError('other', 'The provider sent a reply that could not be read.');
  }
  const { prompt_tokens: input, completion_tokens: output } = body.usage ?? {};
  const usage = typeof input === 'number' && typeof output === 'number' ? { input, output } : null;
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new ProviderError('too-long', 'The reply was cut off.', usage);
  if (choice?.message?.refusal) throw new ProviderError('refused', 'The model declined to read this part.', usage);
  const { content } = choice?.message ?? {};
  if (typeof content !== 'string') throw new ProviderError('other', 'The provider sent an empty reply.', usage);
  return { text: content, usage };
}

/** The local helper holds the ChatGPT sign-in and makes the request, so no token reaches this page. */
async function readWithChatGptPlan(config: ProviderConfig, request: LineRequest): Promise<LineReplyText> {
  const send = config.fetch ?? globalThis.fetch.bind(globalThis);
  let response: Response;
  try {
    response = await send(`${CHATGPT_API}/read`, {
      method: 'POST',
      ...(request.signal ? { signal: request.signal } : {}),
      headers: { 'content-type': 'application/json', [CHATGPT_HEADER]: '1' },
      body: JSON.stringify({
        model: config.model,
        system: request.system,
        prompt: request.prompt,
        images: request.images,
        ...(request.freeText ? { freeText: true } : {}),
      } satisfies ChatGptReadRequest),
    });
  } catch {
    if (request.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw new ProviderError('other', 'The local sign-in helper could not be reached.');
  }

  const body = (await response.json().catch(() => null)) as ChatGptReadReply | null;
  if (!body) throw new ProviderError('other', `The local sign-in helper sent a reply that could not be read (${response.status}).`);
  if ('error' in body) throw new ProviderError(body.error.kind, body.error.message, body.error.usage);
  return { text: body.text, usage: body.usage };
}

/** Makes the one function the rest of the app needs from a provider. */
export function createReader(config: ProviderConfig): ReadLines {
  return (request) => {
    if (config.kind === 'anthropic') return readWithAnthropic(config, request);
    if (config.kind === 'chatgpt-plan') return readWithChatGptPlan(config, request);
    return readWithOpenAiCompatible(config, request);
  };
}
