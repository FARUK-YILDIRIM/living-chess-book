# ADR-0019: Sharing analyses and notebooks, and choosing AI reading when a book is added

Status: Accepted (2026-11-06, requested by the project owner). Builds on
[ADR-0006](0006-overlay-data-model.md), [ADR-0010](0010-optional-llm-line-repair.md) and
[ADR-0013](0013-living-book-study-workspace.md).

## Context

The owner wants readers to choose, as they add a book, between the app's own reading and AI
reading, knowing what it costs and how long it takes. They also want a book to be analyzed once and
the result passed between people. The notebook had no backup either, and a browser profile was
found empty after the app moved folders.

## Decision

**A choice when a book is added.** A new PDF asks "Quick, and free" or "With AI, more accurate and
paid". The app's own reading always runs first, since AI reading starts from its diagrams and its
doubts, and only then can the exact cost be known. After it, the AI reading tab opens with every line
chosen, the cost and an estimate of time, and the usual box to agree. Nothing is sent before that.
The AI choice needs a provider set up in Settings. When a quickly read book has doubts on more than
one move in twenty, the app suggests AI reading.

**Time is estimated** from the number of stretches, three read at a time, and a measured time per
stretch for DeepSeek, about 50 seconds. Other models are guessed at 20 seconds.

**Files to share and to keep.**

- An analysis file holds the overlay: moves, positions and places on pages, and no text or images of
  the book. It fits only the PDF with the same SHA-256 and page count, and says so when it does not.
  Another scan or edition is another file.
- Nothing in it is trusted. Each move is played again from its diagram, and a move that breaks the
  rules is left out with those after it, and its place is listed to check. A diagram's problems are
  worked out again. The structure is checked as before ([ADR-0006](0006-overlay-data-model.md)).
- An imported analysis replaces the current one. If the reader corrected moves, the app asks first.
  Notes stay, and find their places again as after a new analysis.
- A notebook file holds the reader's entries and solved diagrams. Restoring adds the entries it
  lacks and changes none it has. It too fits only the same PDF.
- Files saved by the earlier "Export moves" can still be imported.

## Alternatives

- A shared online library of analyses: easier to find, but it needs a server, and distributing every
  book's lines widely raises questions a file passed between two readers does not.
- Matching another copy of a book by its text: would let editions share, but a wrong match would put
  moves in the wrong places.
- Merging an imported analysis with the reader's corrections: keeps more, but conflicts would need a
  way to choose that no reader asked for yet.

## Consequences

- Two readers can share an analysis only if they have the very same file.
- The estimate of time is rough, and a provider's limits can make a run longer.
- An analysis passed around carries a book's lines of moves, though no text. Readers should share
  them only where that is fine.
