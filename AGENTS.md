# Cosmonauts

Automated coding orchestration system built on `@mariozechner/pi-coding-agent` (Pi). Design solutions, break them into atomic tasks, let agents implement them.

**Status**: Early development. Core infrastructure is built. Architecture is evolving. Expect breaking changes.

## Documentation

- `DESIGN.md` — Source of truth for the system design. Read this first.
- `docs/pi-framework.md` — Pi API reference (execution modes, tools, skills, extensions).
- `docs/architecture/approach.md` — Design philosophy and evolution notes.

## Tech Stack

- Runtime: Bun
- Language: TypeScript (ESM, strict mode)
- Framework: `@mariozechner/pi-coding-agent` v0.52.9 (pinned exact — Pi uses lockstep versioning)
- Schema: `@sinclair/typebox`
- Tests: Vitest (`bun run test`)
- Linter: Biome (`bun run lint`)
- Typecheck: `bun run typecheck`

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

## Task System

This project includes a built-in task system in `forge/tasks/`. Tasks are markdown files with YAML frontmatter — atomic, dependency-ordered work items with acceptance criteria.

Task tools are available as Pi extension tools: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search`.

CLI: `cosmonauts-tasks` for standalone task management.

## Implementation Workflow

When implementing non-trivial features (anything spanning multiple files or requiring design decisions):

1. **Read DESIGN.md** to understand the architecture and existing patterns.
2. **Design the approach** — understand scope, identify files to change, consider trade-offs.
3. **Break the work into tasks** using the task system (`task_create`). Each task should be single-PR scope with 1-7 outcome-focused acceptance criteria. Order by dependencies.
4. **Delegate each task to a sub-agent** rather than implementing everything yourself. Spawn a focused sub-agent per task — this keeps each implementation in a clean context window and produces better results than accumulating context across many tasks. Include the full task details (description, ACs, relevant file paths) in the sub-agent's prompt.
5. **Verify after each task**: `bun run test`, `bun run lint`, `bun run typecheck`.
6. **Commit per task** with the task ID: `COSMO-XXX: Short description`.

The coordinating agent should focus on planning, task creation, delegation, and verification — not on writing code directly. Each sub-agent gets a fresh context with just the information it needs, which improves implementation quality and avoids context exhaustion.

For small, self-contained changes (a bug fix, a single function, a config tweak), skip the task system and work directly.

## Key Directories

```
lib/              Core libraries (orchestration, tasks, workflows)
extensions/       Pi extensions (task tools, todo, orchestration, init)
skills/           On-demand capability files (languages, domains)
prompts/          System prompt layers (planned — currently in skills/agents/)
cli/              CLI implementation
tests/            Test suites mirroring source structure
forge/tasks/      Project task files
docs/             Reference documentation
```
