# Cosmonauts

Automated coding orchestration system built on `@mariozechner/pi-coding-agent` (Pi). Design solutions, break them into atomic tasks, let agents implement them.

**Status**: Early development. Core infrastructure is built. Architecture is evolving. Expect breaking changes.

## Vision

Humans design, agents execute. The critical insight: **the design and planning phase is where the human adds the most value.** Once the plan is solid and tasks are well-defined, execution is mechanical.

The flow: (1) go to any project directory, (2) describe what you want, (3) get a designed, reviewed solution plan, (4) have agents create atomic tasks from the plan, (5) watch agents implement those tasks autonomously. Cosmonauts optimizes for great planning tools, atomic task creation, and reliable autonomous execution.

## Design Principles

### Pi-First

Before designing any feature, check what Pi already provides. The checklist:

1. **Does Pi's core handle it?** — `createAgentSession`, `DefaultResourceLoader`, `buildSystemPrompt`, built-in tools, session management, compaction, cost tracking. Use it directly.
2. **Does pi-skills provide it?** — `brave-search`, `browser-tools`, etc. Depend on it or adapt it.
3. **Does Pi's extension/skill system enable it?** — `pi.on()` lifecycle events, `pi.registerTool()`, `pi.appendEntry()` for state, `pi.sendMessage()` for injection. Build an extension.
4. **Only then build custom.** — If Pi can't handle it, build it ourselves.

As Pi evolves (lockstep versioning), re-audit its API before each phase for features that might obsolete planned custom work.

### Three-Layer Architecture

- **Layer 1: Framework** — Orchestration, persistence, tasks, CLI, agent definitions, skill loading. Domain-agnostic.
- **Layer 2: Domain agents** — Coding is the first domain. Each domain brings its own prompts, agent definitions, workflows, and skills. Adding a new domain = new prompts + agent definitions + skills, no framework changes.
- **Layer 3: Executive assistant** (future) — Always-on heartbeat that triggers domain workflows and manages long-running projects.

### Three Pillars: Agents, Prompts, Skills

**Agent definitions** are declarative config: model, tools, prompt layers, extensions, skill access, sub-agent permissions. Every agent is defined the same way.

**System prompts** are composable layers that define WHO an agent IS. Loaded at session creation, not on demand — they ARE the identity. A coding agent gets a base prompt + capability packs + a role persona.

**Skills** are on-demand knowledge files that teach agents HOW to do specific things. Agents receive a skill index (list + one-line descriptions) and load what they need via `/skill:name`. This saves tokens vs injecting all skills into every agent.

## Agent System

Agents are Pi sessions configured by declarative definitions. Each definition specifies model, prompt layers, tools, extensions, skill access, and sub-agent permissions.

### Agent Definitions

| Agent | Namespace | Tools | Extensions | Skills | Subagents | Context |
|-------|-----------|-------|------------|--------|-----------|---------|
| cosmo | coding | coding | tasks, plans, orchestration, todo, init | all | planner, task-manager, coordinator, worker, quality-manager, reviewer, fixer | yes |
| planner | coding | readonly | plans | all | — | yes |
| task-manager | coding | readonly | tasks | — | — | no |
| coordinator | coding | none | tasks, orchestration | — | worker | no |
| worker | coding | coding | tasks, todo | per-task | — | yes |
| quality-manager | coding | coding | tasks, orchestration | all | reviewer, fixer, coordinator | yes |
| reviewer | coding | coding | — | all | — | yes |
| fixer | coding | coding | — | all | — | yes |

### Prompt Composition

System prompts compose in a strict four-layer order, loaded at session creation via Pi's `additionalSkillPaths`:

- **Layer 0 — Platform Base** (`prompts/cosmonauts.md`): Universal operating norms for all agents.
- **Layer 1 — Capabilities** (`prompts/capabilities/*.md`): Reusable discipline bundles aligned to tool surfaces (core, coding-rw, coding-ro, tasks, spawning, todo).
- **Layer 2 — Persona** (`prompts/agents/<namespace>/<agent>.md`): One per agent. Identity, workflow, constraints.
- **Layer 3 — Runtime Context** (`prompts/runtime/sub-agent.md`): Optional spawn-time overlay with parent role, objective, task ID. Top-level spawns skip this.

```
cosmo        → [cosmonauts] + [core, coding-rw, tasks, spawning, todo] + [cosmo]
planner      → [cosmonauts] + [core, coding-ro] + [planner]
task-manager → [cosmonauts] + [core, tasks] + [task-manager]
coordinator  → [cosmonauts] + [core, tasks, spawning] + [coordinator]
worker       → [cosmonauts] + [core, coding-rw, tasks, todo] + [worker]
quality-mgr  → [cosmonauts] + [core, coding-rw, tasks, spawning] + [quality-manager]
reviewer     → [cosmonauts] + [core, coding-rw] + [reviewer]
fixer        → [cosmonauts] + [core, coding-rw] + [fixer]
```

