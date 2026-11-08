// The extension's only job outside the app: opening it in a tab of its own. See ADR-0021.
const APP_PAGE = 'index.html';

function openApp() {
  return chrome.tabs.create({ url: chrome.runtime.getURL(APP_PAGE) });
}

chrome.action.onClicked.addListener(() => void openApp());

// A first install opens the app once, so that the reader sees where it is.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') void openApp();
});
