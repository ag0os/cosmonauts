# Cosmonauts

Cosmonauts is an AI agent orchestration framework built on `@mariozechner/pi-coding-agent` (Pi). Agents and humans imagine, design, and build together across a spectrum — from fully automated chain runs to always-on, side-by-side pairing.

**Status**: Early development. Architecture is evolving. Expect breaking changes.

## Design Principles

### Pi-First

Before designing any feature, check what Pi already provides. The checklist:

1. **Does Pi's core handle it?** — `createAgentSession`, `DefaultResourceLoader`, `buildSystemPrompt`, built-in tools, session management, compaction, cost tracking. Use it directly.
2. **Does pi-skills provide it?** — `brave-search`, `browser-tools`, etc. Depend on it or adapt it.
3. **Does Pi's extension/skill system enable it?** — `pi.on()` lifecycle events, `pi.registerTool()`, `pi.appendEntry()` for state, `pi.sendMessage()` for injection. Build an extension.
4. **Only then build custom.** — If Pi can't handle it, build it ourselves.

As Pi evolves (lockstep versioning), re-audit its API before each phase for features that might obsolete planned custom work.

### Architecture at a glance

- **Three layers**:
  - **Framework** (`lib/`) — orchestration, persistence, tasks, CLI, agent loading. Domain-agnostic.
  - **Domain agents** — built-in domains live in `domains/` (`shared/`, `main/`); installable domains live in `bundled/` (`coding/`). Each domain ships its own agents, prompts, capabilities, and skills.
  - **Executive layer** (`domains/main/`) — hosts `cosmo`, the cross-domain top-level assistant.
- **Three pillars** — agent definitions (declarative config), system prompts (composable layers), and skills (on-demand knowledge). See `docs/prompts.md` for the four-layer composition.
- **Adding a new domain = adding a new domain directory with a `domain.ts` manifest.** No framework changes needed.
- **Built-in leads**: `main/cosmo` (executive, cross-domain) and `coding/cody` (coding-domain interactive lead).

## Tech Stack

(See `package.json` for the actual dependency versions and scripts — only the non-obvious constraints are noted here.)

- Runtime: Bun for dev; the CLI also runs under Node as a fallback.
- Language: TypeScript — ESM, strict mode.
- Pi (`@mariozechner/pi-*`) uses **lockstep versioning**: keep all four packages (`pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) on the same exact version and bump them together. Re-audit Pi's API on each bump (see the Pi-First principle). Heads up: Pi v0.74.0+ moves to the `@earendil-works/` scope.

## Conventions

- ESM imports everywhere. Use `import type` for type-only imports.
- Include `.ts` extensions in relative imports.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Prefer `as const` objects over enums.
- Use `unknown` over `any`. Narrow before use.
- Keep functions small. Use options objects for 3+ parameters.
- Tests go in `tests/` mirroring the source structure.
- One concept per test. Descriptive names: "returns undefined for missing keys", not "test1".
- Use temp directories for filesystem tests. Clean up in `afterEach`.

## Work Lifecycle

Work flows: **roadmap → plan → tasks → sessions → archive → memory**. Each stage has a skill: `/skill:roadmap`, `/skill:plan`, `/skill:task`, `/skill:archive`. Plans, tasks, reviews, and archives live in `missions/`; distilled knowledge in `memory/`. We dogfood cosmonauts on itself, so most of these directories are tracked here — only `missions/sessions/` (and its archive counterpart) are gitignored as high-volume, regenerable transcripts.

## When Working on This Codebase

- Verify after changes: `bun run test`, `bun run lint`, `bun run typecheck`.
- For non-trivial features (multi-file or design decisions), scope into tasks before implementing — see `/skill:plan` and `/skill:task`.
- For small, self-contained changes, skip the task system.

## Key Directories

**Source code:**
- `lib/` — framework code (agents, orchestration, tasks, plans, workflows, domains, config)
- `domains/` — built-in domains (`shared/`, `main/`)
- `bundled/` — installable domain packages (`coding/`)
- `cli/`, `bin/` — CLI implementation and entry points
- `tests/` — Vitest suites mirroring source
- `docs/` — reference documentation

**Project artifacts (tracked — we dogfood cosmonauts on itself):**
- `missions/plans/`, `missions/tasks/`, `missions/reviews/`, `missions/archive/` — work artifacts
- `memory/` — distilled knowledge from completed work
- `.cosmonauts/` — project config

**Gitignored:** `missions/sessions/` and `missions/archive/sessions/` — high-volume, regenerable transcripts.

`package.json` "files" controls the npm tarball — `missions/`, `memory/`, `.cosmonauts/`, `tests/`, and `docs/` are not shipped to consumers.

## Documentation

- `ROADMAP.md` — work backlog (prioritized items first, ideas below)
- `docs/prompts.md` — four-layer prompt composition
- `docs/orchestration.md` — chains, workflows, drive, CLI surface, chain events/stats
- `docs/testing.md` — testing standards and patterns
- `memory/` — distilled knowledge from completed work
- Pi framework API reference lives in the **`pi` skill** (`domains/shared/skills/pi/SKILL.md`) — loaded on demand, not a standalone doc
