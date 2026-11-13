# Firefox Add-ons listing

What goes into addons.mozilla.org (AMO) for Living Chess Book. The text and images are the
[Chrome Web Store listing](chrome-web-store.md)'s. This page holds what AMO asks for besides, and the
notes its reviewers need. Why Firefox has its own package is in
[ADR-0022](../adr/0022-firefox-extension.md).

Checked against Mozilla's documentation on 13 November 2026: [data collection
consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/),
[source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
and [third-party libraries](https://extensionworkshop.com/documentation/publish/third-party-library-usage/).

## Account

A Mozilla account at <https://addons.mozilla.org/developers/>. The owner signs in, accepts the
developer agreement and sets up anything AMO asks for, such as two-step sign-in, themself.

## Package

`release/living-chess-book-firefox-<version>.zip`, from `npm run build:extension`. Upload it under
**Submit a New Add-on**, choose **On this site**, and the platforms Firefox desktop only.

The manifest gives the ID `living-chess-book@livingchessbook.org`, which must never change, and
Firefox 140 or later. AMO shows its data collection from the manifest: none is required, and website
content, personal communications and authentication information are optional.

## Source code

AMO asks for it, because the app is bundled and minified by Vite. Answer **Yes**, and upload the
repository at the version's tag:

```bash
git archive --format=zip -o living-chess-book-source-<version>.zip v<version>
```

## Listing

- **Name:** Living Chess Book
- **Summary** (at most 250 characters): the manifest's description.
- **Description:** the Chrome Web Store's description, as it is.
- **Categories:** Education if AMO offers it, otherwise Other.
- **Support site:** <https://github.com/FARUK-YILDIRIM/living-chess-book/issues>
- **Homepage:** <https://github.com/FARUK-YILDIRIM/living-chess-book>
- **Licence:** GNU General Public License v3.0. The project is GPL-3.0-or-later.
- **Privacy policy:** paste the text of [PRIVACY.md](../../PRIVACY.md).
- **Images:** the store icon and the four screenshots in this folder, from the sample book only.

## Notes for reviewers

Paste this, with the version filled in:

```text
BUILD
The source is the GitHub repository at tag v<version>: https://github.com/FARUK-YILDIRIM/living-chess-book/tree/v<version>
Built on macOS with Node.js 22.18.0 and npm 10.9.3. Linux and Node 24 were not tried.
  npm ci
  npm run build:extension
The add-on is the folder dist-extension-firefox/, which the build also packs into release/living-chess-book-firefox-<version>.zip. The build checks that the folder holds only the files it expects.

THIRD-PARTY FILES COPIED AS THEY ARE, from the npm packages in package-lock.json
- engine/stockfish-19-lite-single.js, .wasm and engine/stockfish-19-single.js, .wasm: stockfish 19.0.1, from bin/ in the npm package. https://www.npmjs.com/package/stockfish/v/19.0.1 Source: https://github.com/nmrugg/stockfish.js
- pdfjs/wasm, pdfjs/cmaps, pdfjs/standard_fonts, pdfjs/iccs: pdfjs-dist 6.5.438, from the npm package, without the QuickJS sandbox files. Source: https://github.com/mozilla/pdf.js
Everything else is bundled by Vite from the source and the npm packages in package-lock.json, such as React, chess.js and chessground. THIRD_PARTY_NOTICES.txt in the add-on lists every package with its licence.

WHAT IT DOES
The toolbar button opens the app in a tab. No account, sign-in or payment is needed: choose "Try the sample book" on the first screen. The add-on asks for no host permissions and runs no content scripts. unlimitedStorage keeps a copy of each PDF the reader opens.

DATA
Nothing is sent anywhere unless the reader sets up an AI provider in Settings, with their own API key. Then the app asks its own consent before AI reading or the coach sends anything, and Firefox's data collection prompt opens from the same click. A declined prompt leaves the app's consent ungiven. The grant is checked again before each request to the provider, so taking it back in Firefox stops a run.
```

Review can take some days. Once listed, the add-on's page gives the link for the README.
