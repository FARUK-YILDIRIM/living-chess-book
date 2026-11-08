# Working in this repository

Guidance for coding agents and people alike. Living Chess Book turns a chess book PDF the reader owns
into a study workspace on one screen: the book's own pages, a live board, a notebook, a local engine
and an optional AI coach. See [README.md](README.md) for what it does, and [docs/SPEC.md](docs/SPEC.md)
for what it must do.

## Commands

```bash
npm ci            # install
npm run dev       # the app at http://localhost:5183, with the local ChatGPT helper
npm test          # all tests, with Vitest
npm run typecheck # TypeScript, no output
npm run build     # typecheck, then a production build in dist/
npm run build:extension    # the Chrome and Edge extension in dist-extension/, and a zip in release/
npm run preview:extension  # those pages at http://localhost:5184, with the extension's security policy
```

`npm run dev` and `npm run build` first copy pdf.js's assets and the Stockfish builds into `public/`,
which git ignores.

The browser extension is how the app is meant to reach readers ([ADR-0021](docs/adr/0021-browser-extension.md)). The
Tauri desktop shell in `src-tauri/` is on hold, has not been compiled yet, and needs Rust.

## How work is done

This project follows the Agent Skills lifecycle ([ADR-0009](docs/adr/0009-development-process.md)):
Define, Plan, Build, Verify, Review, Ship.

1. **Define.** A change of behaviour starts from `docs/SPEC.md` and an ADR in `docs/adr/`. A new
   decision gets the next number. An earlier ADR is amended with a dated "Later" section, or replaced
   by a new one that says so. ADRs are short, and say what was decided and why, not how the code looks.
2. **Plan.** Each task is a row in `docs/PLAN.md`, with how it was checked. Open items are listed there.
3. **Build.** One task at a time, and one commit per task. Tests first where the logic is pure, which
   is most of `src/core`, `src/llm` and `src/vision`.
4. **Verify.** `npm run typecheck`, `npm test` and `npm run build` must pass, and
   `npm run build:extension` for a change that touches what ships. A change on screen is
   also tried in a browser, at a wide and a narrow window. Say what was checked and what was not.
5. **Review.** A separate agent reviews the change from the code alone, without the builder's
   conclusions, and its findings are fixed or answered before the commit.
6. **Ship.** Release notes and packaging. Nothing is pushed, published or released without the owner.

### Why records

Decisions about the project go in an ADR. A decision inside the code that a reader would wonder
about, and that could reasonably have gone another way, gets a Why Trail record instead: a short
file in `docs/why/`, pointed to by a `why: W-XXXXXX` comment on the line above the code. Most
changes need none. Records are history: one that no longer holds is marked `superseded` or
`retired`, and never deleted. With the Why Trail plugin, `why.mjs check` must pass before a commit.

### Commits

- One task per commit, with its tests and the documents it changes.
- The subject is one plain sentence in the imperative, under about 72 characters, with no prefix:
  "Add a coach window", not "feat: coach".
- The body says why, and anything found while building that a reader of the history should know.
- A commit written with an AI agent ends with a `Co-Authored-By:` line for that agent.
- Author email: `faruk.yildirim@outlook.com.tr`, set for this repository.

## Rules that are not negotiable

- **No book content in the repository** ([ADR-0008](docs/adr/0008-test-data.md)): no PDFs other than
  the generated sample, no page images, no text, titles or move lists taken from a real book, not even
  in tests, fixtures or docs. Real books stay outside the repository, named by a local path, and
  `corpus/` is ignored. Results on real books are recorded as aggregate numbers only.
- **Nothing leaves the reader's computer without their consent.** AI reading and the coach send only
  after the reader agrees for that destination, and say exactly what goes. Never add a call that sends
  book content, notes or keys anywhere else.
- **No secrets.** Never write an API key, token or password into code, tests, docs or commits.
- **Moves are never taken on trust.** Every move from a model, a file or a reader is played again with
  the rules of chess before it reaches the board.
- **Names that hold saved data never change** ([ADR-0020](docs/adr/0020-living-chess-book-name.md)):
  the browser database `chess-coach`, the `chess-coach.` setting keys, the notebook's channel
  `chess-coach.notebook`, the helper's folder `~/.config/chess-coach/`, and the desktop shell's
  identifier `org.livingchessbook.app` once a build is released. Files of the kinds
  `chess-coach-analysis` and `chess-coach-notebook` stay readable, and the overlay and notebook formats
  change only with a way to read what was saved before.
- **GPL-3.0-or-later**, because of chessground and Stockfish. Check a new dependency's licence first.

## Where things are

| Path | What is there |
|---|---|
| `src/core` | Pure logic with tests: moves, the overlay, the notebook, guessing, practice, sharing files |
| `src/vision` | Finding diagrams and reading their pieces |
| `src/pdf`, `src/analysis` | Reading PDFs, and analyzing a book in a worker |
| `src/llm` | Providers, prompts, cost and time estimates, AI reading |
| `src/app` | The React app. `App.tsx` wires the screen together |
| `server/chatgpt` | The local helper for a ChatGPT plan, run inside `npm run dev` |
| `tests` | Vitest tests, named after what they cover |
| `scripts` | Measuring scripts, asset copying, and building and serving the extension |
| `extension` | The extension's own files, such as the script that opens the app in a tab |
| `docs` | SPEC, PLAN, ADRs and measured results |
| `docs/store` | The Chrome Web Store listing, its screenshots and promo tile |
| `docs/images` | Images for the README, taken from the sample book only |
| `docs/why` | Why Trail records, for decisions inside the code ([.why.json](.why.json)) |

## Writing for the app

- Every word on screen goes through `t()`. English is the key, and the Turkish line goes in
  `src/app/i18n.ts`, which the compiler checks. Messages from elsewhere go through `tm()`.
- Comments explain why, in plain English. The code says what.
- The owner writes in Turkish. Answer them in Turkish; the code, comments and docs stay in English.
