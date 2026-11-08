# ADR-0015: A coach that answers from the engine and the page

Status: Accepted (2026-11-05, requested by the project owner). Follows
[ADR-0013](0013-living-book-study-workspace.md), and builds on the providers of
[ADR-0010](0010-optional-llm-line-repair.md) and [ADR-0012](0012-chatgpt-plan-through-a-local-helper.md).
It has been run against DeepSeek: see [spike-results.md](../spike-results.md). Other providers have
not been tried.

## Context

The owner wants to talk to an AI about the book and the position, in one place with their notes.
Language models make confident mistakes in chess, and a study tool that teaches wrong moves is
worse than none.

## Decision

**The stream is the chat.** A question and its answer are one notebook entry, tied to the page and
position like a note, in the same stream. Since [ADR-0018](0018-side-notebook-and-coach-window.md) they
are asked and read in a window of the coach's own.

**What it knows.** Each question sends the page number, position, legal moves, the book's line, the
moves that follow it, Stockfish's lines, the reader's notes on this position, the last four
exchanges and any selected text. Moves the app doubts are marked. While the reader is guessing, the
moves that follow, the engine lines and the page text are left out, and the model is told to give
hints without naming the move. During practice the coach cannot be asked.

**It does not calculate by itself.** Stockfish runs for about two seconds before each question, and
also looks at any legal move named in the question, written the English or Turkish way. Material
and checks are counted and given to it. If the engine has crashed, the question goes without it.
The instructions tell the model to rely on these, and to say so when it has no lines.

**Moves are checked, and never taken on trust.** Lines come back in double brackets and are replayed
with the rules of chess from the entry's position, each time they are shown. A legal move can be
clicked. One that fails is struck through with a warning, as is all that follows it, and it never
reaches the board. A move named in a sentence is clickable if it is legal now. If not, it is only
marked, with no warning, since a real model used these for moves later in a plan. A bare square
such as `e4` that is not a legal move is left alone, because it may only name the square.

**Sending needs agreement.** Nothing goes out until the reader agrees to the named destination, and
agreeing sends nothing by itself. This lasts until the app closes or the destination changes, including back to
one agreed to earlier. Page text is a separate box, off by default, and it too is for one
destination. The exact text last sent can be read in the coach's window. Book text is marked as data in the
instructions, so that a sentence in a book cannot steer the model.

**Selecting text.** The page has an invisible text layer from pdf.js, so words can be selected. A
small menu offers "Explain" and "Take note". Only the places are saved, as boxes on the page, and
drawn as marks. The selected words stay in memory, shown above the box, until they are used, removed
or the page is turned. They go out only with a question asked while they are shown.

**Same providers.** A `freeText` flag on the existing reader turns off the JSON schema, including
through the local ChatGPT helper. Each answer shows its tokens, and its price if known.

## Alternatives

- A separate chat tab: simpler, but it loses the link between an answer and its position.
- Tool calls so that the model can ask the engine for itself: closer to a real coach, but it would
  differ for each provider, and not all of them support it. Giving the lines up front works for all.
- Streaming answers: better to watch, but three different stream formats to test without a real
  provider. It is left for after a real trial.
- Saving the selected words with the note: easier to read back, but it stores book text.

## Consequences

- The coach costs the reader money, or plan usage, and needs their own provider.
- The rules catch illegal moves, not bad advice: a legal move can still be a poor one, and the
  model's reasoning is not checked. The engine lines reduce this, but do not remove it.
- An answer may quote the book, though it is told not to. The answer is saved and can be exported,
  so an export can hold a few of the book's words.
- Text comes from the PDF's text layer, so a poor OCR layer makes poor selections.
