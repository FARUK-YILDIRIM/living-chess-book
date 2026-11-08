import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptAccountManager } from '../server/chatgpt/account';
import { createChatGptHelper, isFromThisApp, isOnThisComputer } from '../server/chatgpt/helper';
import { ChatGptClient, ChatGptRequestError } from '../server/chatgpt/responses';
import { CHATGPT_API, CHATGPT_HEADER, type ChatGptReadRequest } from '../src/llm/chatgptProtocol';
import { createReader, ProviderError } from '../src/llm/providers';
import { DEFAULT_SETTINGS, CHATGPT_PLAN, resolveProvider, settingsFromStorage } from '../src/llm/settings';

const CLIENT_ID = 'oaiapp_test';
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let privateKey: CryptoKey;
let publicJwk: JWK;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  otherKey = (await generateKeyPair('RS256')).privateKey;
});

function idToken(claims: { nonce: string; sub?: string; aud?: string; iss?: string; email?: string; key?: CryptoKey; expired?: boolean }) {
  return new SignJWT({ nonce: claims.nonce, email: claims.email ?? 'reader@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(claims.iss ?? 'https://auth.openai.com')
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub ?? 'user-1')
    .setIssuedAt()
    .setExpirationTime(claims.expired ? '-1h' : '1h')
    .sign(claims.key ?? privateKey);
}

const FULL_SCOPE = 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke';

interface Fake {
  fetch: typeof globalThis.fetch;
  tokenCalls: URLSearchParams[];
  revokeCalls: URLSearchParams[];
  responsesCalls: { body: Record<string, unknown>; authorization: string | null }[];
  onToken: (form: URLSearchParams, nonce: string) => Promise<Response> | Response;
  onResponses: (attempt: number) => Response;
  onModels: () => Response;
  onRevoke: () => Response;
  /** Holds back replies from the Responses API until released. */
  gate: Promise<void>;
  lastSignal: AbortSignal | null;
}

function fakeOpenAi(getNonce: () => string): Fake {
  const fake: Fake = {
    tokenCalls: [],
    revokeCalls: [],
    responsesCalls: [],
    onToken: async (form, nonce) =>
      form.get('grant_type') === 'refresh_token'
        ? json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: FULL_SCOPE })
        : json({
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            id_token: await idToken({ nonce }),
            expires_in: 3600,
            scope: FULL_SCOPE,
          }),
    onResponses: () => sse([{ type: 'response.output_text.delta', delta: '{"lines":[]}' }, { type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 4 } } }]),
    onModels: () => json({ models: [{ slug: 'model-a', display_name: 'Model A', visibility: 'list' }, { slug: 'hidden', display_name: 'Hidden', visibility: 'hide' }] }),
    onRevoke: () => new Response('', { status: 200 }),
    gate: Promise.resolve(),
    lastSignal: null,
    fetch: (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.redirect).toBe('error');
      if (url === 'https://auth.openai.com/.well-known/jwks.json') return json({ keys: [publicJwk] });
      if (url === 'https://auth.openai.com/api/accounts/oauth/token') {
        const form = new URLSearchParams(String(init?.body));
        fake.tokenCalls.push(form);
        return fake.onToken(form, getNonce());
      }
      if (url === 'https://auth.openai.com/api/accounts/oauth/revoke') {
        fake.revokeCalls.push(new URLSearchParams(String(init?.body)));
        return fake.onRevoke();
      }
      if (url === 'https://api.openai.com/v1/models') return fake.onModels();
      if (url === 'https://api.openai.com/v1/responses') {
        fake.responsesCalls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, authorization: new Headers(init?.headers).get('authorization') });
        fake.lastSignal = init?.signal ?? null;
        await fake.gate;
        return fake.onResponses(fake.responsesCalls.length - 1);
      }
      throw new Error(`Unexpected request to ${url}`);
    }) as typeof globalThis.fetch,
  };
  return fake;
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_1' } });
}

let dir: string;
let authorizeUrl: URL | null;
let nonce: string;
let fake: Fake;
let account: ChatGptAccountManager;
let clock: number;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'living-chess-book-test-'));
  authorizeUrl = null;
  nonce = '';
  clock = Date.now();
  fake = fakeOpenAi(() => nonce);
  account = new ChatGptAccountManager({
    dir,
    fetch: fake.fetch,
    now: () => clock,
    preferredPort: 0,
    openBrowser: (url) => {
      authorizeUrl = new URL(url);
      nonce = authorizeUrl.searchParams.get('nonce')!;
    },
  });
});

