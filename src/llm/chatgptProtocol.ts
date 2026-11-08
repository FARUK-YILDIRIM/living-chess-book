/** What the page and the local helper say to each other. No token ever appears here. */
export const CHATGPT_API = '/local-api/chatgpt';
/** A page on another site cannot send this header to the helper without its permission. */
export const CHATGPT_HEADER = 'x-living-chess-book';
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';

export interface ChatGptStatus {
  isSignedIn: boolean;
  isPlanEnabled: boolean;
  email: string | null;
  /** An account was connected here before, so signing in again will not register the app anew. */
  hasSavedAccount: boolean;
  /** True while a sign-in is waiting for the browser. */
  isWaiting: boolean;
  /** Why the last sign-in or refresh failed. */
  problem: string | null;
}

export interface ChatGptModel {
  slug: string;
  name: string;
}

export interface ChatGptSignInRequest {
  /** Register a different account, rather than signing back in to the saved one. */
  newAccount?: boolean;
  /** Ask again for permission to use the plan, after it was declined. */
  enablePlan?: boolean;
}

export interface ChatGptReadRequest {
  model: string;
  system: string;
  prompt: string;
  images: readonly string[];
  /** An answer in the model's own words, and not the moves of a line. */
  freeText?: boolean;
}

export type ChatGptErrorKind = 'auth' | 'plan-limit' | 'rate-limit' | 'refused' | 'too-long' | 'other';

export type ChatGptUsage = { input: number; output: number } | null;

export type ChatGptReadReply =
  | { text: string; usage: ChatGptUsage }
  | { error: { kind: ChatGptErrorKind; message: string; usage: ChatGptUsage } };
