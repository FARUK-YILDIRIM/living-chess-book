# ADR-0018: The notebook stays at the side, and the coach has its own window

Status: Accepted (2026-11-05, requested by the project owner). Changes where things sit on the screen
in [ADR-0013](0013-living-book-study-workspace.md) and how the coach is asked in
[ADR-0015](0015-coach.md). What the coach is sent, and how its moves are checked, stay as they were.

## Context

The owner tried the app and found that in a narrower window, or with the notebook closed, the
notebook fell under the board behind a tab, though a button at the top already opens it. The coach
was also hard to find: asking meant typing in the box for notes and pressing a second button, and a
long answer filled the notebook.

## Decision

**The notebook is only ever at the side.** The button at the top opens and closes it. In a window
1100 pixels wide or more it is a column of its own, and its state is remembered. In a narrower window
it opens over the page when asked for, so that the board stays in view, and it starts closed.

**Under the board are the moves**, and nothing else takes that place.

**Fixing the reading opens in the notebook's place**, so the page and board stay beside it. It shows one
place at a time, in reading order from the page being read. That place is marked on the page and shown
on the board, and dealing with it brings up the next. A diagram is corrected by placing pieces on a small
board, with FEN still there for those who want it. Closing goes back to where the reader was, with the
button or Escape. A run of AI reading carries on while it is closed.

**The coach has a button on the page, and a window that does not block anything.** The window opens
with the button, with C, or with Explain on a selection. It sits over the page and not the board,
because its moves play on the board. Agreement to send is a button at the top of the window, shown
before anything is typed, and it sends nothing by itself. Enter asks. A question that fails or is
stopped comes back to the box. Ready questions can be asked with one click.

**Answers are still notebook entries.** They are tied to their page and position and can be reached
from the notebook, where a long one starts short. A question goes into the window's own box, so the
box for notes only takes notes.

**While guessing, earlier answers are hidden in both places**, because they can name the move being
worked out. Answers given while guessing are shown in the window. During practice the button is gone.

**The bar holds what is used while reading:** contents, pages, practice when something is due, and
the notebook. Settings and fixing the reading moved to the menu.

## Consequences

- Saving a position no longer opens the notebook. The star shows that it is saved, and pressing it
  again goes to the entry.
- The coach's window covers part of the page while open. Its title bar moves it anywhere in the reader,
  and it stays there. A double click puts it back. The mouse is the only way to move it.
- In a narrow window the notebook and the coach's window can cover the whole page.
