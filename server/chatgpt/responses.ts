import type { ChatGptErrorKind, ChatGptModel, ChatGptReadRequest, ChatGptUsage } from '../../src/llm/chatgptProtocol.ts';
import { LINE_REPLY_SCHEMA } from '../../src/llm/prompt.ts';
import { ChatGptAuthError, type ChatGptAccountManager } from './account.ts';

const API = 'https://api.openai.com/v1';
const TIMEOUT_MS = 180_000;

export class ChatGptRequestError extends Error {
  override readonly name = 'ChatGptRequestError';
  readonly kind: ChatGptErrorKind;
  readonly usage: ChatGptUsage;

  constructor(kind: ChatGptErrorKind, message: string, usage: ChatGptUsage = null) {
    super(message);
    this.kind = kind;
    this.usage = usage;
  }
}

const USAGE_LIMIT_MESSAGE = 'You have reached a usage limit for your ChatGPT plan or for this app. What was read is kept. You can continue later, or see Manage usage.';

/** What each documented code means for what the reader should do next. */
function errorFor(code: string | null, status: number, requestId: string | null, usage: ChatGptUsage, param: string | null = null): ChatGptRequestError {
  const reference = requestId ? ` (request ${requestId})` : '';
  // For diagnosis, as OpenAI asks. Never the body, and never a header with a token.
  console.warn(`[chatgpt] request failed: status=${status} code=${code ?? 'none'} param=${param ?? 'none'} request=${requestId ?? 'none'}`);
  switch (code) {
    case 'subscription_sharing_usage_limit_exceeded':
      return new ChatGptRequestError('plan-limit', USAGE_LIMIT_MESSAGE, usage);
    case 'subscription_sharing_usage_unavailable':
    case 'subscription_sharing_user_unavailable':
      return new ChatGptRequestError('rate-limit', `Your ChatGPT plan could not be checked just now${reference}.`, usage);
    case 'subscription_sharing_user_not_eligible':
      return new ChatGptRequestError('auth', `This ChatGPT account or workspace cannot use its plan in other apps${reference}.`, usage);
    case 'subscription_sharing_unsupported_capability':
      return new ChatGptRequestError(
        'auth',
        param?.includes('image') || param?.includes('input') || param === 'model'
          ? `This model cannot do what AI reading needs, because it must be able to read images. Please choose another model in Settings${reference}.`
          : `OpenAI does not support part of this request on a ChatGPT plan${param ? ` (${param})` : ''}${reference}.`,
        usage,
      );
    case 'subscription_sharing_route_not_supported':
      return new ChatGptRequestError('auth', `OpenAI does not support this request on a ChatGPT plan${reference}.`, usage);
    case 'subscription_sharing_invalid_user':
      return new ChatGptRequestError('auth', `OpenAI could not validate this ChatGPT account. Please check it in Settings${reference}.`, usage);
    case 'chatpass_v2_scope_not_authorized':
    case 'chatpass_v2_invalid_authorization_context':
      return new ChatGptRequestError('auth', `OpenAI's permission check did not pass for this app${reference}.`, usage);
  }
  // A limit with no code may be the plan's, and stopping costs nothing: a reader can continue later.
  if (status === 429 && !code) return new ChatGptRequestError('plan-limit', USAGE_LIMIT_MESSAGE, usage);
  if (status === 401) return new ChatGptRequestError('auth', `OpenAI did not accept this sign-in. Please check the account in Settings${reference}.`, usage);
  if (status === 403) return new ChatGptRequestError('auth', `OpenAI does not allow this request, which can depend on your region or account${reference}.`, usage);
  if (status === 404) return new ChatGptRequestError('auth', `OpenAI does not offer this model to your account. Please choose another in Settings${reference}.`, usage);
  if (status === 429) return new ChatGptRequestError('rate-limit', `OpenAI is limiting requests${reference}.`, usage);
  if (status === 503) return new ChatGptRequestError('rate-limit', `ChatGPT plan use is not available just now${reference}.`, usage);
  return new ChatGptRequestError('other', `OpenAI returned an error (${code ?? status})${reference}.`, usage);
}

async function errorFromResponse(response: Response): Promise<{ error: ChatGptRequestError; param: string | null }> {
  const text = await response.text().catch(() => '');
  let code: string | null = null;
  let param: string | null = null;
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; param?: unknown } };
    if (typeof parsed.error?.code === 'string') code = parsed.error.code;
    if (typeof parsed.error?.param === 'string') param = parsed.error.param;
  } catch {
    // Some failures come with a body that is not the usual shape.
  }
  return { error: errorFor(code, response.status, response.headers.get('x-request-id'), null, param), param };
}

interface StreamEvent {
  type?: string;
  delta?: unknown;
  code?: unknown;
  message?: unknown;
  response?: {
    output?: { content?: { type?: unknown; text?: unknown }[] }[];
    error?: { code?: unknown; param?: unknown } | null;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
    incomplete_details?: { reason?: unknown } | null;
  };
}

function usageOf(event: StreamEvent): ChatGptUsage {
  const input = event.response?.usage?.input_tokens;
  const output = event.response?.usage?.output_tokens;
  return typeof input === 'number' && typeof output === 'number' ? { input, output } : null;
}

