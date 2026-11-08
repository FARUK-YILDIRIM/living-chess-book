# ADR-0003: Show the original page with a clickable overlay

Status: Accepted

## Context

Books can be re-typeset into a new reader, or shown as they are. OCR text in real
books is badly damaged around chess symbols, so reflowed text would look broken.

## Decision

Render the original PDF page with pdf.js. Draw invisible, clickable regions over
moves and diagrams, using coordinates from the text layer and diagram detection.

## Consequences

- The author's layout stays intact, and damaged OCR is never shown to the reader.
- A wrong move sits beside the printed move, so it is easy to spot and correct.
- Book text never needs to be stored, which supports
  [ADR-0006](0006-overlay-data-model.md).
- There is no text resizing or reflow on small screens.
