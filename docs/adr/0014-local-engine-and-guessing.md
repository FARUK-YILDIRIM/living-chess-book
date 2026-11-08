# ADR-0014: A local chess engine, and guessing the book's moves

Status: Accepted (2026-11-05, requested by the project owner). Follows
[ADR-0013](0013-living-book-study-workspace.md).

## Context

The study workspace needs something that can calculate, both for the reader and for the coach
that comes next. It also needs a way to study a book actively, instead of only reading it.

## Decision

**Engine.** Stockfish 19 from the `stockfish` npm package (GPL-3.0), in its small single-threaded
WebAssembly build of about 1.9 MB. It runs in a worker on the reader's computer and sends nothing
anywhere. It is off until the reader turns it on, since it uses the processor and gives away
answers. The copy script puts it and its licence in `public/engine/`, as it does for pdf.js.

**Nothing impossible reaches it.** Stockfish can crash on a position that cannot occur, and a
misread diagram often is one. `positionState` checks kings, pawns on the first and last ranks, the
number of pawns and pieces, and the side that just moved standing in check. The panel then says why
the engine is not running. A crash can pass silently, so a worker that goes quiet counts as failed.
It is then ended, and starts again only when the reader turns the engine off and on.

**Guessing.** The reader plays the book's moves on the board, starting from the position they
choose and for the side whose turn it is. The other side's moves are played for them. Moves still
to come are covered on the page and in the move list, and the engine is switched off. A side line
gets its own answer, since the move is not a blunder. If the app doubts its reading of the next
move, it says so.

## Alternatives

- The full 99 MB engine: much stronger, but too large for this. The small one is far stronger than
  a book's reader needs for checking a line, and a later setting could offer the other.
- The multi-threaded builds: they need special server headers, which the desktop shell and a plain
  web server would each have to set.
- Hiding the whole of the page while guessing: safe from spoilers, but it takes away the words the
  reader is studying.

## Consequences

- Words on the page can still give a move away, since only the moves the app recognized are covered.
- Moves the app failed to read stay visible, and a wrongly read move can mark a right guess as wrong.
- `node_modules` grows by about 200 MB, because the package holds every build. Only the small one
  is copied into the app.

## Later (2026-11-06)

The panel was redesigned at the owner's request:

- **In words and on the board.** A sentence says who stands better, a bar under the board shows it,
  and the best moves are drawn as arrows. Pointing at a move in a line shows the position after it on
  the board, without playing it. Moves are numbered as a book writes them.
- **The book against the engine.** When the board is on the book's line, the panel says whether the
  book's next move is the engine's choice, how far down its list it is, or how much it loses. A move
  outside the engine's best lines gets a search of its own, but only after the one on screen has
  finished, so the screen is not cut short.
- **Threats.** The engine can look at the position with the other side to move, to show what it
  threatens. Not while the side to move is in check, as that position could not occur.
- **A graph of the book's line.** Scores of positions already looked at deeply enough are kept, and
  the rest can be scored on request, one at a time. A click on the graph goes to that move.
- **Hint mode** hides the moves and arrows until asked for, and leaves the sentence and the bar.
- **A line for the coach.** Each line can be put into the coach's box. It is not sent by itself.
- **Settings:** one, three or five lines, arrows on or off, and the full engine build, about 99 MB,
  instead of the 1.9 MB one. Both are copied into `public/engine` before running, so a build carries
  both. The full one started in about a second on this computer.

While guessing or practising, the engine stays off, so none of this can give a move away.
