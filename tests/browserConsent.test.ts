import { afterEach, describe, expect, it, vi } from 'vitest';
import { askBrowserConsent, clearConsentProblem, dataFor, DECLINED, hasBrowserConsent, readWhileAllowed, WITHDRAWN } from '../src/app/browserConsent';

const DECLARED = { browser_specific_settings: { gecko: { data_collection_permissions: { required: ['none'], optional: [] } } } };

function fakeFirefox(granted: string[], answer = true) {
  const request = vi.fn(async ({ data_collection }: { data_collection: string[] }) => {
    if (answer) granted.push(...data_collection);
    return answer;
  });
  const getAll = vi.fn(async () => ({ permissions: [], origins: [], data_collection: [...granted] }));
  (globalThis as { browser?: unknown }).browser = { permissions: { request, getAll }, runtime: { getManifest: () => DECLARED } };
  return { request, getAll };
}

afterEach(() => {
  delete (globalThis as { browser?: unknown }).browser;
});

describe('dataFor', () => {
  it('names what each feature sends, and the key only when the provider takes one', () => {
    expect(dataFor('reading', true)).toEqual(['websiteContent', 'authenticationInfo']);
    expect(dataFor('reading', false)).toEqual(['websiteContent']);
    expect(dataFor('coach', true)).toEqual(['websiteContent', 'personalCommunications', 'authenticationInfo']);
  });
});

describe('Firefox consent', () => {
  it('is not asked outside Firefox, where the app\'s own consent is enough', async () => {
    expect(await askBrowserConsent(['websiteContent'])).toBe(true);
    expect(await hasBrowserConsent(['websiteContent'])).toBe(true);
  });

  it('is not asked by a build whose manifest declares no data, such as one with a browser API but no prompt', async () => {
    const request = vi.fn();
    (globalThis as { browser?: unknown }).browser = { permissions: { request, getAll: vi.fn() }, runtime: { getManifest: () => ({}) } };
    expect(await askBrowserConsent(['websiteContent'])).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('opens the prompt at once, from the click, without waiting first', () => {
    const { request, getAll } = fakeFirefox([]);
    void askBrowserConsent(['websiteContent']);
    expect(request).toHaveBeenCalledWith({ data_collection: ['websiteContent'] });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is refused when the reader declines', async () => {
    fakeFirefox([], false);
    expect(await askBrowserConsent(['websiteContent'])).toBe(false);
  });

  it('finds a grant taken back, and every type must still be granted', async () => {
    const granted = ['websiteContent', 'authenticationInfo'];
    fakeFirefox(granted);
    expect(await hasBrowserConsent(['websiteContent', 'authenticationInfo'])).toBe(true);
    granted.splice(1);
    expect(await hasBrowserConsent(['websiteContent', 'authenticationInfo'])).toBe(false);
  });

  it('counts a failing prompt as a refusal', async () => {
    const { request } = fakeFirefox([]);
    request.mockRejectedValueOnce(new Error('not from a click'));
    expect(await askBrowserConsent(['websiteContent'])).toBe(false);
  });
});

describe('readWhileAllowed', () => {
  const request = { system: '', prompt: 'p', images: [], signal: new AbortController().signal };

  it('checks before each request, and stops at the first taken back, before it is sent', async () => {
    const granted = ['websiteContent', 'authenticationInfo'];
    fakeFirefox(granted);
    const read = vi.fn(async () => ({ text: 'ok', usage: null }));
    const onWithdrawn = vi.fn();
    const guarded = readWhileAllowed(read, ['websiteContent', 'authenticationInfo'], onWithdrawn);
    await guarded(request);
    granted.splice(0);
    await expect(guarded(request)).rejects.toThrow(WITHDRAWN);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onWithdrawn).toHaveBeenCalledTimes(1);
  });

  it('sends as before outside Firefox', async () => {
    const read = vi.fn(async () => ({ text: 'ok', usage: null }));
    await readWhileAllowed(read, ['websiteContent'], vi.fn())(request);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('clearConsentProblem', () => {
  it('clears only its own messages, so that another problem stays in view as before', () => {
    expect(clearConsentProblem(DECLINED)).toBeNull();
    expect(clearConsentProblem(WITHDRAWN)).toBeNull();
    expect(clearConsentProblem('Your AI settings changed, so reading stopped. What was already read is kept.')).not.toBeNull();
  });
});
