# ADR-0009: Follow the Agent Skills development lifecycle

Status: Accepted (2026-11-04, requested by the project owner)

## Context

The owner asked to build this with Addy Osmani's agent-driven development loop,
published as [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills).

## Decision

Follow its lifecycle: Define, Plan, Build, Verify, Review, Ship.

| Phase | In this project |
|---|---|
| Define | `docs/SPEC.md` and these ADRs |
| Plan | `docs/PLAN.md`, small tasks with acceptance checks |
| Build | One task at a time, tests first, one commit per task |
| Verify | Tests, typecheck, build, and a real run, with evidence |
| Review | A separate agent reviews the code without the builder's conclusions |
| Ship | Release notes and packaging. Nothing is pushed or published without the owner |

We apply the published principles directly. The plugin itself is not installed.

## Consequences

Slightly slower per task, but every claim about the code has evidence behind it.

## Later (2026-11-07)

How this is applied is written for agents and people in [AGENTS.md](../../AGENTS.md), with the commands,
the rules and the commit style. Tests come first where the logic is pure, as `docs/PLAN.md` says. Code
that mostly draws the screen is checked in a browser instead.
