# ADR-0002: Tauri shell with a TypeScript core

Status: Accepted. The shell is not yet compiled, see Consequences.

## Context

The app must run on macOS, Linux and Windows. The owner is strongest in
TypeScript, and the key libraries (pdf.js, chess.js, chessground) are JavaScript.
An earlier suggestion was to put all heavy work in Rust.

## Decision

- Tauri 2 for the desktop shell, React and TypeScript for the UI.
- All domain logic lives in `src/core` as TypeScript with no DOM or Tauri imports.
- Rust stays thin: window, file access, and later the Stockfish sidecar.

## Alternatives

- Electron: needs no Rust, but ships a whole browser. Kept as the fallback if
  WebKitGTK causes real problems on Linux.
- Rust core: faster, but slower to build and adds a language boundary with no
  measured need.

## Consequences

- The app also runs in a plain browser, which makes testing easy.
- Rust was not installed on the development machine when this was written, so
  `src-tauri` has not been compiled until a later note here says otherwise.
- WKWebView, WebView2 and WebKitGTK differ, so all three need testing before release.

## Later (2026-11-08)

The desktop shell is on hold. The app reaches readers as a browser extension first
([ADR-0021](0021-browser-extension.md)).
