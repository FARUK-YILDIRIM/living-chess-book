import { useEffect, useMemo, useRef, useState } from 'react';
import { findRepairJobs, type FoundJobs, type RepairJob, type RepairScope } from '../core/repair';
import type { BookOverlay, Word } from '../core/types';
import { estimateJobs, estimateMinutes, PARALLEL_REQUESTS, priceOf } from '../llm/estimate';
import { createReader } from '../llm/providers';
import { runRepairs, type RepairTally } from '../llm/runRepairs';
import { CHATGPT_USAGE_URL } from '../llm/chatgptProtocol';
import { askBrowserConsent, clearConsentProblem, dataFor, DECLINED, hasBrowserConsent, readWhileAllowed, WITHDRAWN } from './browserConsent';
import { useI18n } from './I18nContext';
import type { ResolvedProvider } from '../llm/settings';


interface Props {
  isVisible: boolean;
  /** Changes when the book is analyzed afresh. */
  analysisRun: number;
  overlay: BookOverlay;
  getWords: (signal: AbortSignal) => Promise<Word[][]>;
  renderJob: (job: RepairJob) => Promise<string[]>;
  onOverlay: (overlay: BookOverlay) => void;
  beginRequest: () => AbortController;
  isBusy: boolean;
  provider: ResolvedProvider;
  onSettings: () => void;
  /** A run can find that a sign-in has ended, so Settings must hear about it. */
  onRunEnded: () => void;
  /** Set when the reader chose AI reading as they added the book. A new id sets every line again. */
  chosenAtStart?: number | null;
}

