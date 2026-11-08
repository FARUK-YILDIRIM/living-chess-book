# ADR-0006: Store an overlay keyed by the PDF hash, never the book

Status: Accepted. Overlays are unchanged, but the app now also keeps a private local copy of
each PDF outside them: see [ADR-0011](0011-library-and-saved-settings.md).

## Context

Users should eventually share processed books. Sharing a book's text would spread
copyrighted content, and publishers license this kind of content for a reason.

## Decision

- A book is identified by the SHA-256 of its PDF bytes.
- Analysis is stored as an overlay: diagrams (FEN, page, box), move trees (SAN, FEN,
  page, box, confidence) and user corrections.
- The overlay holds no prose and no page images. OCR tokens stay in memory during
  analysis and are not persisted.
- An exported overlay only works alongside the reader's own copy of the PDF.

## Consequences

- Sharing can come later without a data migration.
- Different scans or editions have different hashes, so an overlay will not match
  them. Fuzzy matching is future work.
- Whether move sequences and selections can be shared freely is a legal question.
  This design reduces the risk but does not settle it, so sharing must get legal
  review before it ships.
