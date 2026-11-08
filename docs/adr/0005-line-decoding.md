# ADR-0005: Decode whole lines, and learn each book's print

Status: Accepted. Accuracy on real books is recorded in
[spike-results.md](../spike-results.md).

## Context

OCR layers damage chess notation badly: piece symbols turn into strings like `.Q.`
or vanish, and move numbers split apart. Parsing one move at a time also accepts
moves that are legal but wrong. Generic piece art did not match real printed
diagrams: in the spike it gave no exact boards at all.

## Decision

**Moves.** A beam search looks for the likeliest sequence of legal moves over a whole
line, so later moves settle earlier ones. Unreadable tokens are skipped, lost replies
are filled in, and both are flagged. Bold print is treated as a hint for the main line,
not a rule, since it is measured from a scan.

**Symbols.** Each book's damaged symbols are learned from moves that were not in doubt,
over repeated passes.

**Diagrams.** The app groups the book's own printed pieces by shape, then names each
group from generic art and chess rules (each piece type gets a group, pawns never stand
on back ranks, a position has one king per color). Readers can correct a name on the
Pieces tab.

## Alternatives

- Sending pages to a vision model: costs money, sends book content away, and is
  unreliable for reading diagrams ([ADR-0004](0004-deterministic-first.md)).
- A trained neural classifier: would generalize further, but needs a licensed training
  set and a runtime. Worth revisiting if more books defeat the current method.

## Consequences

- No training data or network access is needed.
- Analysis is slower than single-move parsing, so it runs in a worker with progress.
- Pieces that never appear on a light square in a book cannot be calibrated.
- Thresholds were tuned on one scanned book, and overfit it: 75.6% on the lines used for
  tuning, 51.2% on lines kept apart. This decision may need revisiting.
- The same method reads a digital book far better, because its text is clean. See
  [spike-results.md](../spike-results.md).