/** Runs AI reading. The provider and key are chosen in Settings. */
export function AiPanel({ isVisible, analysisRun, overlay, getWords, renderJob, onOverlay, beginRequest, isBusy, provider, onSettings, onRunEnded, chosenAtStart = null }: Props) {
  const { t, tm, language } = useI18n();
  const dollars = (amount: number) => (amount < 0.01 ? t('under $0.01') : `$${amount.toFixed(2)}`);
  const [scope, setScope] = useState<RepairScope>('flagged');
  /** What the reader agreed to send, and where. Any change to either needs a new tick. */
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [found, setFound] = useState<FoundJobs | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tally, setTally] = useState<RepairTally | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  /** Prices are for the model that ran, whatever Settings says by now. */
  const [runModel, setRunModel] = useState('');

  const run = useRef<AbortController | null>(null);
  const runConfig = useRef<string | null>(null);
  /** Stretches a model has already failed to improve in this session are not paid for twice. */
  const attempted = useRef(new Set<string>());
  /** Applying a result changes the overlay, and the list of jobs must not restart because of it. */
  const latest = useRef(overlay);
  latest.current = overlay;

  useEffect(() => {
    attempted.current.clear();
  }, [analysisRun]);

  // Whoever chose it for the whole book wants every line read, and not only the doubtful ones.
  useEffect(() => {
    if (chosenAtStart !== null) setScope('all');
  }, [chosenAtStart]);

  useEffect(() => {
    if (isRunning || !isVisible) return;
    const controller = new AbortController();
    getWords(controller.signal)
      .then((pages) => {
        if (!controller.signal.aborted) setFound(findRepairJobs(latest.current, pages, scope));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : 'The text could not be read.');
      });
    return () => controller.abort();
  }, [getWords, scope, overlay, isRunning, isVisible]);

  const jobs = useMemo(() => (found?.jobs ?? []).filter((job) => !attempted.current.has(job.id)), [found, tally]);

  const { config, destination, model, modelName, problem: setupProblem } = provider;
  const estimate = useMemo(() => estimateJobs(jobs, model), [jobs, model]);
  const pageCount = useMemo(() => jobs.reduce((sum, job) => sum + job.regions.length, 0), [jobs]);
  const consentKey = `${provider.consentKey}|${scope}|${jobs.length}`;
  const hasConsent = consentFor === consentKey;

  // Images must only go where the screen says, and a forgotten key must stop being used.
  const configKey = `${JSON.stringify(config)}|${provider.consentKey}`;
  useEffect(() => {
    if (!isRunning || runConfig.current === configKey) return;
    run.current?.abort();
    setProblem('Your AI settings changed, so reading stopped. What was already read is kept.');
  }, [configKey, isRunning]);

  const canRun = !isRunning && !isBusy && hasConsent && jobs.length > 0 && config !== null;

  const browserData = dataFor('reading', provider.needsKey);
  const start = async () => {
    if (!config) return;
    if (!(await hasBrowserConsent(browserData))) {
      setConsentFor(null);
      setProblem(WITHDRAWN);
      return;
    }
    const controller = beginRequest();
    run.current = controller;
    runConfig.current = configKey;
    setRunModel(model);
    setIsRunning(true);
    setProblem(null);
    setTally(null);
    try {
      const final = await runRepairs({
        jobs,
        getOverlay: () => latest.current,
        read: readWhileAllowed(createReader(config), browserData, () => {
          setConsentFor(null);
          setProblem(WITHDRAWN);
          controller.abort();
        }),
        renderJob,
        signal: controller.signal,
        onProgress: (next, updated) => {
          if (controller.signal.aborted) return;
          setTally(next);
          for (const id of next.unchangedIds) attempted.current.add(id);
          latest.current = updated;
          onOverlay(updated);
        },
      });
      setTally(final);
      // Consent covers one run. Asking again keeps every send a choice.
      setConsentFor(null);
    } catch (cause) {
      if (!controller.signal.aborted) setProblem(cause instanceof Error ? cause.message : 'AI reading stopped unexpectedly.');
    } finally {
      setIsRunning(false);
      onRunEnded();
    }
  };

  // Hidden rather than unmounted, so that a run and its Stop button outlive a change of tab.
  if (!isVisible) return null;

  return (
    <div className="ai">
      {chosenAtStart !== null && (
        <p className="ai-chosen">{t('You chose AI reading when you added this book. Check what it would cost below, tick to agree, and start it. You can keep reading while it runs.')}</p>
      )}
      <p className="hint">
        {t('A model reads again the lines this app could not settle. Every move it reads is checked against the rules of chess and the words on the page.')}
      </p>

      <div className="ai-provider">
        <span>
          {tm(destination)}
          {modelName ? `, ${modelName}` : ''}
        </span>
        <button type="button" className="quiet" onClick={onSettings}>
          {t('Change')}
        </button>
      </div>
      {provider.usesChatGptPlan && (
        <p className="hint">
          {t('Using ChatGPT plan.')}{' '}
          <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">
            {t('Manage usage')}
          </a>
        </p>
      )}
      {setupProblem && (
        <p className="fix-problem">
          {tm(setupProblem)}{' '}
          <button type="button" onClick={onSettings}>
            {t('Open Settings')}
          </button>
        </p>
      )}

      <label className="field">
        {t('Which lines')}
        <select value={scope} disabled={isRunning} onChange={(event) => setScope(event.target.value as RepairScope)}>
          <option value="flagged">{t('Only lines with something in doubt')}</option>
          <option value="all">{t('All lines, which also catches unflagged errors')}</option>
        </select>
      </label>

      {!found && !problem && <p className="hint">{t('Working out what needs reading…')}</p>}

      {found && (
        <>
          {jobs.length > 0 && (
            <ul className="numbers">
              <li>
                {t('{jobs} stretches of text, about {images} images', { jobs: jobs.length, images: pageCount })}
              </li>
              <li>
                {provider.usesChatGptPlan
                  ? t('This uses what your ChatGPT plan includes. A long book can reach its limit, and you can continue later.')
                  : estimate.dollars === null
                    ? t('No price known for this model. About {input} tokens in and {output} out.', {
                        input: estimate.inputTokens.toLocaleString(language),
                        output: estimate.outputTokens.toLocaleString(language),
                      })
                    : t('Estimated cost: {cost}, at prices from October 2026. It can differ.', { cost: dollars(estimate.dollars) })}
              </li>
              <li>{t('About {minutes} minutes, reading {parallel} stretches at a time. It can take longer.', { minutes: estimateMinutes(jobs.length, model), parallel: PARALLEL_REQUESTS })}</li>
            </ul>
          )}
          {jobs.length === 0 && (
            <p className="hint">
              {found.jobs.length ? t('What is left was already read in this session, with no improvement.') : t('Nothing here needs reading.')}
            </p>
          )}
          {found.tooLong > 0 && <p className="hint">{t('{count} stretches run over too many pages to send, and are left out.', { count: found.tooLong })}</p>}
        </>
      )}

      {jobs.length > 0 && (
        <label className="consent">
          <input type="checkbox" checked={hasConsent} disabled={isRunning} onChange={(event) => {
              if (!event.target.checked) return setConsentFor(null);
              // Firefox's own prompt opens from this click, and nothing is ticked if it is declined.
              void askBrowserConsent(browserData).then((isAllowed) => {
                setConsentFor(isAllowed ? consentKey : null);
                setProblem((current) => (isAllowed ? clearConsentProblem(current) : DECLINED));
              });
            }}
          />
          <span>
            {t('Send images of these parts of the pages to {destination}. Their terms apply. Only do this with a book you may share this way.', { destination: tm(destination) })}
          </span>
        </label>
      )}

      <div className="actions">
        <button type="button" disabled={!canRun} onClick={() => void start()}>
          {t('Read with AI')}
        </button>
        {isRunning && (
          <button type="button" className="quiet" onClick={() => run.current?.abort()}>
            {t('Stop')}
          </button>
        )}
      </div>

      {problem && (
        <p className="error" role="alert">
          {tm(problem)}
        </p>
      )}

      {tally && <TallyView tally={tally} model={runModel} isRunning={isRunning} />}
    </div>
  );
}

