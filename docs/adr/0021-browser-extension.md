# ADR-0021: Reach readers as a browser extension that opens the app in a tab

Status: Accepted (2026-11-08, decided with the project owner). Puts the desktop shell of
[ADR-0002](0002-tauri-with-typescript-core.md) on hold.

## Context

The app already runs wholly in a browser: pdf.js, Stockfish in WebAssembly, and storage in the
browser. The owner wants it in the Chrome and Edge stores, free and open source, with a click on the
extension opening it in a new tab as it works now. A browser profile was found empty after the app
moved folders, which showed that storage a site can lose is a real risk for a reader's notes.

## Decision

- **An extension that opens a tab.** A click on its button opens `index.html` from the extension in a
  new tab, and a first install opens it once. The app is the same build as the web one, made with
  `npm run build:extension`.
- **It asks for as little as possible**: only `unlimitedStorage`, so that books, analyses and notes
  are not cleared to free space. No host permissions, content scripts or tab access. Providers are
  reached as from any web page. This was tried with none of them from the extension. Ollama on this
  computer checks where a request comes from, and may need `OLLAMA_ORIGINS` set to the extension.
- **Its security policy loosens only WebAssembly**: `script-src 'self' 'wasm-unsafe-eval'`, which
  Stockfish and pdf.js's decoders need. All code is in the package, as the stores require.
- **Both engines are in the package.** The full Stockfish build is about 99 MB, and the zip is about
  83 MB. The Chrome Web Store accepts packages up to 2 GB. Edge Add-ons' limit was not checked.
- **pdf.js's legacy build**, in the web build too. Its modern build calls what only the newest browsers
  have, such as `Math.sumPrecise`, and would install but fail to open a PDF in an older Chrome. The
  sandbox pdf.js uses to run a PDF's own scripts is left out, as the app never asks for it.
- **What goes in the package is checked**: the build stops on any PDF other than the sample book, or
  any file it does not expect, so that no book can be shipped by mistake
  ([ADR-0008](0008-test-data.md)). The licence goes with it.
- **No ChatGPT plan in the extension.** It needs the local helper of
  [ADR-0012](0012-chatgpt-plan-through-a-local-helper.md), which an extension cannot run. The option is
  hidden there, and a stored choice of it falls back to the default provider.
- **Chrome and Edge first.** Firefox needs small changes to the manifest. Safari needs a Mac app around
  the extension, and is for later. The owner has an Apple developer account, and will open a Chrome
  Web Store account when publishing.
- **The web build stays**, for development and trying changes. The desktop shell waits.

## Consequences

- The extension's storage is its own, so books and notes kept at `localhost` do not appear in it.
  They can be moved with the analysis and notebook files of
  [ADR-0019](0019-sharing-analyses-and-choosing-ai-at-start.md).
- Publishing needs a privacy policy that says what stays on the computer and what goes to a provider,
  and only with consent. The licence ([ADR-0007](0007-gpl-license.md)) was confirmed on 2026-11-08.
- An unpacked extension's id comes from its folder, so loading it from another folder gives it new,
  empty storage. A store install keeps one id.
- `minimum_chrome_version` is 116, and no Chrome that old has been tried.
- The extension was tried by serving its pages with the same security policy, and later loaded into
  Chrome 157 and Edge 157 without a window.

## Later (2026-11-08)

Ready for the Chrome Web Store, as version 0.1.1:

- **Where the source is.** Settings ends with the version, the licence and a link to the GitHub
  repository, as the GPL asks of every copy.
- **Notices.** The build lists every package that goes into the bundle, as it builds it, and writes
  their licences into `THIRD_PARTY_NOTICES.txt` in the package, with pdf.js and Stockfish, which are
  copied rather than bundled, and Vite and Rolldown, which add code of their own. A package
  published without a licence file needs its text kept in `scripts/licences`, or the build stops.
- **Privacy policy** in [PRIVACY.md](../../PRIVACY.md): nothing is collected, and what goes to an AI
  provider goes only when the reader asks, straight to the provider they chose.
- **The listing**, with its answers on privacy, is in [docs/store](../store/chrome-web-store.md). Its
  screenshots show only the sample book.

## Later (2026-11-09)

Published in the [Chrome Web Store](https://chromewebstore.google.com/detail/living-chess-book/mlojkmfoodhbonbnnilidimdnddminkf) as version 0.1.1.
The owner chose not to register for Edge Add-ons, whose sign-up asks for a puzzle to prove a person
is there. Edge can install extensions from the Chrome Web Store once the reader allows it, so Edge
readers are served from there. Installing it that way in Edge has not been tried yet.
