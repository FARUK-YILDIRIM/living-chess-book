import {
  ANTHROPIC_MODELS,
  baseUrlProblem,
  DEFAULT_ANTHROPIC_MODEL,
  isLocalAddress,
  OPENAI_COMPATIBLE_PRESETS,
  type ProviderConfig,
} from './providers';

export const ANTHROPIC = 'Anthropic';
export const CHATGPT_PLAN = 'ChatGPT plan, no API key';
export const CUSTOM = 'Other';
export const PROVIDERS: readonly string[] = [ANTHROPIC, CHATGPT_PLAN, ...OPENAI_COMPATIBLE_PRESETS.map((p) => p.name), CUSTOM];

/** What the page may know about the ChatGPT sign-in. The tokens stay in the local helper. */
export interface ChatGptState {
  isSignedIn: boolean;
  isPlanEnabled: boolean;
  email?: string | null;
}

/** What is saved about AI reading. Keys are kept apart, and saved only if asked. */
export interface AiSettings {
  provider: string;
  anthropicModel: string;
  /** The model typed for each provider other than Anthropic. */
  otherModels: Record<string, string>;
  customUrl: string;
  rememberKeys: boolean;
  /** The note about using a ChatGPT plan is shown once. */
  hasSeenChatGptWelcome: boolean;
}

export const DEFAULT_SETTINGS: AiSettings = {
  provider: ANTHROPIC,
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  otherModels: {},
  customUrl: '',
  rememberKeys: false,
  hasSeenChatGptWelcome: false,
};

/** Reads stored settings, falling back to the default for anything that does not fit. */
export function settingsFromStorage(stored: unknown): AiSettings {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_SETTINGS;
  const { provider, anthropicModel, otherModels, customUrl, rememberKeys, hasSeenChatGptWelcome } = stored as Partial<Record<keyof AiSettings, unknown>>;
  const models = typeof otherModels === 'object' && otherModels !== null ? Object.entries(otherModels) : [];
  return {
    provider: typeof provider === 'string' && PROVIDERS.includes(provider) ? provider : ANTHROPIC,
    anthropicModel: ANTHROPIC_MODELS.some((m) => m.id === anthropicModel) ? (anthropicModel as string) : DEFAULT_ANTHROPIC_MODEL,
    otherModels: Object.fromEntries(models.filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    customUrl: typeof customUrl === 'string' ? customUrl : '',
    rememberKeys: rememberKeys === true,
    hasSeenChatGptWelcome: hasSeenChatGptWelcome === true,
  };
}

export interface ResolvedProvider {
  /** Where images would go, in words a reader can check. */
  destination: string;
  model: string;
  modelName: string;
  baseUrl: string;
  needsKey: boolean;
  usesChatGptPlan: boolean;
  /** What must be set before reading can start. */
  problem: string | null;
  /** Null until everything needed is set. */
  config: ProviderConfig | null;
  /** Changes whenever images would go somewhere else, so that consent starts over. */
  consentKey: string;
}

export function resolveProvider(
  settings: AiSettings,
  keys: Readonly<Record<string, string>>,
  chatGpt: ChatGptState = { isSignedIn: false, isPlanEnabled: false },
): ResolvedProvider {
  const { provider } = settings;
  if (provider === CHATGPT_PLAN) {
    const model = (settings.otherModels[CHATGPT_PLAN] ?? '').trim();
    let problem: string | null = null;
    if (!chatGpt.isSignedIn) problem = 'Sign in with your ChatGPT account.';
    else if (!chatGpt.isPlanEnabled) problem = 'Allow this app to use your ChatGPT plan.';
    else if (!model) problem = 'Choose a model.';
    return {
      destination: 'OpenAI, using your ChatGPT plan',
      model,
      modelName: model,
      baseUrl: '',
      needsKey: false,
      usesChatGptPlan: true,
      problem,
      config: problem ? null : { kind: 'chatgpt-plan', apiKey: '', model },
      consentKey: `${provider}|${model}|${chatGpt.email ?? ''}`,
    };
  }

  const isAnthropic = provider === ANTHROPIC;
  const preset = OPENAI_COMPATIBLE_PRESETS.find((p) => p.name === provider);
  const baseUrl = isAnthropic ? '' : (preset?.baseUrl ?? settings.customUrl.trim());
  const model = isAnthropic ? settings.anthropicModel : (settings.otherModels[provider] ?? '').trim() || (preset?.defaultModel ?? '');
  const modelName = ANTHROPIC_MODELS.find((m) => m.id === model)?.name ?? model;
  const needsKey = isAnthropic || !isLocalAddress(baseUrl);
  const apiKey = (keys[provider] ?? '').trim();
  const destination = isAnthropic ? ANTHROPIC : (preset?.name ?? (baseUrl || 'an address you have not set'));

  let problem: string | null = null;
  if (!isAnthropic && !baseUrl) problem = 'Set the address of the service.';
  else if (!isAnthropic && baseUrlProblem(baseUrl)) problem = baseUrlProblem(baseUrl);
  else if (!model) problem = 'Set the model to use.';
  else if (needsKey && !apiKey) problem = 'Add your API key.';

  const config: ProviderConfig | null = problem
    ? null
    : isAnthropic
      ? { kind: 'anthropic', apiKey, model }
      : { kind: 'openai-compatible', apiKey, model, baseUrl };

  return { destination, model, modelName, baseUrl, needsKey, usesChatGptPlan: false, problem, config, consentKey: `${provider}|${baseUrl}|${model}` };
}
