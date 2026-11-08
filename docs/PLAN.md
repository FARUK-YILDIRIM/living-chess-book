# Plan

Each task is one commit or more, with tests first where the logic is pure.

| # | Task | Status |
|---|---|---|
| 1 | Scaffold, licence, docs | Done |
| 2 | Word merging and token parsing | Done |
| 3 | Line decoder with learned glyphs | Done, accuracy below target |
| 4 | Board detection and square classification | Done |
| 5 | Linking lines to start positions | Done, accuracy below target |
| 6 | Overlay model and move tree | Done |
| 7 | PDF adapter and pipeline | Done |
| 8 | Local evaluation script | Done |
| 9 | Reader UI | Done, tried in a browser |
| 10 | Review queue and persistence | Done, the Check tab is too long on a real book |
| 11 | Tauri shell | Written, not compiled because Rust is not installed |
| 12 | Independent review and fixes | Done, open items below |
| 13 | Status report | Done, see [spike-results.md](spike-results.md) |
| 14 | Optional AI reading ([ADR-0010](adr/0010-optional-llm-line-repair.md)) | Done, not yet run against a real API |
| 15 | Library and settings ([ADR-0011](adr/0011-library-and-saved-settings.md)) | Done, tried in a browser |
| 16 | ChatGPT plan through a local helper ([ADR-0012](adr/0012-chatgpt-plan-through-a-local-helper.md)) | Done, not yet run with a real account |
| 17 | Reading digital books | Done, measured on one book |
| 18 | First steps for a reader: Turkish, visible moves, hint, simple top bar, sample book | Done, tried in a browser |
| 19 | One progress bar with time left, a leave warning and a clear result | Done, tried in a browser |
| 20 | Study notebook and saved positions ([ADR-0013](adr/0013-living-book-study-workspace.md)) | Done, tried in a browser |
| 21 | Local engine and guessing ([ADR-0014](adr/0014-local-engine-and-guessing.md)) | Done, tried in a browser |
| 22 | Coach, and selecting text on a page ([ADR-0015](adr/0015-coach.md)) | Done, tried with DeepSeek |
| 23 | Practice of saved positions ([ADR-0016](adr/0016-practice-of-saved-positions.md)) | Done, tried in a browser |
| 25 | DeepSeek, and fixes to the coach from reading its real answers | Done, tried with DeepSeek's API |
| 26 | Study loop: engine view of moves, covering what follows, solving diagrams, missed moves in practice, progress ([ADR-0017](adr/0017-active-study-loop.md)) | Done, tried in a browser |
| 24 | Simpler reader: one row of controls, reading fixes moved aside, a question at each doubtful move, flip, zoom, keys, a library that says where to continue | Done, tried in a browser |
| 27 | Notebook only at the side, a window for the coach that can be moved, a simpler top bar, a way out of practice at the top, fixing the reading at the side one place at a time, and selecting one line of a page without running to its end ([ADR-0018](adr/0018-side-notebook-and-coach-window.md)) | Done, tried in a browser with a stand-in for the provider |
| 28 | A card that says what to do next, a book that opens with the board where it was left, and the whole page in view by default | Done, tried in a browser on the sample book |
| 29 | Engine panel: words, a bar, arrows, preview, numbered lines, the book's move against the engine's, threats, a graph of the line, hint mode, asking the coach about a line, and a choice of lines and of the full engine ([ADR-0014](adr/0014-local-engine-and-guessing.md)) | Done, tried in a browser on the sample book |
| 30 | Choosing AI reading when a book is added, an estimate of time, importing an analysis or a notebook from a file ([ADR-0019](adr/0019-sharing-analyses-and-choosing-ai-at-start.md)) | Done, tried in a browser on the sample book, with nothing sent |
| 31 | Name the project Living Chess Book, keeping the names that hold saved data ([ADR-0020](adr/0020-living-chess-book-name.md)) | Done, tested, and seen in a browser |
| 32 | A Chrome and Edge extension that opens the app in a tab, with only unlimited storage, both engines, and no ChatGPT plan ([ADR-0021](adr/0021-browser-extension.md)) | Built, and loaded into Chrome 157 and Edge 157 without a window, with throwaway profiles |
| 33 | Ready for the Chrome Web Store: a link to the source in Settings, the notices of every bundled package in the package, a privacy policy, the store listing, screenshots of the sample book and a promo tile ([ADR-0021](adr/0021-browser-extension.md)) | Done, built, and the screenshots taken from the extension in Chrome 157 |

## Open items

- Have a strong player judge the coach's answers. DeepSeek's have been read, but not by one.
- Try the coach with other providers. Only DeepSeek has run.
- Show the coach's answer as it arrives, instead of all at once.
- Check the page text and selected text on a scanned book. They come from its OCR layer, which can be poor.
- Run AI reading with Anthropic and with a ChatGPT account, and compare the bill with the estimate. DeepSeek has run on samples.
- Find out why a DeepSeek reply could not be read, and retry such a failure once.
- Sign in with a real ChatGPT account, and measure accuracy with its models.
- Read OpenAI's Sign in with ChatGPT terms, which could not be opened while building this, before anything is distributed.
- Use OpenAI's approved button assets, after checking its brand rules.
- Ship the local helper with the desktop app. It runs only inside `npm run dev` now.
- Let a reader choose among saved ChatGPT accounts, as OpenAI suggests. The helper keeps their registrations, but the app shows one.
- Have a person check a sample of the reference lines, which a model read.
- Read side lines with AI as well. Only main lines are read now.
- Stretches of text over more than three pages are left out of AI reading.
- Store keys in the operating system's keychain once the Tauri shell runs.
- Tauri's content security policy allows only known providers and this computer, so "Other"
  addresses will fail there with a general message.
- Text printed sideways on an upright page gets a wrong crop.
- Try more digital books. Only one has been measured, and its page layouts shaped the reader.
- Score moves in the browser as well as on the command line, since the two draw pages differently.
- Ask about a doubtful diagram where the reader meets it too, with a correction that needs no FEN. Moves already work this way.
- Keep analyzing when a reader leaves a book, instead of starting over.
- Reduce the AI reading tab to one suggestion, with Settings only when needed.
- Keep focus in step with the menu and confirmation bars in all paths, and test with a screen reader.
- Move accuracy on scanned books without AI. See [spike-results.md](spike-results.md).
- Try each AI provider from the extension, and click its toolbar button in a real window. Then send
  it to the Chrome Web Store with [docs/store/chrome-web-store.md](store/chrome-web-store.md), and to Edge.
- Firefox and Safari versions of the extension.
- Compile and try the Tauri shell on macOS, Windows and Linux, now on hold.
- Export uses a browser download, which is expected to fail inside the Tauri window. It
  needs the Tauri dialog and file plugins.
- A new analysis replaces a reader's corrections after asking first. It should carry them
  over instead.
- Piece names are not saved, so the Pieces tab is empty after reopening a book until it is
  analyzed again.
- Promotions other than to a queen cannot be read from a book or played on the board. So a book's underpromotion cannot be guessed.
- Analysis takes minutes, and should be faster.
