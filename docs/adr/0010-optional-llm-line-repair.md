# ADR-0010: Optional AI reading for lines the app could not settle

Status: Accepted (2026-11-05, requested by the project owner). Amends
[ADR-0004](0004-deterministic-first.md), and carries out the fallback it left for later.
[ADR-0011](0011-library-and-saved-settings.md) moves the key to Settings, and lets a reader
choose to remember it.

## Context

Reading moves from a damaged OCR layer reached 51.2% on lines kept apart from tuning, against
a target of 95% (see [spike-results.md](../spike-results.md)). The owner chose to add model
support next, rather than first trying a cleaner PDF. Their vision has users bring their own
provider.

A model can read a page image that OCR garbled, but it can also misread with confidence, it
costs money, and it sends part of a book to a third party.

## Decision

**Off until asked for.** Analysis still makes no network calls. A reader starts AI reading
from its own tab, with their own key, after seeing what will be sent and a cost estimate, and
ticking a consent box for that run.

**Only what is needed is sent.** One stretch of text at a time: an image cropped to that
stretch, and the starting position. Stretches with nothing in doubt, an invalid diagram, or a
reader's correction are left alone by default. A reader can choose all lines instead, because
the local reader can be wrong without flagging it.

**The model reads and the app checks.**

- Replies are JSON, and only move notation is kept.
- Every move is replayed from the diagram. An illegal move gets one retry with the legal
  moves as a hint. If it stays illegal, the line is cut there and flagged. A cut line never
  replaces a longer one.
- Moves are aligned with the OCR words by destination square. A move with a matching word
  gets that word's place on the page and counts as confirmed by two readers. A move with no
  match is kept but flagged.
- Moves keep a `source` field, so later runs leave reader and AI moves alone.

**Main lines only, for now.** Existing side lines are moved to the new main line where the
position still occurs. Otherwise they are removed and a note is left to check that place.

**Providers.** A narrow interface with two adapters: Anthropic through its official SDK, and
any OpenAI-compatible endpoint (for example OpenAI, Gemini, OpenRouter or a local Ollama)
through a single request. Keys stay in memory for the session and are never stored. A key is
sent only over HTTPS, or to this computer.

**Default model.** `claude-opus-5-5` for Anthropic, with cheaper models one click away. Prices
in the app are a dated estimate.

## Alternatives

- Sending whole pages or the whole book: costs more and shares more than needed.
- Asking the model for positions on the page: unreliable, and aligning with OCR words gives
  the same result and a second opinion.
- Saving keys in browser storage: readable by anything running in the page. An operating
  system keychain is the better place, once the Tauri shell runs.
- Trusting any legal move: damaged text can fit a legal but wrong move, which is what caused
  silent errors in the local reader.

## Consequences

- The "nothing is uploaded" promise now holds only while AI reading is off, so the app says so.
- Accuracy now depends on a third party, and varies by model.
- Parts of a book reach the chosen provider under that provider's terms. Readers are told, and
  should use it only with books they may share this way.
- The stored overlay still holds no book text ([ADR-0006](0006-overlay-data-model.md)).
- Tauri's content security policy lists the known provider hosts and localhost, so another
  endpoint needs that list changed.
