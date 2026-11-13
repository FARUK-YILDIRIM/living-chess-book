/**
 * Firefox asks a reader, in its own prompt, before an add-on sends data out of the browser
 * (ADR-0022). Elsewhere there is no such prompt, and the app's own consent is all there is.
 */
import type { ReadLines } from '../llm/providers';

export type BrowserDataType = 'websiteContent' | 'personalCommunications' | 'authenticationInfo';

interface DataPermissions {
  data_collection?: string[];
}

interface PermissionsApi {
  request(permissions: DataPermissions): Promise<boolean>;
  getAll(): Promise<DataPermissions>;
}

interface BrowserApi {
  permissions?: PermissionsApi;
  runtime?: { getManifest?: () => { browser_specific_settings?: { gecko?: { data_collection_permissions?: unknown } } } };
}

export const DECLINED = 'Firefox did not allow this to be sent, so nothing was sent.';
export const WITHDRAWN = 'Firefox no longer allows this to be sent. Agree again to send it.';

/**
 * Only a build whose manifest declares the data has Firefox's prompt. Reading the manifest needs no
 * waiting, so the prompt can still open from the reader's click.
 */
function permissionsApi(): PermissionsApi | null {
  const browser = (globalThis as { browser?: BrowserApi }).browser;
  const declared = browser?.runtime?.getManifest?.().browser_specific_settings?.gecko?.data_collection_permissions;
  return declared && browser?.permissions ? browser.permissions : null;
}

/** What a send carries, in Firefox's words. The key counts only when the provider takes one. */
export function dataFor(feature: 'reading' | 'coach', sendsKey: boolean): BrowserDataType[] {
  return [
    'websiteContent',
    ...(feature === 'coach' ? (['personalCommunications'] as const) : []),
    ...(sendsKey ? (['authenticationInfo'] as const) : []),
  ];
}

/**
 * Opens Firefox's prompt, which grants at once what was granted before. Call it straight from the
 * reader's click, before anything is awaited, or Firefox will not open it.
 */
export function askBrowserConsent(types: readonly BrowserDataType[]): Promise<boolean> {
  const api = permissionsApi();
  if (!api) return Promise.resolve(true);
  return api.request({ data_collection: [...types] }).catch(() => false);
}

/** Whether Firefox still allows it, since a reader can take it back in the add-ons page at any time. */
export async function hasBrowserConsent(types: readonly BrowserDataType[]): Promise<boolean> {
  const api = permissionsApi();
  if (!api) return true;
  const granted = (await api.getAll().catch((): DataPermissions => ({}))).data_collection ?? [];
  return types.every((type) => granted.includes(type));
}

/**
 * A run of AI reading sends for minutes, and a reader can take the grant back while it does. Each
 * request is checked first, and the first one refused stops the run.
 */
export function readWhileAllowed(read: ReadLines, types: readonly BrowserDataType[], onWithdrawn: () => void): ReadLines {
  return async (request) => {
    if (!(await hasBrowserConsent(types))) {
      onWithdrawn();
      throw new Error(WITHDRAWN);
    }
    return read(request);
  };
}

/** Clears a message this file gave, once the reader has agreed, and leaves any other. */
export const clearConsentProblem = (problem: string | null) => (problem === DECLINED || problem === WITHDRAWN ? null : problem);
