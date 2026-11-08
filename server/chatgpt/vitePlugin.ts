import type { Plugin } from 'vite';
import { defaultCredentialDir } from './credentials.ts';
import { createChatGptHelper } from './helper.ts';

/** Runs the local helper inside `npm run dev`, on the same address as the app. See ADR-0012. */
export function chatGptHelperPlugin(): Plugin {
  return {
    name: 'living-chess-book-chatgpt-helper',
    configureServer(server) {
      const helper = createChatGptHelper({ dir: defaultCredentialDir() });
      server.middlewares.use((req, res, next) => void helper(req, res, next));
      server.httpServer?.once('close', helper.close);
    },
  };
}
