# ADR-0020: Name the project Living Chess Book

Status: Accepted (2026-11-07, chosen by the project owner). Ends the working name `chess-coach`.

## Context

"Chess Coach" was a working title. It is generic, likely shared with other apps, and names one of the
app's tools rather than what the app is: a chess book that comes alive on one screen, with its own
pages, a live board, a notebook, an engine and a coach ([ADR-0013](0013-living-book-study-workspace.md)).

## Decision

- The app is **Living Chess Book**, and its package is `living-chess-book`. The repository takes that
  name when it is published. The local folder can be renamed at any time.
- The name shows in the window title, the library, the desktop shell, the sign-in pages of the local
  ChatGPT helper, and the kinds of shared files.
- **Names that hold saved data keep the working name**, since readers see none of them and renaming
  would leave what they saved behind:
  - the browser database `chess-coach`, and the `chess-coach.` keys of saved settings and drafts;
  - the helper's folder `~/.config/chess-coach/`, which holds this computer's id with OpenAI, sent as
    `ext_agent_host_id`, and any signed-in accounts.
- The notebook's channel between windows keeps its name too. It holds no data, but windows of builds
  before and after the rename would otherwise stop keeping in step.
- **The desktop shell's identifier is `org.livingchessbook.app`.** It decides where the shell keeps its
  saved data, so it must not change once a build has been released. The shell has not been built yet,
  so nothing is lost by setting it now. The domain it suggests has not been checked or registered.
- Analysis and notebook files saved under the working name are still read. Files saved now carry the
  new kinds, which a build from before the rename refuses. No build has been released, so no reader has
  one.
- The coach keeps its name. It is one tool in the app, not the app.

## Consequences

- Availability of the name on GitHub, in app stores and as a trademark was not checked by this change.
