import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** One registered ChatGPT account. Tokens are absent while signed out. */
export interface ChatGptAccount {
  subject: string;
  email: string | null;
  clientId: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  /** Milliseconds since 1970. */
  expiresAt?: number;
  earliestRefreshAt?: number;
}

export interface StoredCredentials {
  /** Identifies this computer to OpenAI. It holds nothing about the reader. */
  hostId: string;
  accounts: ChatGptAccount[];
  activeClientId: string | null;
  /** An ID OpenAI issued whose sign-in has not finished. OpenAI asks that it be reused. */
  pendingClientId?: string;
}

export function defaultCredentialDir(): string {
  // Kept from the working name, as it holds this computer's id with OpenAI. See ADR-0020.
  return path.join(os.homedir(), '.config', 'chess-coach');
}

function isCredentials(value: unknown): value is StoredCredentials {
  const record = value as Partial<StoredCredentials> | null;
  return typeof record === 'object' && record !== null && typeof record.hostId === 'string' && Array.isArray(record.accounts);
}

/** Keeps credentials in one file only this user can read, written all at once. */
export class CredentialFile {
  private readonly file: string;
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    this.file = path.join(dir, 'chatgpt-credentials.json');
  }

  /** A file or folder made with looser permissions, by anything, is tightened on sight. */
  private async tighten(): Promise<void> {
    await chmod(this.dir, 0o700);
    await chmod(this.file, 0o600);
  }

  async read(): Promise<StoredCredentials> {
    let text: string | null = null;
    try {
      text = await readFile(this.file, 'utf8');
      await this.tighten();
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
    if (text !== null) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (isCredentials(parsed)) return parsed;
      } catch {
        // Handled just below, along with a file of the wrong shape.
      }
      // Set aside rather than overwritten, because it can still hold a usable sign-in.
      await rename(this.file, `${this.file}.damaged-${randomUUID()}`);
    }
    // Chosen once and kept, because OpenAI expects the same value for the same computer.
    const fresh: StoredCredentials = { hostId: `urn:uuid:${randomUUID()}`, accounts: [], activeClientId: null };
    await this.write(fresh);
    return fresh;
  }

  async write(credentials: StoredCredentials): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await chmod(this.dir, 0o700);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'w', 0o600);
      try {
        await handle.writeFile(JSON.stringify(credentials));
        await handle.chmod(0o600);
        // A rotating refresh token can be spent only once, so it must not be lost in a crash.
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.file);
    } catch (cause) {
      await rm(temporary, { force: true });
      throw cause;
    }
  }
}
