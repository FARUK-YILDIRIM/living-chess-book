# ADR-0012: Use a ChatGPT plan through a local helper, without an API key

Status: Accepted (2026-11-05, requested by the project owner). Extends
[ADR-0010](0010-optional-llm-line-repair.md).

## Context

The owner asked for a way to use AI reading with a subscription instead of an API key.

- **OpenAI** offers [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)
  for open-source and locally run apps. It is a preview, and it accepts images.
- **Anthropic** does not allow a third-party app to offer Claude login or route requests
  through a subscription. **Google** treats using Gemini CLI's sign-in from other software as
  a violation. Neither is offered here.

OpenAI's rules shape the design. Tokens must stay out of browser storage, and sign-in needs a
callback listener on `127.0.0.1`. A web page can do neither. OpenAI's DevKit would handle both,
but its code is under a noncommercial licence that does not fit this GPL project, and it is
not published on npm.

## Decision

**A local helper.** A small Node.js program holds the sign-in, the tokens and the requests to
OpenAI. The page only sees whether a reader is signed in, their email, and the models. For now
the helper runs inside `npm run dev`, which needs no new system tools.

**Our own code for a documented protocol.** It follows OpenAI's published contract, and reuses
no DevKit code. ID tokens are checked with the MIT-licensed `jose`.

**Tokens** are in a file with owner-only permissions under `~/.config/chess-coach/`, as OpenAI
describes. They never reach the page, a URL or a log. Signing out revokes them at OpenAI.

**The helper refuses web pages and other computers.** Each request must come from this
computer, name it as its host, come from this app's origin, and carry a custom header, so that
a web page open in another tab cannot use a reader's plan. This does not stop another program
running on the same computer, which could also read the reader's files. That is why this
should not run on a shared computer.

**Consent is unchanged.** Each run shows what is sent and needs its own tick. The app says when
a plan is in use and links to Manage usage, following OpenAI's guidelines.

**No resending at a cost.** A plan limit stops the run at once, and what was read is kept. Only
short outages are retried, within limits. OpenAI does not fall back to other billing.

## Alternatives

- Tokens in the page: against OpenAI's rules.
- Requiring the Tauri shell now: needs Rust, and it is not compiled yet.
- Running a reader's `claude` or `gemini` command from the app: a grey area under those
  providers' terms, and not something to ship without asking them.
- Reading tokens from other apps' files: against their terms, and it could cost a reader their
  account. Never.

## Consequences

- This does not work in a plain static build or the Tauri window until the helper ships with
  them.
- It has not been run against OpenAI with a real account. Only a stand-in has been used.
- It is a preview, so its rules can change. OpenAI's terms page could not be read while this
  was built, and a person must read it before anything is distributed.
- The button uses OpenAI's required wording, without the logo. Approved assets come under
  OpenAI's brand rules, and need checking before release.

## Later (2026-11-08)

The browser extension cannot run the helper, so it does not offer the ChatGPT plan
([ADR-0021](0021-browser-extension.md)). Only `npm run dev` does.
