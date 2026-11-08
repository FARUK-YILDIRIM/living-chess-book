# ADR-0007: License the project under GPL-3.0

Status: Accepted (confirmed by the project owner on 2026-11-08, before publishing).

## Context

Licences checked on GitHub on 2026-11-04: chessground and Stockfish are GPL-3.0.
chess.js is BSD-2-Clause,
react-chessboard is MIT, ts-fsrs is MIT.

## Decision

Use GPL-3.0-or-later and chessground for the board.

## Alternatives

MPL-2.0 or MIT would allow more reuse, but would rule out chessground, and with it
reuse of code from other GPL chess projects. react-chessboard would be the MIT-compatible
choice if the owner prefers a permissive licence.

## Consequences

Derivatives must stay open source. Stockfish can be added in a later phase under
the same terms. This is an engineering reading of the licences, not legal advice.

## Later (2026-11-08)

The owner confirmed GPL-3.0-or-later before the code was published. Licences of what the app
uses now: chessground GPL-3.0-or-later and Stockfish GPL-3.0, which set the project's licence;
chess.js BSD-2-Clause; pdf.js and the Anthropic SDK Apache-2.0; React and jose MIT. All of these
can be combined under GPL-3.0.

A store copy of the extension must say where its source is, and carry the notices that chess.js
and pdf.js ask for. Whether the GPL fits Apple's App Store terms is disputed, so a Safari version
needs its own look.
