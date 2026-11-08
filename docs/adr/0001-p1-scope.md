# ADR-0001: P1 is only the PDF-to-interactive-book product

Status: Replaced by [ADR-0013](0013-living-book-study-workspace.md) (2026-11-05). Accepted
2026-11-04, decided by the project owner.

## Context

The wider idea has three features: interactive books, a live coach on an empty
board, and analysis of the user's online games. Interactive books are the feature
that sets the project apart, and the hardest one.

## Decision

P1 delivers only the interactive book. The board exists in P1 because the book
needs it. Coach and game analysis are later phases.

## Consequences

- There is no early release from the easier features, so extraction quality
  decides whether P1 is viable.
- The board, move tree and position index built here are reusable later.
