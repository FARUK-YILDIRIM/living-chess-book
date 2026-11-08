# ADR-0004: Deterministic extraction first, LLM only as a later fallback

Status: Accepted. Amended by [ADR-0010](0010-optional-llm-line-repair.md), which adds the
fallback described below at the owner's request.

## Context

The owner's vision has AI doing the conversion, with users bringing their own
provider. Sending every page to a model costs the user money, sends book content
to a third party, and can produce confident errors. The feasibility spike ran with
no LLM at all.

## Decision

- The P1 pipeline makes no network calls.
- Items it cannot resolve go to the review queue instead of being guessed.
- A later phase may add a provider for unresolved items only, with a cost estimate
  shown and the user's consent first. Provider capabilities (chat, vision,
  embeddings) will be optional, since not every provider offers each one.

## Consequences

- P1 is free to run, private, and works offline.
- This narrows the "fully AI" goal for P1. The owner should confirm this decision.
- Hard pages depend on the review queue until the fallback exists.