afterEach(async () => {
  account.cancelSignIn();
  await rm(dir, { recursive: true, force: true });
});

const callbackUrl = (params: Record<string, string>, state = authorizeUrl!.searchParams.get('state')!) => {
  const url = new URL(authorizeUrl!.searchParams.get('redirect_uri')!);
  for (const [key, value] of Object.entries({ state, ...params })) url.searchParams.set(key, value);
  return url;
};

async function completeSignIn(params: Record<string, string> = { code: 'code-1', client_id: CLIENT_ID }) {
  await account.signIn();
  return fetch(callbackUrl(params));
}

const credentialsText = () => readFile(path.join(dir, 'chatgpt-credentials.json'), 'utf8');

describe('sign-in', () => {
  it('starts as OpenAI describes for a first registration', async () => {
    await account.signIn();
    const url = authorizeUrl!;
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize');
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(url.searchParams.get('agent_name_hint')).toBe('Living Chess Book');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('resource')).toBe('https://api.openai.com/v1');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(expect.arrayContaining(['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct']));
    expect(url.searchParams.get('ext_agent_host_id')).toMatch(/^urn:uuid:/);
    expect(url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    expect(await account.status()).toMatchObject({ isWaiting: true, isSignedIn: false });
  });

  it('finishes, and stores tokens where only this user can read them', async () => {
    const page = await completeSignIn();
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain('access-1');
    expect(await account.status()).toEqual({ isSignedIn: true, isPlanEnabled: true, email: 'reader@example.com', hasSavedAccount: true, isWaiting: false, problem: null });

    const exchange = fake.tokenCalls[0]!;
    expect(exchange.get('client_id')).toBe(CLIENT_ID);
    expect(exchange.get('code')).toBe('code-1');
    expect(exchange.get('redirect_uri')).toBe(authorizeUrl!.searchParams.get('redirect_uri'));
    expect(exchange.get('resource')).toBe('https://api.openai.com/v1');
    expect(exchange.get('code_verifier')).toBeTruthy();

    expect(JSON.parse(await credentialsText()).accounts[0]).toMatchObject({ clientId: CLIENT_ID, accessToken: 'access-1', refreshToken: 'refresh-1' });
    if (process.platform !== 'win32') {
      expect((await stat(path.join(dir, 'chatgpt-credentials.json'))).mode & 0o777).toBe(0o600);
    }
  });

  it('never tells the page about tokens', async () => {
    await completeSignIn();
    expect(JSON.stringify(await account.status())).not.toMatch(/access-1|refresh-1|eyJ/);
  });

  it('keeps the same host id for later sign-ins', async () => {
    await completeSignIn();
    const first = authorizeUrl!.searchParams.get('ext_agent_host_id');
    await account.signIn();
    expect(authorizeUrl!.searchParams.get('ext_agent_host_id')).toBe(first);
  });

  it('ignores a callback with the wrong state, and keeps waiting', async () => {
    await account.signIn();
    const page = await fetch(callbackUrl({ code: 'x', client_id: CLIENT_ID }, 'wrong-state'));
    expect(page.status).toBe(400);
    expect(fake.tokenCalls).toHaveLength(0);
    expect(await account.status()).toMatchObject({ isWaiting: true, isSignedIn: false });
  });

  it('stops when the reader declines, without exchanging anything', async () => {
    await account.signIn();
    await fetch(callbackUrl({ error: 'access_denied' }));
    expect(fake.tokenCalls).toHaveLength(0);
    expect(await account.status()).toMatchObject({ isWaiting: false, isSignedIn: false, problem: expect.stringContaining('declined') });
  });

  it('treats a first registration with no issued id as unfinished', async () => {
    await completeSignIn({ code: 'code-1' });
    expect(fake.tokenCalls).toHaveLength(0);
    expect((await account.status()).isSignedIn).toBe(false);
  });

  it('never saves the placeholder client id', async () => {
    await completeSignIn({ code: 'code-1', client_id: 'dynamic_agent_client' });
    expect(fake.tokenCalls).toHaveLength(0);
  });

  it.each([
    ['a wrong signature', { key: 'other' }],
    ['a wrong issuer', { iss: 'https://evil.example.com' }],
    ['a wrong audience', { aud: 'someone-else' }],
    ['an expired token', { expired: true }],
    ['a wrong nonce', { nonce: 'not-it' }],
  ])('rejects an ID token with %s', async (_name, claims) => {
    fake.onToken = async (_form, currentNonce) =>
      json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: await idToken({ nonce: currentNonce, ...claims, key: 'key' in claims ? otherKey : privateKey } as never),
        scope: FULL_SCOPE,
      });
    await completeSignIn();
    expect(await account.status()).toMatchObject({ isSignedIn: false, problem: expect.stringContaining('verified') });
    await expect(credentialsText()).resolves.not.toContain('access-1');
  });

  it('keeps the sign-in but no plan use without the scope', async () => {
    fake.onToken = async (_form, currentNonce) =>
      json({ access_token: 'access-1', refresh_token: 'refresh-1', id_token: await idToken({ nonce: currentNonce }), scope: 'openid profile email offline_access' });
    await completeSignIn();
    expect(await account.status()).toMatchObject({ isSignedIn: true, isPlanEnabled: false });
    await expect(account.accessToken()).rejects.toThrow('sign in');
  });

  it('asks for consent again when the reader chooses to allow plan use', async () => {
    await completeSignIn();
    await account.signIn({ enablePlan: true });
    expect(authorizeUrl!.searchParams.get('prompt')).toBe('consent');
    expect(authorizeUrl!.searchParams.get('scope')).toContain('chatgpt.tokens.use.direct');
  });

  it('signs back in with the saved registration', async () => {
    await completeSignIn();
    await account.signIn();
    const url = authorizeUrl!;
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.has('agent_name_hint')).toBe(false);
    expect(url.searchParams.get('login_hint')).toBe('reader@example.com');
  });

  it('refuses a different account on a returning sign-in', async () => {
    await completeSignIn();
    fake.onToken = async (_form, currentNonce) => json({ access_token: 'access-9', refresh_token: 'refresh-9', id_token: await idToken({ nonce: currentNonce, sub: 'user-2' }), scope: FULL_SCOPE });
    await account.signIn();
    await fetch(callbackUrl({ code: 'code-2' }));
    await expect(credentialsText()).resolves.not.toContain('access-9');
    expect((await account.status()).problem).toContain('different ChatGPT account');
  });

  it('rejects a different client id on a returning sign-in', async () => {
    await completeSignIn();
    const before = fake.tokenCalls.length;
    await account.signIn();
    await fetch(callbackUrl({ code: 'code-2', client_id: 'oaiapp_other' }));
    expect(fake.tokenCalls).toHaveLength(before);
  });

  it('registers afresh when asked for another account', async () => {
    await completeSignIn();
    await account.signIn({ newAccount: true });
    expect(authorizeUrl!.searchParams.get('client_id')).toBe('dynamic_agent_client');
  });

  it('spends a code only once when the callback page is reloaded', async () => {
    await account.signIn();
    const url = callbackUrl({ code: 'code-1', client_id: CLIENT_ID });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const normal = fake.onToken;
    fake.onToken = async (form, currentNonce) => {
      await held;
      return normal(form, currentNonce);
    };
    const first = fetch(url);
    await vi.waitFor(() => expect(fake.tokenCalls).toHaveLength(1));
    const second = await fetch(url).catch(() => null);
    release();
    await first;
    expect(fake.tokenCalls).toHaveLength(1);
    expect(second === null || second.status === 400).toBe(true);
    expect((await account.status()).isSignedIn).toBe(true);
  });

  it('keeps nothing from an exchange that was cancelled meanwhile, and ends it at OpenAI', async () => {
    await account.signIn();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const normal = fake.onToken;
    fake.onToken = async (form, currentNonce) => {
      await held;
      return normal(form, currentNonce);
    };
    const page = fetch(callbackUrl({ code: 'code-1', client_id: CLIENT_ID })).catch(() => null);
    await vi.waitFor(() => expect(fake.tokenCalls).toHaveLength(1));
    expect((await account.status()).isWaiting).toBe(true);
    account.cancelSignIn();
    release();
    await page;
    await vi.waitFor(() => expect(fake.revokeCalls).toHaveLength(1));
    expect((await account.status()).isSignedIn).toBe(false);
    expect(await credentialsText()).not.toContain('access-1');
  });

  it('reuses an issued id after a failed first exchange, as OpenAI asks', async () => {
    fake.onToken = () => json({ error: 'invalid_grant' }, 400);
    await completeSignIn();
    expect((await account.status()).isSignedIn).toBe(false);
    await account.signIn();
    expect(authorizeUrl!.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authorizeUrl!.searchParams.has('agent_name_hint')).toBe(false);
  });

  it('forgets a pending id once the sign-in works', async () => {
    const normal = fake.onToken;
    fake.onToken = () => json({ error: 'invalid_grant' }, 400);
    await completeSignIn();
    fake.onToken = normal;
    await account.signIn();
    await fetch(callbackUrl({ code: 'code-2' }));
    expect((await account.status()).isSignedIn).toBe(true);
    expect(await credentialsText()).not.toContain('pendingClientId');
  });

  it('starts sign-ins one at a time', async () => {
    const opened: string[] = [];
    const counting = new ChatGptAccountManager({ dir, fetch: fake.fetch, preferredPort: 0, openBrowser: (url) => opened.push(url) });
    await Promise.all([counting.signIn(), counting.signIn(), counting.signIn()]);
    counting.close();
    expect(opened).toHaveLength(3);
    expect((await counting.status()).isWaiting).toBe(false);
  });

  it('rejects an ID token with no expiry', async () => {
    fake.onToken = async (_form, currentNonce) => {
      const token = await new SignJWT({ nonce: currentNonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer('https://auth.openai.com')
        .setAudience(CLIENT_ID)
        .setSubject('user-1')
        .sign(privateKey);
      return json({ access_token: 'access-1', refresh_token: 'refresh-1', id_token: token, scope: FULL_SCOPE });
    };
    await completeSignIn();
    expect((await account.status()).isSignedIn).toBe(false);
  });

  it('offers the saved account after signing out, and says another is possible', async () => {
    await completeSignIn();
    await account.signOut();
    expect(await account.status()).toMatchObject({ isSignedIn: false, hasSavedAccount: true });
  });

  it('can be cancelled', async () => {
    await account.signIn();
    account.cancelSignIn();
    expect((await account.status()).isWaiting).toBe(false);
  });
});

