# Cosmonauts

Cosmonauts is an AI agent orchestration library built on `@earendil-works/pi-coding-agent` (Pi). Agents and humans imagine, design, and build together across a spectrum - from fully automated chain runs to always-on, side-by-side pairing.

**Status**: Early development. Architecture is evolving. Expect breaking changes.

## Design Principles

### Pi-First

Before designing any feature, check what Pi already provides. The checklist:

1. **Does Pi's core handle it?** - `createAgentSession`, `DefaultResourceLoader`, `buildSystemPrompt`, built-in tools, session management, compaction, cost tracking. Use it directly.
2. **Does pi-skills provide it?** - `brave-search`, `browser-tools`, etc. Depend on it or adapt it.
3. **Does Pi's extension/skill system enable it?** - `pi.on()` lifecycle events, `pi.registerTool()`, `pi.appendEntry()` for state, `pi.sendMessage()` for injection. Build an extension.
4. **Only then build custom.** - If Pi can't handle it, build it ourselves.

As Pi evolves (lockstep versioning), re-audit its API before each phase for features that might obsolete planned custom work.

### Architecture at a glance

- **Library** (`lib/`) - orchestration, persistence, tasks, plans, agent loading and domain APIs. Domain-agnostic.
- **CLI host** (`cli/`, `bin/cosmonauts`) - runs the domains and agents a consumer supplies.
- **Three pillars** - agent definitions (declarative config), system prompts (composable layers), and skills (on-demand knowledge). See `docs/prompts.md` for the four-layer composition.
- **Adding a new domain = supplying a domain directory with a `domain.ts` manifest.** No library changes needed. Cosmonauts ships no agents, chains, domains, prompts or skills of its own.

## Tech Stack

(See `package.json` for the actual dependency versions and scripts - only the non-obvious constraints are noted here.)

- Runtime: a TypeScript-capable ESM runtime such as Bun. The package ships TypeScript source; the `cosmonauts` binary runs under Bun.
- Language: TypeScript - ESM, strict mode.
- Pi (`@earendil-works/pi-*`, repo: https://github.com/earendil-works/pi) uses **lockstep versioning**: keep all four packages (`pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) on the same exact version and bump them together. Re-audit Pi's API on each bump (see the Pi-First principle).

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

## Consumer Work Lifecycle

Library plan, task and session APIs support a consumer's `missions/` layout. Memory and knowledge APIs support consumer `memory/` and `knowledge/` stores. These are consumer artifacts, not this repository's tracked project records. Machine output enters curated knowledge only through a human act.

## When Working on This Codebase

- Changed-scope `analysis_audit` uses all three committed Fallow floors in
  `.fallow-baselines/` (`dead-code.json`, `health.json`, `dupes.json`). Refresh
  only with `bun run refresh:fallow-baselines -- --base <revision> --reason '<reason>' --category <dead-code|health|dupes>`;
  the manifest records provenance.
- New suppressions need a human-listed exception in the base revision of
  `.cosmonauts/suppression-exceptions.json`. Check with
  `bun run check:suppressions -- --base <revision>`; a same-change registry edit
  cannot authorize one.

- Verify after changes: `bun run typecheck`, `bun run lint`, `bun run check:reachability`, `bun run check:suppressions -- --base <revision>`, `bun run test`.
- For changed library behavior, record scoped mutation evidence and compare health, dead code and duplication against the base revision. Documentation alone has no mutation scope.
- For non-trivial features (multi-file or design decisions), scope into tasks before implementing. For small, self-contained changes, skip the task system.

## Key Directories

- `lib/` - library code (agents, orchestration, tasks, plans, domains, config)
- `cli/`, `bin/cosmonauts` - CLI implementation and entry point
- `themes/` - Pi theme
- `tests/` - Vitest suites mirroring source
- `docs/` - reference documentation
- `.cosmonauts/` - repository configuration and tooling registries
- `.fallow-baselines/` - committed analysis floors and provenance
- `scripts/` - developer checks and tooling
- `patches/` - dependency tooling patches

The `package.json` exports map controls the public API and `files` controls the npm tarball. Tests and reference docs are developer resources and are not shipped to consumers.

## Documentation

- `docs/library-surface.md` - public APIs and library contracts
- `docs/domains.md` - consumer domain authoring, visibility and bindings
- `docs/prompts.md` - four-layer prompt composition
- `docs/orchestration.md` - chains, drive, CLI surface, chain events/stats
- `docs/testing.md` - testing standards and patterns
- `docs/memory.md` - authored memory, curated knowledge, proposal flow, retrieval bounds, and gate policy
- Pi framework API reference: the upstream [Pi repository and docs](https://github.com/earendil-works/pi). Check against the pinned `@earendil-works/pi-*` version; there is no in-repo copy.
