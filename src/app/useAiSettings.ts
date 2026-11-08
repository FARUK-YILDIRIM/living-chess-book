import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHATGPT_PLAN, CUSTOM, DEFAULT_SETTINGS, resolveProvider, settingsFromStorage, type AiSettings, type ResolvedProvider } from '../llm/settings';
import { IS_EXTENSION } from './platform';
import { useChatGptAccount, type ChatGptControl } from './useChatGptAccount';
import { forgetApiKeys, loadAiSettings, loadApiKeys, saveAiSettings, saveApiKeys } from './store';

const SAVE_FAILED = 'This could not be saved. It will work until you close the app.';
const FORGET_FAILED = 'Your saved keys could not be removed from this computer. Please try again.';
const READ_FAILED = 'Your saved settings could not be read. Changes here will last until you close the app.';

export interface AiSettingsControl {
  settings: AiSettings;
  /** One key per provider, so that a key never goes to a provider it was not typed for. */
  keys: Readonly<Record<string, string>>;
  resolved: ResolvedProvider;
  chatGpt: ChatGptControl;
  isLoaded: boolean;
  saveProblem: string | null;
  change: (patch: Partial<AiSettings>) => void;
  setKey: (provider: string, value: string) => void;
  setCustomUrl: (url: string) => void;
  setRememberKeys: (remember: boolean) => void;
  forgetKeys: () => void;
}

interface Current {
  settings: AiSettings;
  keys: Record<string, string>;
}

/** Holds AI settings for the whole app. Keys stay in memory unless the reader asks otherwise. */
export function useAiSettings(): AiSettingsControl {
  const [current, setCurrent] = useState<Current>({ settings: DEFAULT_SETTINGS, keys: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  const latest = useRef(current);
  /** After a failed read, saving would replace what is stored with defaults. */
  const canSave = useRef(false);
  /** Saves run one at a time, so that an older one can never land after a newer one. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: Current) => {
    latest.current = next;
    setCurrent(next);
  }, []);

  const enqueue = useCallback((save: () => Promise<void>, failure = SAVE_FAILED) => {
    if (!canSave.current) return;
    queue.current = queue.current.then(save).then(
      () => setSaveProblem(null),
      () => setSaveProblem(failure),
    );
  }, []);

  /** The address goes in with the keys, so that the "Other" key can never meet a different one. */
  const saveKeys = useCallback(() => {
    const { settings, keys } = latest.current;
    if (settings.rememberKeys) enqueue(() => saveApiKeys(keys, settings.customUrl));
  }, [enqueue]);

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      try {
        const settings = settingsFromStorage(await loadAiSettings());
        const keys = settings.rememberKeys ? await loadApiKeys(settings.customUrl) : {};
        if (!isCurrent) return;
        canSave.current = true;
        apply({ settings, keys });
        // Nothing should stay on disk if the box is off, whatever happened last time.
        if (!settings.rememberKeys) enqueue(forgetApiKeys, FORGET_FAILED);
      } catch {
        if (isCurrent) setSaveProblem(READ_FAILED);
      }
      if (isCurrent) setIsLoaded(true);
    })();
    return () => {
      isCurrent = false;
    };
  }, [apply, enqueue]);

  const change = useCallback(
    (patch: Partial<AiSettings>) => {
      const settings = { ...latest.current.settings, ...patch };
      apply({ ...latest.current, settings });
      enqueue(() => saveAiSettings(settings));
    },
    [apply, enqueue],
  );

  const setKey = useCallback(
    (provider: string, value: string) => {
      apply({ ...latest.current, keys: { ...latest.current.keys, [provider]: value } });
      saveKeys();
    },
    [apply, saveKeys],
  );

  const setCustomUrl = useCallback(
    (url: string) => {
      if (url === latest.current.settings.customUrl) return;
      // A key typed for one address must not go to another.
      const { [CUSTOM]: _dropped, ...keys } = latest.current.keys;
      const settings = { ...latest.current.settings, customUrl: url };
      apply({ settings, keys });
      enqueue(() => saveAiSettings(settings));
      saveKeys();
    },
    [apply, enqueue, saveKeys],
  );

  const setRememberKeys = useCallback(
    (remember: boolean) => {
      change({ rememberKeys: remember });
      if (remember) saveKeys();
      else enqueue(forgetApiKeys, FORGET_FAILED);
    },
    [change, enqueue, saveKeys],
  );

  const forgetKeys = useCallback(() => {
    apply({ settings: { ...latest.current.settings, rememberKeys: false }, keys: {} });
    const { settings } = latest.current;
    enqueue(() => saveAiSettings(settings));
    enqueue(forgetApiKeys, FORGET_FAILED);
  }, [apply, enqueue]);

  const chatGpt = useChatGptAccount();
  const { isSignedIn, isPlanEnabled, email } = chatGpt.status;
  // The extension has no helper for a ChatGPT plan, so a choice of it falls back to the default.
  const settings = useMemo(
    () => (IS_EXTENSION && current.settings.provider === CHATGPT_PLAN ? { ...current.settings, provider: DEFAULT_SETTINGS.provider } : current.settings),
    [current.settings],
  );
  const resolved = useMemo(
    () => resolveProvider(settings, current.keys, { isSignedIn, isPlanEnabled, email }),
    [settings, current.keys, isSignedIn, isPlanEnabled, email],
  );

  return { settings, keys: current.keys, resolved, chatGpt, isLoaded, saveProblem, change, setKey, setCustomUrl, setRememberKeys, forgetKeys };
}
