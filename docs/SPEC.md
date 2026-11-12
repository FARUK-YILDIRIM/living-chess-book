# Spec: a study workspace built on a chess book PDF

Name: Living Chess Book, with the package `living-chess-book`. The repository takes that name when it is published ([ADR-0020](adr/0020-living-chess-book-name.md)).

## Objective

A chess player opens a PDF of a book they own, and it becomes a place to study. The app finds the
diagrams and moves, and shows the original page next to a live board. On that one screen the
reader can follow the book, try their own moves, take notes, save positions and, later, talk to
an AI about the page and the position. See [ADR-0013](adr/0013-living-book-study-workspace.md).

The user's words: what used to be static now moves, and it is a perfect place to work for people
who love chess.

## User flow

1. Open a PDF.
2. The app analyses it locally and shows progress.
3. Read the book: original page, live board and study notebook on one screen.
4. Click a diagram or move: the board jumps to that position.
5. Step through the line with the arrow keys, and try moves on the board.
6. Type a note, or save the position. It attaches to the page and position by itself.
7. Click anything in the notebook to return to that page and position.
8. Turn on the engine to see its lines, or solve a diagram or guess the book's moves with what
   follows covered. A wrong move gets the engine's view, and a move found only after a wrong try, or
   shown, comes back later for practice.
9. Ask the coach about the position or a selected passage, and click the moves in its answer.
10. Practise saved positions when they come back.
11. Review what the app was unsure about, and correct it. Correct any diagram from the board too,
    since one read wrongly but with confidence is never in the review queue.
12. Reopen the book later with the analysis, corrections and notebook intact.

## In scope now

- PDFs with a usable text layer, including OCR layers over scans.
- Algebraic notation, with letters or figurines.
- Diagram detection and diagram-to-FEN recognition.
- Main lines and side lines, kept as a move tree.
- A review queue for low-confidence items.
- Local persistence, and an overlay export that contains no book text.
- A study notebook that needs no AI, and a notes export that contains no book text of the app's
  own making. A coach's answer in it is the model's words.
- A local chess engine, and a mode for guessing the book's moves
  ([ADR-0014](adr/0014-local-engine-and-guessing.md)).
- A coach for questions on a position or passage, which needs the reader's own provider
  ([ADR-0015](adr/0015-coach.md)).
- Practice of saved positions ([ADR-0016](adr/0016-practice-of-saved-positions.md)).
- Progress through a book's diagrams ([ADR-0017](adr/0017-active-study-loop.md)).
- Optional AI reading ([ADR-0010](adr/0010-optional-llm-line-repair.md)).

## Out of scope

OCR of PDFs with no text layer, descriptive notation, overlay sharing as a service, importing
games from chess websites. Analysis makes no LLM calls.

## Success criteria

Measured on a hand-checked chapter of a real book, kept out of the repository:

| Measure | Target |
|---|---|
| Moves correct, or flagged for review rather than silently wrong | at least 95% |
| Diagrams with an exact FEN | at least 95% |
| Invalid diagrams flagged | 100% |

Being legal is not the same as being correct, so accuracy is only ever reported
against hand-checked data. Automated tests use original synthetic books.

For the notebook:

- No note is lost when a book is analyzed again, or when a page is reloaded.
- Clicking an entry always brings back the page and the position it was written on.

For the coach:

- No move reaches the board without passing the rules of chess from that position.
- Nothing is sent before the reader has agreed for that destination, and book text only if asked.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run dev
npm run build
```

## Boundaries

- Always: pure logic in `src/core` with tests, and every claim backed by a run.
- Ask first: new system-level tools, pushing, publishing, or sending book
  content to any network service.
- Never: commit a copyrighted book or text derived from one, or log API keys.