describe('tokens', () => {
  beforeEach(async () => {
    await completeSignIn();
  });

  it('uses a token that is still good', async () => {
    expect(await account.accessToken()).toBe('access-1');
    expect(fake.tokenCalls).toHaveLength(1);
  });

  it('renews near expiry, as OpenAI describes, and saves the replacement', async () => {
    clock += 58 * 60_000;
    expect(await account.accessToken()).toBe('access-2');
    const refresh = fake.tokenCalls.at(-1)!;
    expect(refresh.get('grant_type')).toBe('refresh_token');
    expect(refresh.get('client_id')).toBe(CLIENT_ID);
    expect(refresh.get('refresh_token')).toBe('refresh-1');
    expect(refresh.get('resource')).toBe('https://api.openai.com/v1');
    expect(refresh.has('scope')).toBe(false);
    expect(await credentialsText()).toContain('refresh-2');
    expect(await credentialsText()).not.toContain('refresh-1');
  });

  it('renews only once for requests that arrive together', async () => {
    clock += 58 * 60_000;
    const tokens = await Promise.all([account.accessToken(), account.accessToken(), account.accessToken()]);
    expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    expect(fake.tokenCalls.filter((f) => f.get('grant_type') === 'refresh_token')).toHaveLength(1);
  });

  it('asks for a new sign-in when a refresh token has died', async () => {
    clock += 58 * 60_000;
    fake.onToken = () => json({ error: 'invalid_grant' }, 400);
    await expect(account.accessToken()).rejects.toThrow('sign in again');
    expect((await account.status()).isSignedIn).toBe(false);
    expect(await credentialsText()).toContain(CLIENT_ID);
    expect(await credentialsText()).not.toContain('refresh-1');
  });

  it('keeps the sign-in through a passing failure', async () => {
    clock += 58 * 60_000;
    fake.onToken = () => json({ error: 'server_error' }, 500);
    await expect(account.accessToken()).rejects.toThrow('try again');
    expect((await account.status()).isSignedIn).toBe(true);
    expect(await credentialsText()).toContain('refresh-1');
  });

  it('does not bring tokens back when a renewal finishes after signing out', async () => {
    clock += 58 * 60_000;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const normal = fake.onToken;
    fake.onToken = async (form, currentNonce) => {
      await held;
      return normal(form, currentNonce);
    };
    const renewal = account.accessToken().catch((cause: unknown) => cause);
    await vi.waitFor(() => expect(fake.tokenCalls.filter((f) => f.get('grant_type') === 'refresh_token')).toHaveLength(1));
    await account.signOut();
    release();
    expect(await renewal).toBeInstanceOf(Error);
    expect((await account.status()).isSignedIn).toBe(false);
    const text = await credentialsText();
    expect(text).not.toMatch(/access-2|refresh-2/);
    // What the late renewal produced is ended at OpenAI as well.
    expect(fake.revokeCalls.map((f) => f.get('token'))).toContain('refresh-2');
  });

  it('removes tokens here before waiting on OpenAI', async () => {
    let contentsDuringRevoke = '';
    fake.onRevoke = () => {
      throw new Error('checked below');
    };
    const send = fake.fetch;
    const checking = new ChatGptAccountManager({
      dir,
      preferredPort: 0,
      fetch: (async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith('/revoke')) {
          contentsDuringRevoke = await credentialsText();
          return new Response('', { status: 200 });
        }
        return send(input, init);
      }) as never,
    });
    await checking.signOut();
    expect(contentsDuringRevoke).toContain(CLIENT_ID);
    expect(contentsDuringRevoke).not.toContain('refresh-1');
  });

  it.each([
    ['a plain code', { code: 'refresh_token_expired' }],
    ['an error field', { error: 'invalid_grant' }],
    ['a nested code', { error: { code: 'refresh_token_reused' } }],
  ])('recognises a dead refresh token given as %s', async (_name, body) => {
    clock += 58 * 60_000;
    fake.onToken = () => json(body, 400);
    await expect(account.accessToken()).rejects.toThrow('sign in again');
    expect(await account.status()).toMatchObject({ isSignedIn: false, problem: expect.stringContaining('sign in again') });
  });

  it('reports a registration OpenAI no longer accepts, and keeps it for checking', async () => {
    clock += 58 * 60_000;
    fake.onToken = () => json({ error: 'invalid_client' }, 401);
    await expect(account.accessToken()).rejects.toThrow('no longer accepts');
    expect((await account.status()).isSignedIn).toBe(true);
  });

  it('notices when a renewal has lost permission to use the plan', async () => {
    clock += 58 * 60_000;
    fake.onToken = () => json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: 'openid' });
    await expect(account.accessToken()).rejects.toThrow('permission');
  });

  it('revokes on signing out, and keeps the registration', async () => {
    await account.signOut();
    expect(fake.revokeCalls[0]!.get('token')).toBe('refresh-1');
    expect(fake.revokeCalls[0]!.get('token_type_hint')).toBe('refresh_token');
    expect(fake.revokeCalls[0]!.get('client_id')).toBe(CLIENT_ID);
    expect(await account.status()).toMatchObject({ isSignedIn: false, problem: null });
    const text = await credentialsText();
    expect(text).toContain(CLIENT_ID);
    expect(text).not.toMatch(/access-1|refresh-1|idToken/);
  });

  it('says so when OpenAI does not confirm signing out', async () => {
    fake.onRevoke = () => new Response('', { status: 500 });
    await account.signOut();
    expect(await account.status()).toMatchObject({ isSignedIn: false, problem: expect.stringContaining('did not confirm') });
  });

  it('omits the ID token hint after signing out', async () => {
    await account.signOut();
    await account.signIn();
    expect(authorizeUrl!.searchParams.has('id_token_hint')).toBe(false);
  });
});

