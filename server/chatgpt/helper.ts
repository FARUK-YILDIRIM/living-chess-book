import type { IncomingMessage, ServerResponse } from 'node:http';
import { CHATGPT_API, CHATGPT_HEADER, type ChatGptReadRequest, type ChatGptSignInRequest } from '../../src/llm/chatgptProtocol.ts';
import { ChatGptAccountManager, type AccountOptions } from './account.ts';
import { ChatGptClient, ChatGptRequestError } from './responses.ts';

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const MAX_IMAGES = 10;
const MODEL = /^[\w.:-]{1,128}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

type Next = () => void;

const LOCAL_HOST_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostName(value: string): string {
  return value.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Only this app may use a reader's plan. The host check stops another site from pointing its
 * name at this computer, the origin check stops requests from its pages, and a custom header
 * needs a permission that this helper never grants.
 */
export function isFromThisApp(req: Pick<IncomingMessage, 'headers'>): boolean {
  const { host, origin } = req.headers;
  if (!host || !LOCAL_HOST_NAMES.has(hostName(host))) return false;
  if (req.headers[CHATGPT_HEADER] !== '1') return false;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Even if the app is ever opened up to a network, the helper stays on this computer. */
export function isOnThisComputer(req: Pick<IncomingMessage, 'socket'>): boolean {
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '');
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error('Bad JSON'));
      }
    });
  });
}

function readRequestFrom(body: unknown): ChatGptReadRequest | null {
  const { model, system, prompt, images, freeText } = (body ?? {}) as Record<string, unknown>;
  if (typeof model !== 'string' || !MODEL.test(model)) return null;
  if (typeof system !== 'string' || typeof prompt !== 'string') return null;
  // Reading a line always needs its picture, and a coach's answer has none.
  if (!Array.isArray(images) || images.length > MAX_IMAGES || (!images.length && freeText !== true)) return null;
  if (!images.every((image) => typeof image === 'string' && BASE64.test(image))) return null;
  return { model, system, prompt, images: images as string[], ...(freeText === true ? { freeText: true } : {}) };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export type HelperOptions = AccountOptions;

/** Handles the page's requests. Tokens stay in this process and its file. */
export function createChatGptHelper(options: HelperOptions) {
  const account = new ChatGptAccountManager(options);
  const client = new ChatGptClient({ account, ...(options.fetch ? { fetch: options.fetch } : {}) });

  const handle = async (req: IncomingMessage, res: ServerResponse, route: string): Promise<void> => {
    if (req.method === 'GET' && route === '/status') {
      json(res, 200, await account.status());
    } else if (req.method === 'GET' && route === '/models') {
      json(res, 200, { models: await client.listModels() });
    } else if (req.method === 'POST' && route === '/sign-in') {
      const { newAccount, enablePlan } = (await readBody(req)) as ChatGptSignInRequest;
      await account.signIn({ newAccount: newAccount === true, enablePlan: enablePlan === true });
      json(res, 200, await account.status());
    } else if (req.method === 'POST' && route === '/cancel-sign-in') {
      account.cancelSignIn();
      json(res, 200, await account.status());
    } else if (req.method === 'POST' && route === '/sign-out') {
      await account.signOut();
      json(res, 200, await account.status());
    } else if (req.method === 'POST' && route === '/read') {
      const request = readRequestFrom(await readBody(req));
      if (!request) {
        json(res, 400, { error: { kind: 'other', message: 'That request could not be understood.', usage: null } });
        return;
      }
      // Stopping in the app stops the request, so that it does not keep spending the plan.
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) controller.abort();
      });
      const reply = await client.read(request, controller.signal);
      if (!controller.signal.aborted) json(res, 200, reply);
    } else {
      json(res, 404, { error: { kind: 'other', message: 'No such request.', usage: null } });
    }
  };

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: Next): Promise<void> => {
    const url = req.url ?? '';
    if (url !== CHATGPT_API && !url.startsWith(`${CHATGPT_API}/`)) {
      next();
      return;
    }
    if (!isOnThisComputer(req) || !isFromThisApp(req)) {
      json(res, 403, { error: { kind: 'other', message: 'Only this app may use this helper.', usage: null } });
      return;
    }
    try {
      await handle(req, res, url.slice(CHATGPT_API.length).split('?')[0] ?? '');
    } catch (cause) {
      if (res.writableEnded || res.destroyed) return;
      // Messages here are written by this helper, and hold no tokens.
      if (cause instanceof ChatGptRequestError) {
        const status = cause.kind === 'plan-limit' || cause.kind === 'rate-limit' ? 429 : cause.kind === 'auth' ? 401 : 502;
        json(res, status, { error: { kind: cause.kind, message: cause.message, usage: cause.usage } });
      } else {
        json(res, 500, { error: { kind: 'other', message: 'The local sign-in helper hit a problem.', usage: null } });
      }
    }
  };
  return Object.assign(middleware, { close: () => account.close() });
}
