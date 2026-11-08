# ADR-0017: A study loop built on solving the book

Status: Accepted (2026-11-05, requested by the project owner). Builds on
[ADR-0014](0014-local-engine-and-guessing.md) and [ADR-0016](0016-practice-of-saved-positions.md).

## Context

Guessing, the engine and practice existed apart. Guessing called every other move wrong, though the
move may be good. Prose below a diagram gave away its answer. Practice held only what the reader
chose to save, and nothing led from one diagram to the next. Coaches advise solving a book's
positions before reading on, and evidence favors deliberate practice over play, though I found no
study that compares ways of studying a book.

## Decision

**A move that is not the book's gets the engine's view.** The engine compares it with the book's
move for a second, and says how much it costs, without naming the book's move. Within 0.3 of a pawn
it counts as as good as the book's, and does not lose the first-try credit. Up to one pawn is
playable, up to three is worse, and beyond that is a serious mistake.

**The page follows the reader.** While guessing, the rest of the current row and everything below it
are covered, and later pages entirely. The words and moves underneath cannot be selected or reached
by keyboard, so they cannot go to the coach either. The cover moves down as the reader does, and comes
off at the end of a line, or at any time by choice. Clicking a diagram that has moves offers "Solve".

**What is missed comes back.** A move found only after a wrong try, or shown, saves that position
for practice in ten minutes. Missing a move in practice does the same. Knowing it then starts the
waits at one day. The notebook says it is a move the reader missed. A position already saved keeps
its note and its label, but its schedule starts over.

**Progress and the next step.** Finding the first move from a diagram marks it solved, with a tick
on the page. "Contents" shows solved diagrams against the total, chapter by chapter if the PDF has a
table of contents, and leads to the next unsolved diagram. So does the end of each line. Solved
diagrams are recorded by page and position, in the notebook, so that a new analysis keeps them.

## Alternatives

- Grading a guess by the engine alone: a reader studying a book wants the author's idea too, so the
  book's move stays the goal, and the engine only says how far off another move is.
- Covering the whole page: safe, but it hides the words the reader has already reached.
- Asking before adding a missed position: one more decision in the middle of thinking. It can be
  deleted from the notebook.

## Consequences

- A second of engine time for each wrong try, on the reader's own computer.
- The cover works by rows, so a book set in two columns can hide too much or too little.
- The grades come from a short search by a small engine, so they are a guide. It can misjudge sharp
  positions.
- A misread book move can mark a good move as a mistake. Doubtful moves still say so.
- Solved means the first move was found, which is less than having understood the line.

## Later (2026-11-06)

A card under the board now says what to do next: the diagram on the board while it is unsolved, and
otherwise the next one from the page being read, with the count solved. It was found that the way to
the next diagram was only in the contents menu. A book also opens with the board where it was left,
when the analysis still has that move or diagram.
