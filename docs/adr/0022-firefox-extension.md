# ADR-0022: Publish the extension for Firefox, with AI behind Firefox's own consent

Status: Accepted (2026-11-13, decided with the project owner). Extends
[ADR-0021](0021-browser-extension.md).

## Context

The owner wants the extension on addons.mozilla.org (AMO) too. Firefox runs the same app, but its
manifest differs: it has no background service worker, it wants an add-on ID, and since November 2025
a new add-on must declare in its manifest any data it sends out of the browser. A reader then grants
that data through Firefox's own prompt, not only the add-on's. Data a reader must agree to before it
goes can be declared optional, and asked for when they agree.

The only data that leaves the app is what AI reading and the coach send to the provider the reader
chose. The owner chose to keep both in Firefox, rather than leave them out of the first version.

## Decision

- **One build, two packages.** `npm run build:extension` builds the app once and writes
  `dist-extension/` for Chrome and Edge, and `dist-extension-firefox/` with Firefox's manifest. The
  app's files are the same in both.
- **Firefox's manifest** runs `background.js` as a background script, and adds
  `browser_specific_settings.gecko`:
  - the ID `living-chess-book@livingchessbook.org`, which never changes, since Firefox keeps a
    reader's storage under it;
  - at least Firefox 140, the first with the built-in consent;
  - `data_collection_permissions`: `required` is `none`, and `optional` lists website content,
    personal communications and authentication information, the same categories as the Chrome Web
    Store listing.
- **Firefox's prompt comes with the app's own consent**, from the same click: the box that agrees to
  an AI reading run asks for website content, and the coach's **I agree** asks for website content
  and personal communications. Authentication information is asked for too when the provider takes a
  key. If the reader declines, the app's consent is not given. Before each request to the provider, the
  app checks the grant again, since a reader can withdraw it in Firefox's add-ons page at any time,
  even during a run.
- **A model on the reader's own computer** is asked for in the same way, though its data does not
  leave the computer. One rule for every provider is simpler to trust than one that depends on an
  address.
- **Source for review.** AMO rebuilds a bundled add-on from its source and compares the result. The
  repository at the version's tag is the source, and [docs/store/firefox-add-ons.md](../store/firefox-add-ons.md)
  says how to build it.

## Consequences

- Chrome and Edge behave as before. `browser` is not defined there, so the extra prompt and checks
  never run.
- A Firefox reader agrees twice for the same thing, once in the app and once in Firefox's prompt. The
  app's text says what goes and where, which Firefox's prompt does not.
- AMO's reviewers may ask for more about Stockfish and pdf.js, whose WebAssembly is copied from their
  npm packages.
- Firefox for Android is not targeted.
