# ADR-0011: A library of books, and settings that can be remembered

Status: Accepted (2026-11-05, requested by the project owner). Amends
[ADR-0010](0010-optional-llm-line-repair.md) on keys. Adds to
[ADR-0006](0006-overlay-data-model.md), which still holds for overlays.

## Context

The owner asked for a menu of the books a reader has already processed, and a settings menu
for entering AI keys. Until now a reader had to find the PDF again each time, and typed a key
for each book.

## Decision

**Library.** Opening a book adds it to a library on the first screen, with a small picture of
its first page, its name, its counts and the last page read. One click opens it again.

**A private copy of each book.** So that one click is enough, the app keeps a copy of the PDF
in its own local storage. A browser cannot reopen a file by its path, and the desktop shell
does not run yet. The copy, the picture and the name stay out of the overlay, so exports stay
free of book content as ADR-0006 requires. Removing a book deletes its copy and its analysis,
and never touches the original file.

**Settings.** One dialog, reachable from the library and from a book, holds the provider, the
model and one key per provider. Choosing a provider and model is saved. Changing the "Other"
address clears its key, so that a key never goes to an address it was not typed for.

**Keys are remembered only if asked.** By default a key lasts until the app closes. A reader
can tick a box to remember keys on this computer, and can forget them at any time. Remembered
keys are encrypted, so they are not in plain text in the app's files. The "Other" address is
sealed with them, and its key is dropped if the address differs. A run stops if its settings
change.

Consent is unchanged: each AI run still shows what is sent and needs its own tick.

## Alternatives

- Asking for the file again each time: keeps no copy, but defeats the point of a library.
- Remembering the file's location: not possible in a browser, and only in some of them with
  a permission prompt. Worth revisiting when the Tauri shell runs.
- Saving keys in plain text, or remembering them by default: easier, but a key is worth money
  to whoever finds it.

## Consequences

- Books take up disk space, about the size of each PDF.
- The private copy goes away if the reader clears the app's data, along with the analysis and
  corrections.
- The encryption is modest. Its key is in the same database, so it stops a casual look at the
  files, not code running in the app or someone determined with access to the account. The
  operating system's keychain remains the goal once the Tauri shell runs, and the app tells
  readers not to use this box on a shared computer.