### Sub-Agent Spawning

Agents are Pi sessions configured from definitions. Sub-agents are always ephemeral. The `spawn_agent` tool resolves the agent ID to its full definition and creates a scoped session. Parents can only spawn agents listed in their `subagents` allowlist. Parent-child relationships are tracked (who spawned whom, session IDs).

## Orchestration

### Chain Runner

Runs agent pipelines using Pi sessions. The DSL is pure topology — it declares which roles run in what order. Loop behavior is intrinsic to each role (coordinator loops until all tasks are Done, others run once).

```
cosmonauts --chain "planner -> task-manager -> coordinator -> quality-manager" "design and implement auth"
```

**Safety caps**: `maxTotalIterations` (50), `timeoutMs` (30 min) — global, not per-stage.

### Named Workflows

The primary user interface for multi-agent pipelines. Defined in config, invoked via `--workflow`.

| Name | Chain | Purpose |
|------|-------|---------|
| `plan-and-build` | `planner → task-manager → coordinator → quality-manager` | Full pipeline |
| `implement` | `task-manager → coordinator → quality-manager` | From existing plan |
| `verify` | `quality-manager` | Review + remediation |
| `plan` | `planner` | Design only |

### CLI

```
cosmonauts                                    # Interactive REPL
cosmonauts "design an auth system"            # Interactive with initial prompt
cosmonauts --print "create tasks and go"      # Non-interactive (fire-and-forget)
cosmonauts --workflow plan-and-build "auth"    # Named workflow
cosmonauts --chain "planner -> coordinator"   # Raw chain DSL
```

Flags: `--print`, `--workflow`, `--chain`, `--model`, `--thinking`.

## Documentation

- `ROADMAP.md` — Prioritized backlog of upcoming work.
- `docs/architecture/approach.md` — Design philosophy and evolution notes.
- `docs/pi-framework.md` — Pi API reference (execution modes, tools, skills, extensions).
- `docs/testing.md` — Testing standards and patterns.
- `memory/` — Distilled knowledge from completed work.

## Tech Stack

- Runtime: Bun
- Language: TypeScript (ESM, strict mode)
- Framework: `@mariozechner/pi-coding-agent` v0.56.1 (pinned exact — Pi uses lockstep versioning)
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

## Work Lifecycle

Work flows through: **roadmap → plan → tasks → archive → memory**.

- **Roadmap** (`ROADMAP.md`): Prioritized backlog. Items are picked up and turned into plans.
- **Plans** (`missions/plans/<slug>/`): Implementation plans with `plan.md` and optional `spec.md`. Created via `plan_create`.
- **Tasks** (`missions/tasks/`): Atomic work items linked to plans via `plan:<slug>` labels. Created via `task_create`.
- **Archive** (`missions/archive/`): Completed plans and tasks moved here by `plan_archive`. Mechanical, no LLM.
- **Memory** (`memory/`): Distilled knowledge from archived work. Agent-driven extraction via the `archive` skill.

See the `roadmap`, `plan`, `task`, and `archive` skills for detailed procedures.

## Task System

Built-in task system in `missions/tasks/`. Tasks are markdown files with YAML frontmatter — atomic, dependency-ordered work items with acceptance criteria.

Task tools: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search` (Pi extension tools).

CLI: `cosmonauts-tasks` for standalone task management.

## Implementation Workflow

When implementing non-trivial features (anything spanning multiple files or requiring design decisions):

1. **Understand the architecture** — read this file and relevant docs/skills.
2. **Design the approach** — understand scope, identify files to change, consider trade-offs.
3. **Break the work into tasks** using the task system (`task_create`). Each task should be single-PR scope with 1-7 outcome-focused acceptance criteria. Order by dependencies.
4. **Delegate each task to a sub-agent** rather than implementing everything yourself. Spawn a focused sub-agent per task — this keeps each implementation in a clean context window and produces better results than accumulating context across many tasks.
5. **Verify after each task**: `bun run test`, `bun run lint`, `bun run typecheck`.
6. **Commit per task** with the task ID: `COSMO-XXX: Short description`.

For small, self-contained changes (a bug fix, a single function, a config tweak), skip the task system and work directly.

## Key Directories

```
lib/              Core libraries (agents, orchestration, tasks, plans, workflows, prompts, config)
extensions/       Pi extensions (tasks, plans, todo, orchestration, init)
skills/           On-demand capability files (languages, domains)
prompts/          System prompt layers (base, capabilities, personas, runtime)
cli/              CLI implementation
bin/              CLI entry points (cosmonauts, cosmonauts-tasks)
tests/            Test suites mirroring source structure
missions/         Active tasks, plans, and archived work
memory/           Distilled knowledge from completed work
docs/             Reference documentation
```