function TallyView({ tally, model, isRunning }: { tally: RepairTally; model: string; isRunning: boolean }) {
  const { t, tm, language } = useI18n();
  const dollars = (amount: number) => (amount < 0.01 ? t('under $0.01') : `$${amount.toFixed(2)}`);
  const spent = priceOf(model, tally.inputTokens, tally.outputTokens);
  return (
    <div role="status">
      <p className="hint">
        {isRunning
          ? t('Read {done} of {total}', { done: tally.done, total: tally.total })
          : tally.done < tally.total || tally.stoppedBecause
            ? t('Stopped after {done} of {total}', { done: tally.done - tally.failed, total: tally.total })
            : t('Finished all {total}', { total: tally.total })}
      </p>
      {tally.stoppedBecause && (
        <p className="error" role="alert">
          {tm(tally.stoppedBecause)}
        </p>
      )}
      <ul className="numbers">
        <li>{t('{count} lines replaced', { count: tally.replaced })}</li>
        <li>
          {t('{moves} moves read: {confirmed} also found on the page, {flagged} added to Check', { moves: tally.moves, confirmed: tally.confirmed, flagged: tally.flagged })}
        </li>
        {tally.unchanged > 0 && <li>{t('{count} left as they were', { count: tally.unchanged })}</li>}
        {tally.failed > 0 && (
          <li>
            {tally.lastProblem
              ? t('{count} failed. Latest: {problem}', { count: tally.failed, problem: tm(tally.lastProblem) })
              : t('{count} failed', { count: tally.failed })}
          </li>
        )}
        <li>
          {spent !== null
            ? t('{input} tokens in, {output} out, about {cost}', { input: tally.inputTokens.toLocaleString(language), output: tally.outputTokens.toLocaleString(language), cost: dollars(spent) })
            : t('{input} tokens in, {output} out', { input: tally.inputTokens.toLocaleString(language), output: tally.outputTokens.toLocaleString(language) })}
        </li>
      </ul>
    </div>
  );
}
