import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import type { ChatGptSignInRequest, ChatGptStatus } from '../../src/llm/chatgptProtocol.ts';
import { CredentialFile, type ChatGptAccount, type StoredCredentials } from './credentials.ts';

const ISSUER = 'https://auth.openai.com';
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const RESOURCE = 'https://api.openai.com/v1';
const FIRST_CLIENT_ID = 'dynamic_agent_client';
const APP_NAME = 'Living Chess Book';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const PREFERRED_PORT = 1455;
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const REFRESH_MARGIN_MS = 5 * 60_000;
const AUTH_REQUEST_TIMEOUT_MS = 30_000;
/** Codes that mean a refresh token will never work again. Others may pass. */
const DEAD_REFRESH_CODES = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);

export class ChatGptAuthError extends Error {
  override readonly name = 'ChatGptAuthError';
}

export interface AccountOptions {
  dir: string;
  fetch?: typeof globalThis.fetch;
  openBrowser?: (url: string) => void;
  now?: () => number;
  /** For tests, because the real listener port may be taken. */
  preferredPort?: number;
}

/** Opens the reader's own browser, with no shell in between to misread the address. */
function openSystemBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  execFile(command as string, args as string[], () => {});
}

const randomText = () => randomBytes(32).toString('base64url');

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  id_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  earliest_refresh_at?: unknown;
  error?: unknown;
  code?: unknown;
}

/** OpenAI documents the codes, but not one shape for them, so this accepts each usual one. */
function errorCodeOf(token: TokenResponse): string {
  const nested = token.error as { code?: unknown; type?: unknown } | null | undefined;
  for (const value of [token.code, token.error, nested?.code, nested?.type]) {
    if (typeof value === 'string') return value;
  }
  return '';
}

function timeOf(value: unknown): number | undefined {
  if (typeof value === 'number') return value * 1000;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return Date.parse(value);
  return undefined;
}

