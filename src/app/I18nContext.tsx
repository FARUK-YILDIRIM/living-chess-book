import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pickLanguage, translate, translateMessage, type Language, type MessageKey, type MessageParams } from './i18n';

const STORAGE_KEY = 'chess-coach.language';

/** A remembered convenience only, so a browser that refuses storage changes nothing else. */
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice then lasts only until the app closes.
  }
}

export function removeSetting(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing could have been kept there either.
  }
}

interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** For a message that came from a provider, the local helper or an error. */
  tm: (message: string) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => pickLanguage(readSetting(STORAGE_KEY), navigator.language));

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeSetting(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
      tm: (message) => translateMessage(language, message),
    }),
    [language, setLanguage],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n needs an I18nProvider');
  return value;
}
