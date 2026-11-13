# Privacy policy

Living Chess Book, the browser extension for Chrome, Edge and Firefox. Effective 13 November 2026.

Living Chess Book is free software that runs on your computer. It has no servers and no accounts
of its own, and it collects nothing about you. The authors receive none of your data.

## What stays on your computer

These are kept in your browser's storage for this extension, and never leave it on their own:

- A copy of each PDF you open, so that the library can open it again.
- What the app read from each book, and your corrections.
- Your notebook: notes, saved positions and practice history.
- Your settings, such as the language and the engine's options.
- Your AI provider's API key, only if you tick **Remember my keys on this computer**. It is saved
  encrypted, but the key that unlocks it is kept on the same computer, so someone with access to
  your computer account could still recover it. Do not use this on a shared computer. Without the
  tick, the key is kept in memory until you close the app.

The chess engine, Stockfish, runs inside the extension and sends nothing anywhere. The coach can
send positions to an AI provider, as described below.

## What leaves your computer, and only when you ask

Two features are optional and off until you set them up: **AI reading** and **the coach**. They
need an AI provider that you choose in Settings, such as Anthropic, DeepSeek, OpenAI, another
service that works like OpenAI's, or a model on your own computer. Before anything is sent, the app
names where it goes and asks you to agree: for AI reading before each run, and for the coach once
for each provider, until you close the app.

- **AI reading** sends images cropped to the lines of the book being read, with the position they
  start from. You see how many and the estimated cost, and agree to each run.
- **The coach** sends your question, the page number, the position, the book's line, the engine's
  lines, your notes on that position, your last few exchanges with the coach and any text you
  selected on the page. The text of the whole page goes only if you tick a second box.

In Firefox, Firefox also asks you in its own prompt, from the same click, and nothing is sent if you
decline. You can take that back at any time in Firefox's add-ons page, and the app then asks again.

This goes straight from your browser to the provider you chose, with your own API key. Nothing
passes through the authors. What the provider does with it is set by that provider's own terms and
privacy policy, so read them before you use one, and send a book only if you may share it this way.

## What the extension does not do

- No analytics, tracking, advertising or crash reports.
- No access to the websites you visit. The extension's only permission is `unlimitedStorage`, so
  that your books are not cleared to free space.
- No selling or sharing of data, because none is collected.

## Removing your data

Remove a book from the library to delete its copy, its analysis and your notes. **Forget all keys**
in Settings deletes saved keys. Uninstalling the extension deletes everything it stored. Files you
exported yourself, such as a backed-up notebook, stay where you saved them.

## The web app

Run from its source with `npm run dev`, the app can also use a ChatGPT plan instead of an API key.
Then a small helper on your computer signs you in with OpenAI, keeps that sign-in in
`~/.config/chess-coach/`, readable only by you, and passes requests to OpenAI. Signing out ends the
sign-in at OpenAI. The extension has no such helper.

## Changes and contact

A change to this policy is published here, with a new date, before a version that needs it. The
source code is at <https://github.com/FARUK-YILDIRIM/living-chess-book>. For questions, open an
issue there.