describe('requests on a plan', () => {
  const request: ChatGptReadRequest = { model: 'model-a', system: 'sys', prompt: 'read', images: ['AAAA'] };
  let client: ChatGptClient;

  beforeEach(async () => {
    await completeSignIn();
    client = new ChatGptClient({ account, fetch: fake.fetch });
  });

  it('lists only models meant to be listed, in the order given', async () => {
    expect(await client.listModels()).toEqual([{ slug: 'model-a', name: 'Model A' }]);
  });

  it('sends what OpenAI requires, and nothing it rejects', async () => {
    expect(await client.read(request)).toEqual({ text: '{"lines":[]}', usage: { input: 9, output: 4 } });
    const { body, authorization } = fake.responsesCalls[0]!;
    expect(authorization).toBe('Bearer access-1');
    expect(body).toMatchObject({ model: 'model-a', store: false, stream: true, instructions: 'sys' });
    const input = body['input'] as { role: string; content: { type: string; image_url?: string }[] }[];
    expect(input[0]!.role).toBe('user');
    expect(input[0]!.content[0]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,AAAA' });
    for (const field of ['temperature', 'top_p', 'max_output_tokens', 'metadata', 'previous_response_id', 'user', 'background', 'prompt']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('counts only a completed stream as success', async () => {
    fake.onResponses = () => sse([{ type: 'response.output_text.delta', delta: 'partial' }]);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'other' });
  });

  it('handles events split across chunks', async () => {
    const whole = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'héllo' })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: {} })}\n\n`;
    const bytes = new TextEncoder().encode(whole);
    fake.onResponses = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
          },
        }),
      );
    expect((await client.read(request)).text).toBe('héllo');
  });

  it('stops for a plan limit, even one that arrives mid-stream', async () => {
    fake.onResponses = () =>
      sse([
        { type: 'response.output_text.delta', delta: '{' },
        { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } },
      ]);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'plan-limit' });
    expect(fake.responsesCalls).toHaveLength(1);
  });

  it.each([
    [429, 'subscription_sharing_usage_limit_exceeded', 'plan-limit'],
    [503, 'subscription_sharing_usage_unavailable', 'rate-limit'],
    [503, 'subscription_sharing_user_unavailable', 'rate-limit'],
    [403, 'subscription_sharing_user_not_eligible', 'auth'],
    [400, 'subscription_sharing_unsupported_capability', 'auth'],
    [403, 'chatpass_v2_scope_not_authorized', 'auth'],
  ])('maps status %i with code %s to %s', async (status, code, kind) => {
    fake.onResponses = () => json({ error: { code } }, status);
    await expect(client.read(request)).rejects.toMatchObject({ kind });
    expect(fake.responsesCalls).toHaveLength(1);
  });

  it('stops for a limit with no code at all', async () => {
    fake.onResponses = () => json({ detail: 'Too many requests' }, 429);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'plan-limit' });
  });

  it('waits out an ordinary limit with a code', async () => {
    fake.onResponses = () => json({ error: { code: 'rate_limit_exceeded' } }, 429);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'rate-limit' });
  });

  it('blames the model only when the image or model was the problem', async () => {
    fake.onResponses = () => json({ error: { code: 'subscription_sharing_unsupported_capability', param: 'input[0].content[0]' } }, 400);
    await expect(client.read(request)).rejects.toThrow('read images');
    fake.onResponses = () => json({ error: { code: 'subscription_sharing_unsupported_capability', param: 'service_tier' } }, 400);
    await expect(client.read(request)).rejects.toThrow('service_tier');
  });

  it('reports a refusal given as its own stream event', async () => {
    fake.onResponses = () => sse([{ type: 'response.refusal.delta', delta: 'No' }, { type: 'response.completed', response: {} }]);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'refused' });
  });

  it('reads text from the final summary when no pieces came', async () => {
    fake.onResponses = () => sse([{ type: 'response.completed', response: { output: [{ content: [{ type: 'output_text', text: 'whole' }] }] } }]);
    expect((await client.read(request)).text).toBe('whole');
  });

  it('copes with a failure body of another shape', async () => {
    fake.onResponses = () => json({ detail: 'Not available in this region' }, 403, { 'x-request-id': 'req_9' });
    const failure = await client.read(request).catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ kind: 'auth' });
    expect((failure as Error).message).toContain('req_9');
  });

  it('renews once after a 401, then uses the new token', async () => {
    fake.onResponses = (attempt) => (attempt === 0 ? json({ detail: 'expired' }, 401) : sse([{ type: 'response.completed', response: {} }]));
    await client.read(request);
    expect(fake.responsesCalls.map((c) => c.authorization)).toEqual(['Bearer access-1', 'Bearer access-2']);
  });

  it('tries without a schema only when the schema was the complaint', async () => {
    fake.onResponses = (attempt) => (attempt === 0 ? json({ error: { code: 'invalid', param: 'text.format' } }, 400) : sse([{ type: 'response.completed', response: {} }]));
    await client.read(request);
    expect(fake.responsesCalls[1]!.body).not.toHaveProperty('text');

    fake.responsesCalls.length = 0;
    fake.onResponses = () => json({ error: { code: 'bad_image' } }, 400);
    await expect(client.read(request)).rejects.toBeInstanceOf(ChatGptRequestError);
    expect(fake.responsesCalls).toHaveLength(1);
  });

  it('never puts a token in an error message', async () => {
    fake.onResponses = () => json({ error: { code: 'something' } }, 500);
    const failure = (await client.read(request).catch((cause: unknown) => cause)) as Error;
    expect(failure.message).not.toContain('access-1');
  });

  it('reports a refusal and a cut-off reply', async () => {
    fake.onResponses = () => sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }]);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'refused' });
    fake.onResponses = () => sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]);
    await expect(client.read(request)).rejects.toMatchObject({ kind: 'too-long' });
  });
});

describe('who may use the helper', () => {
  const allowed = { host: 'localhost:5183', origin: 'http://localhost:5183', [CHATGPT_HEADER]: '1' };

  it('accepts this app', () => {
    expect(isFromThisApp({ headers: allowed })).toBe(true);
    expect(isFromThisApp({ headers: { host: '127.0.0.1:5183', origin: 'http://127.0.0.1:5183', [CHATGPT_HEADER]: '1' } })).toBe(true);
  });

  it.each([
    ['another site', { ...allowed, origin: 'https://evil.example.com' }],
    ['a name pointed at this computer', { ...allowed, host: 'evil.example.com:5183', origin: 'http://evil.example.com:5183' }],
    ['no custom header', { host: allowed.host, origin: allowed.origin }],
    ['another local port', { ...allowed, origin: 'http://localhost:9999' }],
    ['a bad origin', { ...allowed, origin: 'null' }],
    ['no host', { origin: allowed.origin, [CHATGPT_HEADER]: '1' }],
  ])('refuses %s', (_name, headers) => {
    expect(isFromThisApp({ headers })).toBe(false);
  });
});

describe('helper', () => {
  let server: http.Server;
  let base: string;
  let helperAccountUrl: URL | null;

  beforeEach(async () => {
    helperAccountUrl = null;
    const handler = createChatGptHelper({
      dir,
      fetch: fake.fetch,
      preferredPort: 0,
      openBrowser: (url) => {
        helperAccountUrl = new URL(url);
        nonce = helperAccountUrl.searchParams.get('nonce')!;
      },
    });
    server = http.createServer((req, res) =>
      void handler(req, res, () => {
        res.statusCode = 200;
        res.end('app');
      }),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await fetch(`${base}${CHATGPT_API}/cancel-sign-in`, { method: 'POST', headers: { [CHATGPT_HEADER]: '1' } });
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const call = (route: string, body?: unknown) =>
    fetch(`${base}${CHATGPT_API}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { [CHATGPT_HEADER]: '1', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  async function signIn() {
    await call('/sign-in', {});
    const url = new URL(helperAccountUrl!.searchParams.get('redirect_uri')!);
    url.searchParams.set('state', helperAccountUrl!.searchParams.get('state')!);
    url.searchParams.set('code', 'code-1');
    url.searchParams.set('client_id', CLIENT_ID);
    await fetch(url);
  }

  it('leaves other requests to the app', async () => {
    expect(await (await fetch(`${base}/index.html`)).text()).toBe('app');
  });

  it('refuses a request from another computer', () => {
    expect(isOnThisComputer({ socket: { remoteAddress: '192.168.1.20' } as never })).toBe(false);
    expect(isOnThisComputer({ socket: { remoteAddress: '::ffff:127.0.0.1' } as never })).toBe(true);
  });

  it('refuses a request from elsewhere', async () => {
    const response = await fetch(`${base}${CHATGPT_API}/status`);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('isSignedIn');
  });

  it('reads through the helper, with no token reaching the page', async () => {
    await signIn();
    const status = await (await call('/status')).text();
    expect(status).not.toMatch(/access-1|refresh-1/);
    const reader = createReader({
      kind: 'chatgpt-plan',
      apiKey: '',
      model: 'model-a',
      fetch: ((input: string, init?: RequestInit) => fetch(`${base}${input}`, init)) as never,
    });
    expect(await reader({ system: 's', prompt: 'p', images: ['AAAA'] })).toEqual({ text: '{"lines":[]}', usage: { input: 9, output: 4 } });
  });

  it('lets a plan limit reach the app as a plan limit', async () => {
    await signIn();
    fake.onResponses = () => json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, 429);
    const reader = createReader({
      kind: 'chatgpt-plan',
      apiKey: '',
      model: 'model-a',
      fetch: ((input: string, init?: RequestInit) => fetch(`${base}${input}`, init)) as never,
    });
    const failure = await reader({ system: 's', prompt: 'p', images: ['AAAA'] }).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).kind).toBe('plan-limit');
  });

  it.each([
    ['a bad model', { model: 'a b/c', system: 's', prompt: 'p', images: ['AAAA'] }],
    ['no images', { model: 'm', system: 's', prompt: 'p', images: [] }],
    ['an image that is not base64', { model: 'm', system: 's', prompt: 'p', images: ['"><x'] }],
    ['too many images', { model: 'm', system: 's', prompt: 'p', images: Array(11).fill('AAAA') }],
  ])('refuses %s', async (_name, body) => {
    await signIn();
    expect((await call('/read', body)).status).toBe(400);
    expect(fake.responsesCalls).toHaveLength(0);
  });

  it('stops the request when the app stops', async () => {
    await signIn();
    fake.gate = new Promise(() => {});
    const controller = new AbortController();
    const pending = fetch(`${base}${CHATGPT_API}/read`, {
      method: 'POST',
      signal: controller.signal,
      headers: { [CHATGPT_HEADER]: '1' },
      body: JSON.stringify({ model: 'm', system: 's', prompt: 'p', images: ['AAAA'] }),
    }).catch(() => 'stopped');
    await vi.waitFor(() => expect(fake.responsesCalls).toHaveLength(1));
    expect(fake.lastSignal!.aborted).toBe(false);
    controller.abort();
    expect(await pending).toBe('stopped');
    await vi.waitFor(() => expect(fake.lastSignal!.aborted).toBe(true));
  });
});

