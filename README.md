# Living Chess Book

Open a chess book PDF you own, and study it on one screen: click its moves and diagrams to see
them on a live board, take notes, save positions, check lines with an engine, and ask a coach. It
runs on your computer. Nothing leaves it unless you ask the coach or start AI reading.

**Status: early prototype.** On one digital book, the local reader got about 90% to 97% of the
main line moves right. On a hard scanned book it got about half, against a target of 95%. On a small
sample of that book, AI reading with DeepSeek reached 87%, and a stand-in for an API had reached 99%. Diagrams did well without it. See [docs/spike-results.md](docs/spike-results.md). The
coach has been tried with DeepSeek, but no strong player has judged its advice.

## What it does

- Shows the book's original pages, with clickable moves and diagrams.
- Reads diagrams into positions, and moves into a tree of main and side lines.
- Lets you step through lines with the arrow keys, and try your own moves on the board.
- Lists what it is unsure about, so that you can check and correct it.
- Keeps your books in a library on the first screen, so that one click opens a book at the
  page you left it. For this it keeps a private copy of each PDF on your computer.
- Remembers its analysis and your corrections. An analysis or a notebook can be saved to a file and
  opened by someone with the very same PDF, or kept as a backup. Neither holds book text or page images.
- Can read doubtful lines again with an AI model, if you choose to.
- Keeps a study notebook beside the page. Notes and saved positions attach to the page and position
  by themselves, and a click brings you back. You can select text on the page to mark it.
- Runs Stockfish on your computer, and shows its best lines to click through.
- Lets you solve diagrams and guess the book's moves, with what follows covered on the page. A move
  that is not the book's gets the engine's view of it.
- Brings saved positions back for practice at growing intervals, and moves you missed sooner.
- Shows how many diagrams you have solved, and leads to the next.
- Answers questions through an AI coach, if you connect one.

See [docs/SPEC.md](docs/SPEC.md) and the [decision records](docs/adr).

## The coach

This is optional, and uses the same provider as AI reading. Select **Ask the coach** on the page or
press C to open its window, or select text on the page and choose **Explain**.

- **What is sent:** your question, the position, the book's line, Stockfish's lines, your notes on
  this position, your last few exchanges and any text you selected. You agree to the place it goes,
  named in the coach's window, before anything is sent, and can read exactly what went. The text of the whole page goes
  only if you tick a second box.
- **How replies are checked:** every move must be legal from the position to be clickable. Others
  are struck through with a warning. This catches illegal moves, not bad advice, so treat the coach
  as a study partner. It is told to rely on the engine for calculation.
- **Limits:** only DeepSeek has been tried, on a small set of questions. A reply can take up to a
  minute.

## AI reading

This is optional and off until you start it. Choose a provider in Settings, then start it from
**Fix the reading** in a book's menu. There are three ways to pay for it:

- **A ChatGPT Plus or Pro plan, with no API key.** Choose it in Settings and select **Continue
  with ChatGPT**. It uses what your plan includes, and a long book can reach a limit. It is an
  OpenAI preview, and needs `npm run dev`, because a small local helper holds the sign-in. See
  [ADR-0012](docs/adr/0012-chatgpt-plan-through-a-local-helper.md). Claude and Gemini
  subscriptions cannot be used this way, because their terms do not allow it.
- **Your own API key**, from Anthropic, DeepSeek or any OpenAI-compatible service.
- **A model on your own computer**, such as through Ollama, with no account at all.

- **What is sent:** images cropped to the lines being read, with the starting position. You
  see how many and an estimated cost, and tick a box for each run. The provider's terms apply,
  so only do this with a book you may share this way.
- **Your key:** kept in memory until you close the app, unless you tick the box to remember
  it. Then it is saved on this computer, encrypted, but someone with access to your account
  could still recover it, so do not use this on a shared computer. You can forget your keys at
  any time.
- **How replies are checked:** every move must be legal from the diagram, and is matched with
  the words on the page. A move with no match goes to the Check tab. Your own corrections are
  never replaced.
- **Your ChatGPT sign-in:** kept in `~/.config/chess-coach/` (named before the project was), readable only by you. The app's
  pages never see it. Signing out ends it at OpenAI.
- **Limits:** it reads main lines only. Only DeepSeek's API has run it, on a sample, and not a real
  ChatGPT account.

## Run it

Requires Node.js 22.

```bash
npm install
npm run dev
```

Then open http://localhost:5183. `public/sample-book.pdf` is an original sample book to
try it with.

## Browser extension

Living Chess Book is meant to be installed as an extension for Chrome and Edge. A click on its
button opens the app in a tab of its own, which works as above, with everything kept on your
computer. The extension asks for no access to the sites you visit.

```bash
npm run build:extension
```

This builds `dist-extension/`, and `release/living-chess-book-<version>.zip` for a store. To try
it, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose
**Load unpacked**, and pick the `dist-extension` folder. `npm run preview:extension` serves the
same pages with the extension's security policy, to try them in any browser.

In the extension, AI providers work with your own API key. The ChatGPT plan is not offered, as it
needs the local helper that only runs with `npm run dev`. Ollama may need `OLLAMA_ORIGINS` set to
let the extension in. An unpacked extension keeps its books and notes only while it is loaded from
the same folder.

## Desktop app

The desktop shell is on hold while the extension comes first. It uses [Tauri](https://tauri.app), which needs
[Rust](https://www.rust-lang.org/tools/install) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/). It has not been compiled
yet.

```bash
npm run tauri dev
```

## Test it

```bash
npm test
npm run typecheck
```

Automated tests use only original, generated books. To measure accuracy on a book you
own, keeping the book and your hand-checked lines outside the repository:

```bash
npm run eval:local -- /path/to/book.pdf /path/to/truth.json
```

It prints aggregate numbers only. `npm run eval:llm` does the same for AI reading, without
calling any API. See the top of [scripts/eval-llm.ts](scripts/eval-llm.ts).

## Privacy

The app collects nothing, and has no servers of its own. See [PRIVACY.md](PRIVACY.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
