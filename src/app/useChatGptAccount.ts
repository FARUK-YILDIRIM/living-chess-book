import { useCallback, useEffect, useRef, useState } from 'react';
import { CHATGPT_API, CHATGPT_HEADER, type ChatGptModel, type ChatGptSignInRequest, type ChatGptStatus } from '../llm/chatgptProtocol';
import { IS_EXTENSION } from './platform';

const WAITING_POLL_MS = 1500;
const SIGNED_OUT: ChatGptStatus = { isSignedIn: false, isPlanEnabled: false, email: null, hasSavedAccount: false, isWaiting: false, problem: null };

export interface ChatGptControl {
  status: ChatGptStatus;
  /** False where the local helper is not running, such as a plain static build. */
  isAvailable: boolean;
  models: ChatGptModel[];
  modelProblem: string | null;
  signIn: (request?: ChatGptSignInRequest) => void;
  cancelSignIn: () => void;
  signOut: () => void;
  /** Asks the helper again, for when a request found the sign-in has ended. */
  refresh: () => void;
}

async function call<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CHATGPT_API}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { [CHATGPT_HEADER]: '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const reply = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(reply.error?.message ?? 'The local sign-in helper hit a problem.');
  return reply;
}

/** Follows the ChatGPT sign-in held by the local helper. */
export function useChatGptAccount(): ChatGptControl {
  const [status, setStatus] = useState(SIGNED_OUT);
  const [isAvailable, setIsAvailable] = useState(false);
  const [models, setModels] = useState<ChatGptModel[]>([]);
  const [modelProblem, setModelProblem] = useState<string | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    // There is no helper to ask, and its address would only be another page of the extension.
    if (IS_EXTENSION) return;
    try {
      const next = await call<ChatGptStatus>('/status');
      if (!isMounted.current) return;
      setStatus(next);
      setIsAvailable(true);
    } catch {
      if (!isMounted.current) return;
      setIsAvailable(false);
      setStatus(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void refresh();
    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!status.isWaiting) return;
    const timer = setInterval(() => void refresh(), WAITING_POLL_MS);
    return () => clearInterval(timer);
  }, [status.isWaiting, refresh]);

  useEffect(() => {
    if (!status.isSignedIn || !status.isPlanEnabled) {
      setModels([]);
      setModelProblem(null);
      return;
    }
    let isCurrent = true;
    call<{ models: ChatGptModel[] }>('/models').then(
      ({ models: listed }) => {
        if (!isCurrent) return;
        setModels(listed);
        setModelProblem(listed.length ? null : 'This account has no models to choose from.');
      },
      (cause: unknown) => {
        if (isCurrent) setModelProblem(cause instanceof Error ? cause.message : 'The models could not be listed.');
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [status.isSignedIn, status.isPlanEnabled, status.email]);

  const run = useCallback(async (route: string, body: unknown) => {
    try {
      setStatus(await call<ChatGptStatus>(route, body));
    } catch (cause) {
      setStatus((current) => ({ ...current, problem: cause instanceof Error ? cause.message : 'That did not work. Please try again.' }));
    }
  }, []);

  const signIn = useCallback((request: ChatGptSignInRequest = {}) => void run('/sign-in', request), [run]);
  const cancelSignIn = useCallback(() => void run('/cancel-sign-in', {}), [run]);
  const signOut = useCallback(() => void run('/sign-out', {}), [run]);

  const refreshNow = useCallback(() => void refresh(), [refresh]);

  return { status, isAvailable, models, modelProblem, signIn, cancelSignIn, signOut, refresh: refreshNow };
}