/** Reads the stream. Only `response.completed` counts as success. */
async function readStream(response: Response, requestId: string | null): Promise<{ text: string; usage: ChatGptUsage }> {
  if (!response.body) throw new ChatGptRequestError('other', 'OpenAI sent an empty reply.');
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let text = '';
  let wasRefused = false;

  const handle = (line: string): { text: string; usage: ChatGptUsage } | null => {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return null;
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      return null;
    }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
    if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') wasRefused = true;
    if (event.type === 'response.completed') {
      if (wasRefused && !text) throw new ChatGptRequestError('refused', 'The model declined to read this part.', usageOf(event));
      // Some replies carry their text only in the final summary.
      const final = text || (event.response?.output ?? []).flatMap((item) => item.content ?? []).flatMap((part) => (part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [])).join('');
      return { text: final, usage: usageOf(event) };
    }
    if (event.type === 'response.failed') {
      const code = event.response?.error?.code;
      const param = event.response?.error?.param;
      throw errorFor(typeof code === 'string' ? code : null, 200, requestId, usageOf(event), typeof param === 'string' ? param : null);
    }
    if (event.type === 'response.incomplete') {
      const reason = event.response?.incomplete_details?.reason;
      if (reason === 'content_filter') throw new ChatGptRequestError('refused', 'The model declined to read this part.', usageOf(event));
      throw new ChatGptRequestError('too-long', 'The reply was cut off.', usageOf(event));
    }
    if (event.type === 'error') throw errorFor(typeof event.code === 'string' ? event.code : null, 200, requestId, null);
    return null;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        const finished = handle(line);
        if (finished) return finished;
      }
      if (done) throw new ChatGptRequestError('other', 'The reply from OpenAI stopped before it finished.');
    }
  } finally {
    // Whatever ended the reading, the connection should not stay open.
    void reader.cancel().catch(() => {});
  }
}

export interface ChatGptClientOptions {
  account: ChatGptAccountManager;
  fetch?: typeof globalThis.fetch;
}

/** Makes requests on a reader's plan. Nothing is resent automatically, except after a renewed sign-in. */
export class ChatGptClient {
  private readonly account: ChatGptAccountManager;
  private readonly send: typeof globalThis.fetch;

  constructor(options: ChatGptClientOptions) {
    this.account = options.account;
    this.send = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async withToken<T>(run: (token: string) => Promise<Response>, finish: (response: Response) => Promise<T>): Promise<T> {
    let token: string;
    try {
      token = await this.account.accessToken();
    } catch (cause) {
      throw ChatGptClient.fromAuth(cause);
    }
    let response = await run(token);
    // A 401 costs nothing, and an hour-old token is an ordinary cause.
    if (response.status === 401) {
      void response.body?.cancel().catch(() => {});
      try {
        response = await run(await this.account.refreshAfterRejection(token));
      } catch (cause) {
        throw ChatGptClient.fromAuth(cause);
      }
    }
    return finish(response);
  }

  private static fromAuth(cause: unknown): ChatGptRequestError {
    if (cause instanceof ChatGptAuthError) return new ChatGptRequestError('auth', cause.message);
    return new ChatGptRequestError('rate-limit', cause instanceof Error ? cause.message : 'The ChatGPT sign-in could not be renewed.');
  }

  async listModels(): Promise<ChatGptModel[]> {
    return this.withToken(
      (token) => this.send(`${API}/models`, { redirect: 'error', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }),
      async (response) => {
        if (!response.ok) throw (await errorFromResponse(response)).error;
        const body = (await response.json()) as { models?: { slug?: unknown; display_name?: unknown; visibility?: unknown }[] };
        return (body.models ?? []).flatMap((model) =>
          model.visibility === 'list' && typeof model.slug === 'string'
            ? [{ slug: model.slug, name: typeof model.display_name === 'string' ? model.display_name : model.slug }]
            : [],
        );
      },
    );
  }

  async read(request: ChatGptReadRequest, signal?: AbortSignal): Promise<{ text: string; usage: ChatGptUsage }> {
    // Covers a slow renewal of the sign-in too, which is why it starts here.
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const post = (token: string, withSchema: boolean) =>
      this.send(`${API}/responses`, {
        method: 'POST',
        redirect: 'error',
        signal: combined,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          model: request.model,
          // OpenAI requires both of these for this kind of sign-in.
          store: false,
          stream: true,
          instructions: request.system,
          input: [
            {
              role: 'user',
              content: [
                ...request.images.map((data) => ({ type: 'input_image', image_url: `data:image/png;base64,${data}` })),
                { type: 'input_text', text: request.prompt },
              ],
            },
          ],
          ...(withSchema ? { text: { format: { type: 'json_schema', name: 'chess_lines', strict: true, schema: LINE_REPLY_SCHEMA } } } : {}),
        }),
      });

    try {
      let usedToken = '';
      return await this.withToken(
        (token) => {
          usedToken = token;
          return post(token, !request.freeText);
        },
        async (response) => {
          if (response.ok) return readStream(response, response.headers.get('x-request-id'));
          const { error, param } = await errorFromResponse(response);
          // Not every model takes a schema. The reply is checked either way.
          if (response.status === 400 && param?.startsWith('text')) {
            const again = await post(usedToken, false);
            if (again.ok) return readStream(again, again.headers.get('x-request-id'));
            throw (await errorFromResponse(again)).error;
          }
          throw error;
        },
      );
    } catch (cause) {
      if (cause instanceof ChatGptRequestError) throw cause;
      if (signal?.aborted) throw cause;
      if (timeout.aborted) throw new ChatGptRequestError('other', 'OpenAI took too long to reply.');
      throw new ChatGptRequestError('other', 'OpenAI could not be reached.');
    }
  }
}
