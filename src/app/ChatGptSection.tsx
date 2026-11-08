import { useEffect } from 'react';
import { CHATGPT_USAGE_URL } from '../llm/chatgptProtocol';
import { CHATGPT_PLAN } from '../llm/settings';
import { useI18n } from './I18nContext';
import type { AiSettingsControl } from './useAiSettings';

/** Connects a ChatGPT plan. The wording follows OpenAI's guidelines for this kind of sign-in. */
export function ChatGptSection({ ai }: { ai: AiSettingsControl }) {
  const { t, tm } = useI18n();
  const { settings, change, chatGpt } = ai;
  const { status, isAvailable, models, modelProblem, signIn, cancelSignIn, signOut, refresh } = chatGpt;
  const selected = settings.otherModels[CHATGPT_PLAN] ?? '';
  const isReady = status.isSignedIn && status.isPlanEnabled;

  // A sign-in can end at any time, and this is where a reader comes to check.
  useEffect(refresh, [refresh]);

  // A saved model the account no longer offers would only fail later.
  useEffect(() => {
    if (!isReady || !models.length || models.some((model) => model.slug === selected)) return;
    change({ otherModels: { ...settings.otherModels, [CHATGPT_PLAN]: models[0]!.slug } });
  }, [isReady, models, selected, settings.otherModels, change]);

  if (!isAvailable) {
    return (
      <div className="chatgpt-card">
        <p>
          <strong>{t('Use your ChatGPT plan')}</strong>
        </p>
        <p className="hint">{t("This needs the app's local helper, which runs when the app is started with npm run dev.")}</p>
      </div>
    );
  }

  return (
    <>
      {isReady && !settings.hasSeenChatGptWelcome && (
        <div className="chatgpt-welcome" role="status">
          <p>
            <strong>{t("You're using your ChatGPT plan")}</strong>
          </p>
          <p>{t('AI reading in this app will use your ChatGPT plan. You can manage usage in ChatGPT settings.')}</p>
          <div className="chatgpt-actions">
            <button type="button" onClick={() => change({ hasSeenChatGptWelcome: true })}>
              {t('Got it')}
            </button>
          </div>
        </div>
      )}

      <div className="chatgpt-card">
        <p>
          <strong>{t('Use your ChatGPT plan')}</strong>
        </p>

        {!status.isSignedIn && (
          <>
            <p className="hint">{t('Complete AI reading with the usage included in your ChatGPT Plus or Pro plan, with no API key.')}</p>
            <div className="chatgpt-actions">
              <button type="button" className="continue-chatgpt" disabled={status.isWaiting} onClick={() => signIn()}>
                Continue with ChatGPT
              </button>
              {status.hasSavedAccount && (
                <button type="button" className="quiet" disabled={status.isWaiting} onClick={() => signIn({ newAccount: true })}>
                  {t('Use another account')}
                </button>
              )}
            </div>
          </>
        )}

        {status.isSignedIn && (
          <>
            <p className="hint">{status.email ? t('Connected as {email}.', { email: status.email }) : t('Connected.')}</p>
            {!status.isPlanEnabled && (
              <>
                <p className="hint">{t('This app does not have permission to use your plan yet.')}</p>
                <div className="chatgpt-actions">
                  <button type="button" disabled={status.isWaiting} onClick={() => signIn({ enablePlan: true })}>
                    {t('Allow plan use')}
                  </button>
                </div>
              </>
            )}

            {isReady && (
              <label className="field">
                {t('Model, which must be able to read images')}
                <select
                  value={selected}
                  disabled={!models.length}
                  onChange={(event) => change({ otherModels: { ...settings.otherModels, [CHATGPT_PLAN]: event.target.value } })}
                >
                  {models.map((model) => (
                    <option key={model.slug} value={model.slug}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modelProblem && <p className="fix-problem">{tm(modelProblem)}</p>}

            <div className="chatgpt-actions">
              <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">
                {t('Manage usage')}
              </a>
              <button type="button" className="quiet" disabled={status.isWaiting} onClick={() => signIn({ newAccount: true })}>
                {t('Use another account')}
              </button>
              <button type="button" className="quiet" onClick={signOut}>
                {t('Sign out')}
              </button>
            </div>
          </>
        )}

        {status.isWaiting && (
          <div className="chatgpt-actions">
            <p className="hint">{t('Finish signing in in your browser, then come back here.')}</p>
            <button type="button" className="quiet" onClick={cancelSignIn}>
              {t('Cancel')}
            </button>
          </div>
        )}

        {status.problem && (
          <p className="fix-problem" role="alert">
            {tm(status.problem)}
          </p>
        )}
      </div>
    </>
  );
}
