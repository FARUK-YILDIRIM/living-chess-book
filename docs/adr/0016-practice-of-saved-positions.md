# ADR-0016: Practising saved positions at growing intervals

Status: Accepted (2026-11-05, requested by the project owner). Follows
[ADR-0013](0013-living-book-study-workspace.md).

## Context

A saved position is only useful if it comes back. The owner's goal is for readers to improve from
their book, not only to read it.

## Decision

Every saved position gets a schedule. It first comes back after a day. Knowing it moves it along
waits of 1, 3, 7, 16, 35 and 90 days. Not knowing it brings it back in ten minutes and starts it
over, as [ADR-0017](0017-active-study-loop.md) added. When any are due, the
top bar shows a button with their number. During practice the same place holds the way out, Escape
does the same, and leaving goes back to the page and position the reader came from.

In practice the page, the notebook, the move list and the other tabs are closed, the engine is
off, and the coach cannot be asked. If the book has a move
from the position, the reader plays it on the board or asks to see it. If not, they think it
through and can then read their note. Then they say whether they knew it, and that decides the
next wait: the app never decides for them.

## Alternatives

- A scheduler that adapts to each reader, such as FSRS: better timing, but it needs a history of
  reviews to be worth it, and is hard to explain. The field names leave room to move later.
- Grading automatically from the first move played: quicker, but a book's move is not the only good
  one, and a misread move would count against the reader.

## Consequences

- Positions come back only for those who open the book. There are no reminders.
- A position from a misread line can ask for a wrong move. The reader sees the page afterwards and
  can say they knew it.
