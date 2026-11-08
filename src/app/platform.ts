/**
 * True in the browser extension's build. It has no local helper, so the ChatGPT plan is not offered
 * there. See ADR-0021.
 */
export const IS_EXTENSION = import.meta.env.MODE === 'extension';
