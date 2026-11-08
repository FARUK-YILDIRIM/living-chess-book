# ADR-0013: The product is a study workspace built on the reader's own book

Status: Accepted (2026-11-05, decided by the project owner). Replaces the scope in
[ADR-0001](0001-p1-scope.md). Keeps [ADR-0006](0006-overlay-data-model.md) and
[ADR-0008](0008-test-data.md).

## Context

ADR-0001 limited the project to making a PDF clickable. The owner has now set a wider goal: a
single screen where a reader works through their own book, takes notes, saves positions and
talks to an AI about the book and the position, so that a static book becomes a place to
improve.

## Decision

**One screen, with everything tied to what the reader is looking at.** The app always knows the
book, the page and the position on the board. Notes, saved positions and later questions attach
to that moment by themselves, and a click returns to it. Notes, positions and chat share one
stream, the study notebook, with one place to type.

**The PDF is never changed.** All of this sits on top of the untouched file, so a reader's work
can be kept, moved and removed apart from the book.

**The notebook is stored apart from the analysis.** It has its own store, keyed by the PDF hash,
so that analyzing a book again cannot erase it. An entry remembers its page and position as well
as the move it was written on. Move ids can change between analyses, so a stored id counts only
if it still leads to the same position. Otherwise the app looks on that page for a move with
that position, and failing that shows the saved position itself. A reader always gets back what
they saw.

**Notes hold the reader's words, not the book's.** An entry stores a page number, a position, a
move label and what the reader typed. Selecting text on the page stores where it is, and none of
its words: see [ADR-0015](0015-coach.md).

**The app must be worth using with no AI and no key.** The order of work is:

1. The notebook and saved positions, with no AI.
2. A local chess engine, and a mode that hides the next move so the reader finds it first.
3. The coach: chat, and "explain this" on a position or a passage. This first needs a trial
   against a real provider, which has never been run.
4. Bringing saved positions back for repetition.

**The coach will not be trusted to calculate.** Language models make confident mistakes in chess.
The coach will answer from the engine's lines and the book's page, and every move it names will
be checked for legality before it is shown. What it sends will stay visible and consented to, as
with AI reading. Steps 2 and 3 each get their own ADR.

## Alternatives

- Writing notes into the PDF as annotations: other apps could read them, but it changes the
  reader's file, gives a new hash and so loses the analysis, and cannot hold positions or chat.
- Separate tabs for notes, positions and chat: simpler to build, but a reader must decide where
  something goes before writing it, and they lose the link between them.
- Keeping notes inside the overlay: one record per book, but overlays are shared and replaced by
  design, and notes are neither.
- Starting with the coach: more striking, but it has the most risk, costs the reader money and
  rests on a connection that has not been tried.

## Consequences

- Chat, the engine, repetition and the coach are now in scope. Game import stays out.
- Removing a book also removes its notebook, so the app says so before removing it.
- Notes are as safe as the app's local storage until backup exists. Export writes a readable file
  that cannot yet be imported again. It holds no book text, but its title names the PDF file, so
  it is for the reader's own use.
- Two windows on one book stay in step for saved notes, but share one unsaved draft, and an edit
  from a window that has not caught up yet can overwrite a newer one.
- On a scanned book without AI many moves are missing or wrong. Notes still work there, attached
  to the page, but the coach must not rely on doubtful moves.
