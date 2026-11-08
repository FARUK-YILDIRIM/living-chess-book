# Chrome Web Store listing

What goes into the Chrome Web Store's Developer Dashboard for Living Chess Book. The Edge Add-ons
listing uses the same text. Keep this in step with the app: a listing that claims more than the app
does can be taken down.

## Package

`release/living-chess-book-<version>.zip`, from `npm run build:extension`.

## Store listing

**Name:** Living Chess Book (from the manifest)

**Summary** (from the manifest, at most 132 characters):

> Study a chess book PDF you own on one screen: clickable moves, a live board, notes, an engine and an optional AI coach.

**Description:** paste as it is. The store keeps every line break, so each paragraph and bullet is one line.

```text
Living Chess Book turns a chess book PDF you own into a study workspace. The book's own pages stay as they are, and its moves and diagrams become clickable.

• Click a move or a diagram to see it on a live board, and step through lines with the arrow keys.
• Try your own moves, and see what the Stockfish engine thinks of them.
• Solve diagrams and guess the book's moves, with what follows hidden on the page.
• Keep a notebook beside the page. Notes and saved positions attach to the page by themselves.
• Practise saved positions again at growing intervals.
• Ask an AI coach about a position, if you connect a provider of your choice.

Private by design
Everything runs on your computer: the book, your notes and the engine. Nothing is sent anywhere unless you set up an AI provider and agree first, and then only to the provider you chose, with your own API key. There are no accounts, no analytics and no ads. The extension asks for no access to the websites you visit.

Good to know
• It works best with digital PDFs whose text can be selected. A scanned book needs a text layer, and is read less reliably.
• It lists what it was unsure of, so that you can check and correct it.
• Use it only with books you own.

Free and open source under GPL-3.0-or-later:
https://github.com/FARUK-YILDIRIM/living-chess-book
```

**Category:** Education

**Language:** English. The app is also in Turkish, and follows the language chosen in its settings.

**Images:**

| Asset | Size | File |
|---|---|---|
| Store icon | 128 × 128, artwork 96 × 96 | `docs/store/icon-128.png` |
| Screenshots | 1280 × 800 | `docs/store/screenshot-*.png` |
| Small promo tile | 440 × 280 | `docs/store/promo-small.png` |

`node scripts/make-store-tile.mjs` draws the icon and the tile.

The screenshots show only the generated sample book. No real book may appear in them (ADR-0008).

## Privacy practices

**Single purpose:**

> Study chess books you own, as PDFs, on one screen with a live board, notes and a chess engine.

**Permission justification, `unlimitedStorage`:**

> The extension keeps a copy of each PDF the reader opens, with its analysis and the reader's
> notes, in the browser's storage on their computer. Books can be tens of megabytes each, and
> they must not be cleared when the browser frees space.

**Remote code:** No. All code, including the Stockfish engine, is in the package. Requests to an
AI provider send data and receive text. They do not load code.

**Data usage.** The extension itself collects no user data. When the reader turns on AI reading or
the coach, data goes from their browser to the AI provider they chose, never to the developer.
Declare it as follows, and state it the same way in the privacy policy:

- **Website content:** yes. From the book the reader opened: images of lines being read, the page
  number, the position, the book's moves, text the reader selects, and the whole page's text if
  they tick a box. Sent to the AI provider the reader chose, only after they agree, to read moves
  or answer their question.
- **Personal communications:** yes. The reader's questions to the coach, their notes on the
  position and their last few exchanges with the coach, sent with each question to the provider
  they chose.
- **Authentication information:** yes. The reader's own API key, sent only to their chosen
  provider to authorise the request. It is stored on the computer only if the reader asks.
- All other categories: no.

The engine's lines also go with a coach question. They are worked out on the computer and are not
user data. When in doubt, declare more rather than less: a listing that claims less than the
extension does can be taken down.

Then certify that data is not sold, not used for anything other than the single purpose, and not
used for credit.

**Privacy policy:** <https://github.com/FARUK-YILDIRIM/living-chess-book/blob/main/PRIVACY.md>

## Distribution

Free. Public. All regions.