describe('credential file', () => {
  it('tightens a file and folder made with looser permissions', async () => {
    if (process.platform === 'win32') return;
    await completeSignIn();
    const file = path.join(dir, 'chatgpt-credentials.json');
    await chmod(file, 0o644);
    await chmod(dir, 0o755);
    await account.status();
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it('sets a damaged file aside, rather than overwriting it', async () => {
    const file = path.join(dir, 'chatgpt-credentials.json');
    await writeFile(file, '{not json', { mode: 0o600 });
    expect((await account.status()).isSignedIn).toBe(false);
    const names = await readdir(dir);
    expect(names.some((name) => name.includes('damaged'))).toBe(true);
    expect(names).toContain('chatgpt-credentials.json');
  });
});

describe('settings for a plan', () => {
  const settings = { ...DEFAULT_SETTINGS, provider: CHATGPT_PLAN, otherModels: { [CHATGPT_PLAN]: 'model-a' } };

  it('asks for a sign-in first', () => {
    const resolved = resolveProvider(settings, {});
    expect(resolved.problem).toContain('Sign in');
    expect(resolved.config).toBeNull();
  });

  it('asks for permission when the plan was declined', () => {
    expect(resolveProvider(settings, {}, { isSignedIn: true, isPlanEnabled: false }).problem).toContain('Allow');
  });

  it('is ready once signed in, with no key', () => {
    const resolved = resolveProvider(settings, {}, { isSignedIn: true, isPlanEnabled: true });
    expect(resolved).toMatchObject({ problem: null, usesChatGptPlan: true, needsKey: false });
    expect(resolved.config).toEqual({ kind: 'chatgpt-plan', apiKey: '', model: 'model-a' });
    expect(resolved.destination).toContain('OpenAI');
  });

  it('asks for consent again for another account', () => {
    const one = resolveProvider(settings, {}, { isSignedIn: true, isPlanEnabled: true, email: 'a@example.com' });
    const two = resolveProvider(settings, {}, { isSignedIn: true, isPlanEnabled: true, email: 'b@example.com' });
    expect(one.consentKey).not.toBe(two.consentKey);
  });

  it('never carries an API key to the helper', () => {
    const resolved = resolveProvider(settings, { [CHATGPT_PLAN]: 'stray', OpenAI: 'test-key' }, { isSignedIn: true, isPlanEnabled: true });
    expect(resolved.config!.apiKey).toBe('');
  });

  it('remembers that the welcome note was seen', () => {
    expect(settingsFromStorage({ ...settings, hasSeenChatGptWelcome: true }).hasSeenChatGptWelcome).toBe(true);
    expect(settingsFromStorage({ provider: CHATGPT_PLAN })).toMatchObject({ provider: CHATGPT_PLAN, hasSeenChatGptWelcome: false });
  });
});