const PAGE = (title: string, text: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;max-width:32em;margin:4em auto;padding:0 1em"><h1 style="font-size:20px">${title}</h1><p>${text}</p>`;

interface Attempt {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  /** Null until the callback supplies the issued ID of a first registration. */
  clientId: string | null;
  isNewRegistration: boolean;
  expectedSubject: string | null;
  server: http.Server;
  timer: NodeJS.Timeout;
}

/** Runs the sign-in, and keeps tokens fresh. Nothing here is ever sent to the page but its status. */
export class ChatGptAccountManager {
  private readonly file: CredentialFile;
  private readonly send: typeof globalThis.fetch;
  private readonly openBrowser: (url: string) => void;
  private readonly now: () => number;
  private readonly preferredPort: number;
  private attempt: Attempt | null = null;
  /** An attempt whose code is being exchanged. A code must not be used twice. */
  private finishing: Attempt | null = null;
  private problem: string | null = null;
  /** Sign-ins start one at a time, so that two clicks cannot open two listeners. */
  private signInQueue: Promise<unknown> = Promise.resolve();
  /** Rotating refresh tokens can be spent only once, so refreshes run one at a time. */
  private refreshing: Promise<string> | null = null;
  /** Reads and writes of the file also run one at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: AccountOptions) {
    this.file = new CredentialFile(options.dir);
    this.send = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.openBrowser = options.openBrowser ?? openSystemBrowser;
    this.now = options.now ?? Date.now;
    this.preferredPort = options.preferredPort ?? PREFERRED_PORT;
  }

  private inOrder<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  private update(change: (credentials: StoredCredentials) => void): Promise<StoredCredentials> {
    return this.inOrder(async () => {
      const credentials = await this.file.read();
      change(credentials);
      await this.file.write(credentials);
      return credentials;
    });
  }

  private static active(credentials: StoredCredentials): ChatGptAccount | null {
    return credentials.accounts.find((a) => a.clientId === credentials.activeClientId) ?? null;
  }

  async status(): Promise<ChatGptStatus> {
    const account = ChatGptAccountManager.active(await this.inOrder(() => this.file.read()));
    const isSignedIn = Boolean(account?.refreshToken || account?.accessToken);
    return {
      isSignedIn,
      isPlanEnabled: isSignedIn && Boolean(account?.scopes?.includes(PLAN_SCOPE)),
      email: isSignedIn ? (account?.email ?? null) : null,
      hasSavedAccount: Boolean(account),
      isWaiting: this.attempt !== null || this.finishing !== null,
      problem: this.problem,
    };
  }

  private listen(handler: http.RequestListener): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(handler);
      const useAnyPort = () => {
        server.removeAllListeners('error');
        server.once('error', reject);
        // OpenAI allows the port, and only the port, to differ.
        server.listen(0, '127.0.0.1', () => resolve(server));
      };
      server.once('error', useAnyPort);
      server.listen(this.preferredPort, '127.0.0.1', () => resolve(server));
    });
  }

  private endAttempt(attempt: Attempt): void {
    clearTimeout(attempt.timer);
    attempt.server.close();
    attempt.server.closeAllConnections();
    if (this.attempt === attempt) this.attempt = null;
  }

  cancelSignIn(): void {
    // An exchange under way finds that it is no longer wanted, and keeps nothing.
    this.finishing = null;
    if (this.attempt) this.endAttempt(this.attempt);
  }

  close(): void {
    this.cancelSignIn();
  }

  /** Starts a sign-in in the reader's browser. The result shows up in `status`. */
  signIn(request: ChatGptSignInRequest = {}): Promise<void> {
    const next = this.signInQueue.then(() => this.startSignIn(request));
    this.signInQueue = next.catch(() => {});
    return next;
  }

  private async startSignIn(request: ChatGptSignInRequest): Promise<void> {
    this.cancelSignIn();
    this.problem = null;

    const credentials = await this.inOrder(() => this.file.read());
    const account = request.newAccount ? null : ChatGptAccountManager.active(credentials);
    // OpenAI asks that an issued ID be retained after a failed exchange.
    const pending = !account && !request.newAccount ? (credentials.pendingClientId ?? null) : null;
    const verifier = randomText();
    const server = await this.listen((req, res) => void this.onCallback(req, res));
    const { port } = server.address() as AddressInfo;
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;

    const attempt: Attempt = {
      state: randomText(),
      nonce: randomText(),
      verifier,
      redirectUri,
      clientId: account?.clientId ?? pending,
      isNewRegistration: !account && !pending,
      expectedSubject: account?.subject ?? null,
      server,
      timer: setTimeout(() => {
        this.problem = 'The sign-in took too long. Please try again.';
        this.endAttempt(attempt);
      }, SIGN_IN_TIMEOUT_MS),
    };
    attempt.timer.unref();
    this.attempt = attempt;

    const query = new URLSearchParams({
      client_id: account?.clientId ?? pending ?? FIRST_CLIENT_ID,
      ext_agent_host_id: credentials.hostId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      resource: RESOURCE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    });
    if (!account && !pending) query.set('agent_name_hint', APP_NAME);
    if (account?.idToken) query.set('id_token_hint', account.idToken);
    if (account?.email) query.set('login_hint', account.email);
    if (request.enablePlan) query.set('prompt', 'consent');
    this.openBrowser(`${AUTHORIZE_URL}?${query.toString()}`);
  }

  private async onCallback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const attempt = this.attempt;
    const reply = (status: number, title: string, text: string) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(PAGE(title, text));
    };
    // Anything but the answer to this attempt is ignored, and leaves the attempt waiting.
    if (url.pathname !== '/auth/callback' || !attempt || url.searchParams.get('state') !== attempt.state) {
      reply(400, 'Sign-in not recognized · Giriş tanınmadı', 'Please go back to Living Chess Book and try again. Lütfen Living Chess Book\'a dönüp yeniden deneyin.');
      return;
    }

    // Used up from here on, so that reloading this page cannot spend the code twice.
    this.attempt = null;
    this.finishing = attempt;

    try {
      const error = url.searchParams.get('error');
      if (error === 'access_denied') throw new ChatGptAuthError('The sign-in was declined, so your ChatGPT plan was not connected.');
      if (error) throw new ChatGptAuthError('OpenAI could not complete the sign-in. Please try again.');
      const code = url.searchParams.get('code');
      if (!code) throw new ChatGptAuthError('OpenAI sent no sign-in code. Please try again.');

      const issued = url.searchParams.get('client_id');
      if (attempt.isNewRegistration) {
        if (!issued || issued === FIRST_CLIENT_ID) throw new ChatGptAuthError('The registration was not completed. Please try again.');
        attempt.clientId = issued;
        await this.update((credentials) => {
          credentials.pendingClientId = issued;
        });
      } else if (issued && issued !== attempt.clientId) {
        throw new ChatGptAuthError('OpenAI returned a different app registration, so it was not used.');
      }

      await this.finishSignIn(attempt, code);
      reply(200, 'You are signed in · Giriş yapıldı', 'You can close this window and go back to Living Chess Book. Bu pencereyi kapatıp Living Chess Book\'a dönebilirsiniz.');
    } catch (cause) {
      if (this.finishing === attempt) {
        this.problem = cause instanceof ChatGptAuthError ? cause.message : 'The sign-in could not be completed. Please try again.';
      }
      reply(400, 'Sign-in did not finish · Giriş tamamlanmadı', 'Please go back to Living Chess Book and try again. Lütfen Living Chess Book\'a dönüp yeniden deneyin.');
    } finally {
      if (this.finishing === attempt) this.finishing = null;
      this.endAttempt(attempt);
    }
  }

  private async postToken(body: Record<string, string>): Promise<{ status: number; token: TokenResponse }> {
    const response = await this.send(TOKEN_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    return { status: response.status, token: ((await response.json().catch(() => ({}))) ?? {}) as TokenResponse };
  }

  private async verifyIdToken(idToken: string, clientId: string, nonce: string): Promise<{ subject: string; email: string | null }> {
    const response = await this.send(JWKS_URL, { redirect: 'error', signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new ChatGptAuthError('OpenAI\'s signing keys could not be fetched. Please try again.');
    const keys = createLocalJWKSet((await response.json()) as JSONWebKeySet);
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: ISSUER,
        audience: clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub', 'nonce'],
        currentDate: new Date(this.now()),
      });
      if (payload.nonce !== nonce || !payload.sub) throw new Error('Mismatch');
      return { subject: payload.sub, email: typeof payload['email'] === 'string' ? payload['email'] : null };
    } catch {
      throw new ChatGptAuthError('OpenAI\'s reply could not be verified, so it was not used.');
    }
  }

  private async finishSignIn(attempt: Attempt, code: string): Promise<void> {
    const clientId = attempt.clientId!;
    const { status, token } = await this.postToken({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: attempt.verifier,
      redirect_uri: attempt.redirectUri,
      resource: RESOURCE,
    });
    if (status !== 200 || typeof token.id_token !== 'string' || typeof token.access_token !== 'string') {
      throw new ChatGptAuthError('OpenAI did not accept the sign-in. Please try again.');
    }

    const identity = await this.verifyIdToken(token.id_token, clientId, attempt.nonce);
    if (attempt.expectedSubject && identity.subject !== attempt.expectedSubject) {
      throw new ChatGptAuthError('That is a different ChatGPT account. Choose "Use another account" to add it.');
    }

    const account = this.accountFromToken(token, { clientId, ...identity });
    await this.update((credentials) => {
      // Cancelled or signed out meanwhile, so the reader no longer wants this.
      if (this.finishing !== attempt) return;
      credentials.accounts = [...credentials.accounts.filter((a) => a.clientId !== clientId), account];
      credentials.activeClientId = clientId;
      delete credentials.pendingClientId;
    });
    if (this.finishing !== attempt && account.refreshToken) await this.revoke(account.refreshToken, clientId);
  }

  private accountFromToken(token: TokenResponse, base: Pick<ChatGptAccount, 'clientId' | 'subject' | 'email'> & Partial<ChatGptAccount>): ChatGptAccount {
    const account: ChatGptAccount = { ...base };
    if (typeof token.id_token === 'string') account.idToken = token.id_token;
    if (typeof token.access_token === 'string') account.accessToken = token.access_token;
    if (typeof token.refresh_token === 'string') account.refreshToken = token.refresh_token;
    if (typeof token.scope === 'string') account.scopes = token.scope.split(' ').filter(Boolean);
    const lifetime = typeof token.expires_in === 'number' ? token.expires_in : 3600;
    account.expiresAt = this.now() + lifetime * 1000;
    const earliest = timeOf(token.earliest_refresh_at);
    if (earliest === undefined) delete account.earliestRefreshAt;
    else account.earliestRefreshAt = earliest;
    return account;
  }

  /** An access token that is good for now, refreshed if it is close to running out. */
  async accessToken(): Promise<string> {
    if (this.refreshing) return this.refreshing;
    const account = ChatGptAccountManager.active(await this.inOrder(() => this.file.read()));
    if (!account?.accessToken || !account.scopes?.includes(PLAN_SCOPE)) throw new ChatGptAuthError('Please sign in with ChatGPT in Settings.');
    if (this.refreshing) return this.refreshing;

    const now = this.now();
    const expiresAt = account.expiresAt ?? 0;
    const isTooEarly = account.earliestRefreshAt !== undefined && now < account.earliestRefreshAt && now < expiresAt;
    if (now < expiresAt - REFRESH_MARGIN_MS || isTooEarly) return account.accessToken;
    return this.refresh(account);
  }

  /** Called when OpenAI turns down a token that looked fine. */
  async refreshAfterRejection(rejected: string): Promise<string> {
    if (this.refreshing) return this.refreshing;
    const account = ChatGptAccountManager.active(await this.inOrder(() => this.file.read()));
    if (!account) throw new ChatGptAuthError('Please sign in with ChatGPT in Settings.');
    // Another request already replaced it.
    if (account.accessToken && account.accessToken !== rejected) return account.accessToken;
    return this.refresh(account);
  }

  private refresh(account: ChatGptAccount): Promise<string> {
    this.refreshing ??= this.runRefresh(account).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(account: ChatGptAccount): Promise<string> {
    if (!account.refreshToken) throw new ChatGptAuthError('Please sign in with ChatGPT again.');
    const { status, token } = await this.postToken({
      grant_type: 'refresh_token',
      client_id: account.clientId,
      refresh_token: account.refreshToken,
      resource: RESOURCE,
    });

    if (status === 200 && typeof token.access_token === 'string') {
      const next = this.accountFromToken(token, account);
      let isStillWanted = false;
      await this.update((credentials) => {
        // Signed out or signed in afresh meanwhile: what is stored now is what the reader wants.
        const current = credentials.accounts.find((a) => a.clientId === account.clientId);
        if (current?.refreshToken !== account.refreshToken) return;
        isStillWanted = true;
        credentials.accounts = credentials.accounts.map((a) => (a.clientId === account.clientId ? next : a));
      });
      if (!isStillWanted) {
        if (next.refreshToken) await this.revoke(next.refreshToken, account.clientId);
        throw new ChatGptAuthError('Please sign in with ChatGPT in Settings.');
      }
      if (!next.scopes?.includes(PLAN_SCOPE)) throw new ChatGptAuthError('This app no longer has permission to use your ChatGPT plan. Please allow it in Settings.');
      return token.access_token;
    }

    const code = errorCodeOf(token);
    if (DEAD_REFRESH_CODES.has(code)) {
      await this.update((credentials) => {
        credentials.accounts = credentials.accounts.map((a) =>
          a.clientId === account.clientId && a.refreshToken === account.refreshToken ? ChatGptAccountManager.withoutTokens(a) : a,
        );
      });
      this.problem = 'Your ChatGPT sign-in has ended. Please sign in again.';
      throw new ChatGptAuthError('Your ChatGPT sign-in has ended. Please sign in again in Settings.');
    }
    if (code === 'invalid_client') {
      this.problem = 'OpenAI no longer accepts this app\'s registration. Please choose "Use another account" to register it again.';
      throw new ChatGptAuthError(this.problem);
    }
    // A passing failure must not cost a reader their sign-in.
    throw new Error('The ChatGPT sign-in could not be renewed just now. Please try again soon.');
  }

  private static withoutTokens(account: ChatGptAccount): ChatGptAccount {
    return { subject: account.subject, email: account.email, clientId: account.clientId };
  }

  private async revoke(refreshToken: string, clientId: string): Promise<boolean> {
    try {
      const response = await this.send(REVOKE_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }).toString(),
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Signs out of every account this helper holds, since the app shows only one. Tokens go from
   * here first, so that a slow reply from OpenAI cannot leave them usable. The registrations
   * stay, so that signing back in does not register the app again.
   */
  async signOut(): Promise<{ isRevoked: boolean }> {
    this.cancelSignIn();
    this.problem = null;
    const toRevoke: { refreshToken: string; clientId: string }[] = [];
    await this.update((credentials) => {
      credentials.accounts = credentials.accounts.map((account) => {
        if (account.refreshToken) toRevoke.push({ refreshToken: account.refreshToken, clientId: account.clientId });
        return ChatGptAccountManager.withoutTokens(account);
      });
    });
    const results = await Promise.all(toRevoke.map(({ refreshToken, clientId }) => this.revoke(refreshToken, clientId)));
    const isRevoked = results.every(Boolean);
    if (!isRevoked) this.problem = 'You are signed out here, but OpenAI did not confirm it. You can disconnect this app in ChatGPT settings.';
    return { isRevoked };
  }
}
