import { useEffect, useRef } from 'react';
import { ANTHROPIC_MODELS, OPENAI_COMPATIBLE_PRESETS } from '../llm/providers';
import { ANTHROPIC, CHATGPT_PLAN, CUSTOM, PROVIDERS } from '../llm/settings';
import { ChatGptSection } from './ChatGptSection';
import { LANGUAGES, type Language } from './i18n';
import { useI18n } from './I18nContext';
import type { AiSettingsControl } from './useAiSettings';
import { version as APP_VERSION } from '../../package.json';
import { IS_EXTENSION, SOURCE_URL } from './platform';

export function SettingsDialog({ ai, onClose }: { ai: AiSettingsControl; onClose: () => void }) {
  const { language, setLanguage, t, tm } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const { settings, keys, resolved, saveProblem, change, setKey, setCustomUrl, setRememberKeys, forgetKeys } = ai;
  const { provider } = settings;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const urlProblem = provider === CUSTOM && settings.customUrl ? resolved.problem : null;
  const isChatGpt = provider === CHATGPT_PLAN;
  const preset = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === provider);

  return (
    <dialog ref={dialog} className="settings" aria-labelledby="settings-title" onClose={onClose}>
      <form method="dialog">
        <h2 id="settings-title">{t('Settings')}</h2>

        <label className="field">
          {t('Language')}
          <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
            {LANGUAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <section>
          <h3>{t('AI')}</h3>
          <p className="hint">{t('Optional. With your own account, a model can answer as your coach and read again the lines this app could not settle.')}</p>
        </section>

        <label className="field">
          {t('Provider')}
          <select value={provider} onChange={(event) => change({ provider: event.target.value })}>
            {PROVIDERS.filter((name) => !(IS_EXTENSION && name === CHATGPT_PLAN)).map((name) => (
              <option key={name} value={name}>
                {tm(name)}
              </option>
            ))}
          </select>
        </label>

        {provider === CUSTOM && (
          <label className="field">
            {t('Address of an OpenAI-compatible API')}
            <input
              value={settings.customUrl}
              placeholder="https://example.com/v1"
              spellCheck={false}
              aria-invalid={Boolean(urlProblem)}
              onChange={(event) => setCustomUrl(event.target.value.trim())}
            />
          </label>
        )}

        {isChatGpt && <ChatGptSection ai={ai} />}

        {isChatGpt ? null : provider === ANTHROPIC ? (
          <label className="field">
            {t('Model')}
            <select value={settings.anthropicModel} onChange={(event) => change({ anthropicModel: event.target.value })}>
              {ANTHROPIC_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            {t('Model. AI reading needs one that can read images.')}
            <input
              value={settings.otherModels[provider] ?? ''}
              placeholder={preset?.defaultModel}
              list={preset?.models ? 'known-models' : undefined}
              spellCheck={false}
              onChange={(event) => change({ otherModels: { ...settings.otherModels, [provider]: event.target.value } })}
            />
            {preset?.models && (
              <datalist id="known-models">
                {preset.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
          </label>
        )}

        {!isChatGpt && (
          <>
        <label className="field">
          {resolved.needsKey ? t('{provider} API key', { provider: tm(provider) }) : t('{provider} API key, if this server needs one', { provider: tm(provider) })}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keys[provider] ?? ''}
            onChange={(event) => setKey(provider, event.target.value)}
          />
        </label>

        <label className="remember">
          <input type="checkbox" checked={settings.rememberKeys} onChange={(event) => setRememberKeys(event.target.checked)} />
          <span>
            {t('Remember my keys on this computer. If you leave this off, they last until you close the app. They are saved encrypted, but someone with access to your computer account could still recover them, so do not use this on a shared computer.')}
          </span>
        </label>
          </>
        )}

        {resolved.problem ? (
          <p className="hint">{t('Still needed: {problem}', { problem: tm(resolved.problem) })}</p>
        ) : (
          <p className="hint">{t('Ready. You will still agree to what is sent, in the book.')}</p>
        )}
        {saveProblem && (
          <p className="error" role="alert">
            {tm(saveProblem)}
          </p>
        )}

        <div className="settings-actions">
          {isChatGpt ? (
            <span />
          ) : (
            <button type="button" className="quiet" onClick={forgetKeys}>
              {t('Forget all keys')}
            </button>
          )}
          <button type="submit">{t('Done')}</button>
        </div>

        <p className="about">
          {t('Living Chess Book {version} is free software under the GPL-3.0-or-later licence.', { version: APP_VERSION })}{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t('Source code')}
          </a>
        </p>
      </form>
    </dialog>
  );
}
