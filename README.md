# Cosmonauts

An **agent-first** AI orchestration framework built on [Pi](https://github.com/earendil-works/pi). Declare your agents, compose their system prompts, expose skills, and wire up workflows — for any domain. You bring the domain; Cosmonauts gives you the tooling to build, coordinate, and run the agents.

What makes it different from using a single assistant directly:

- **Agent-first** — you build your *own* agents and the workflows that run them automatically, instead of working inside someone else's fixed assistant.
- **Backend-agnostic** — run whatever model is available: OpenAI, Anthropic, or open-source.
- **Orchestrate internally *or* externally** — drive agents from the Cosmonauts CLI, or from another agent harness that calls Cosmonauts' skills and tools (chains and the drive system).

> **Development is paused.** My agent work continues for now in Shepherd, part of [Troupe](https://github.com/ag0os/troupe). Cosmonauts may pick up again; until then the code stays here as it was, alpha software with no stability guarantees.

## What It Does

Cosmonauts is domain-agnostic. A **domain** (`domain.ts` at a domain root) packages its own agents, persona prompts, capabilities, skills, extensions, and named chains — and domains are pluggable, not shipped with the framework itself. The framework provides the substrate: declarative agent definitions, four-layer prompt composition, on-demand skills, multi-agent orchestration (chains and Drive runs), and a persistent plan/task/memory spine so work compounds instead of drifting.

**The coding domain, the `main` domain (Cosmo) and the bundled-package catalog were removed from this repo in D2.** The framework now ships no domain content of its own beyond `domains/shared/` (until D3); you supply the domain. The workflow below is an illustrative example of what a coding domain built on the framework looks like; the same machinery applies to any domain you define.

### A coding workflow, as an example

Here, you handle the creative work (requirements, design decisions, architecture) and agents handle the execution (implementation, testing, commits, code review). The workflow:

1. **You describe what you want** — in natural language, a spec file, or interactively.
2. **A planner agent designs the solution** — explores the codebase, proposes an approach, writes a plan.
3. **You review and approve the plan** — adjust anything before execution begins.
4. **A task manager breaks the plan into atomic tasks** — each one is single-PR scope with clear acceptance criteria.
5. **A coordinator delegates tasks to worker agents** — respecting dependencies, routing skills.
6. **Workers implement, test, and commit** — each in a fresh context with the right tools.
7. **An integration verifier checks plan-level contracts** — comparing the implemented changes against the approved plan.
8. **A reviewer checks the result** — independent review produces findings. Remediation goes through tasks, Drive, and another review.

The key insight: **the design phase is where humans add the most value.** Once the plan is solid and tasks are well-defined, execution is mechanical. Cosmonauts optimizes for great planning and reliable autonomous execution.

## Current Status

**Phase 0 is complete.** The core loop works end-to-end: you can start Cosmonauts, trigger multi-agent pipelines, and have agents implement tasks on real projects. The maintainer has dogfooded it daily since late February 2026 — the typical loop is bouncing design and plan ideas with an agent, turning that into a technical plan, revising it, and automating the implementation.

**The framework is domain-agnostic and ships no coding domain.** Building domains is supported through the contract in [docs/domains.md](./docs/domains.md).

What's built:
- Task system with markdown files, YAML frontmatter, dependencies, and acceptance criteria
- Chain runner for multi-agent pipelines (a consumer-defined role sequence)
- Agent spawner creating scoped Pi sessions from declarative agent definitions
- Four-layer system prompt architecture with capability-aligned composition
- Plan lifecycle: create plans, link tasks, archive completed work, submit machine proposals under `memory/`, and promote reviewed knowledge by a human act into `knowledge/`
- Drive runs for approved plan-linked task batches via `run_driver`, normalized `run_status`/`run_watch` observation, deprecated `watch_events` compatibility, and `cosmonauts run drive`
- Named chains supplied by a domain or project config
- CLI with interactive and non-interactive modes
- Todo tool for in-session task tracking
- Vitest test suite passing

Before it's ready for a wider audience (the maintainer's bar):
- A **memory system** — built out, ideally automatic
- **Documentation** — with the honest expectation that writing it will surface rough edges

See [ROADMAP.md](./ROADMAP.md) for the full backlog.

## Installation

Cosmonauts requires [Bun](https://bun.sh/) and [Pi](https://github.com/earendil-works/pi).

```bash
# Clone and install dependencies
git clone <repo-url>
cd cosmonauts
bun install

# Link the CLI binaries
bun link
```

## Getting Started

After installing, initialize your project:

```bash
# 1. Initialize local directories and project config
cosmonauts scaffold missions

# 2. (Optional) Customize .cosmonauts/config.json — adjust skills and named chains

# 3. Run a chain from a domain you have installed or supplied
cosmonauts run chain <chain-name> "describe what you want to build"
```

The `scaffold missions` command creates `missions/`, `memory/`, and `knowledge/` for tasks, plans, machine memory/proposals, and curated knowledge, plus a minimal `.cosmonauts/config.json`. The knowledge surface remains OFF unless `knowledgeSurface.enabled` is literally `true`; see [docs/memory.md](./docs/memory.md).

## Usage

### Interactive Mode (default)

Start a REPL session with the lead agent of your installed or supplied domain (the `main/cosmo` and `coding/cody` leads were removed in D2):

```bash
cosmonauts
cosmonauts -d <domain>
cosmonauts "explain how the task system works"
```

### Non-Interactive Mode

Process a prompt and exit:

```bash
cosmonauts --print "create tasks from the plan and implement them"
```

### Multi-Agent Pipelines

Run named chains defined by installed domains or `.cosmonauts/config.json`:

```bash
# Run a named chain (names come from your domains/config)
cosmonauts run chain <chain-name> "design an auth system for this project"

# List available named chains
cosmonauts run chain list

# List agents with qualified IDs such as <domain>/<agent>
cosmonauts --list-agents
```

Or pass a raw chain DSL expression for custom pipelines:

```bash
cosmonauts run chain "planner -> task-manager -> coordinator" "custom pipeline"
```

The chain DSL supports **bracket groups** for parallel steps and **fan-out** for multiple instances of the same role:

```bash
# Parallel steps: run task-manager and reviewer concurrently, then coordinator
cosmonauts run chain "planner -> [task-manager, reviewer] -> coordinator" "design with review"

# Fan-out: run 3 reviewer instances in parallel
cosmonauts run chain "coordinator -> reviewer[3]" "multi-pass review"
```

> **Fan-out note:** `reviewer[3]` spawns three instances that each receive the **same prompt** — it does not partition work or assign different tasks to each instance. Use fan-out for independent parallel passes, not for task distribution.

### Drive Runs

Run approved plan-linked task batches through the driver loop:

```bash
# Launch a detached external-agent run
cosmonauts run drive --plan auth-system --backend codex --mode detached --branch feature/auth
# Detached launch returns after starting the launcher, not when the run completes.
# Use the printed runId to poll: cosmonauts run status <runId>

# Check a run and list known runs through normalized observation
cosmonauts run status run-abc --scope auth-system
cosmonauts run list --scope auth-system

# Resume a previous run
cosmonauts run drive --plan auth-system --resume run-abc
```

Agents use the same driver through `run_driver` and monitor new runs with `run_status` / `run_watch`; `watch_events` remains a legacy compatibility view over Drive events. Driver runs write artifacts under `missions/sessions/<scope>/runs/<runId>/`, including `events.jsonl`, `spec.json`, `task-queue.txt`, and state files. `cosmonauts run status <runId> --scope <plan>` reports normalized status; active Drive runs are tracked with `run.pid` for detached mode and `run.inline.json` for inline mode.

External backends are `codex` and `claude-cli`; `cosmonauts-subagent` is inline-only for in-process Cosmonauts agent runs. See `domains/shared/skills/drive/SKILL.md` and `lib/driver/README.md` for backend environment controls.

### Harness Sync

Synchronize runtime-visible skills and registered commands into supported Claude Code and Codex owner roots with provenance-aware copy or local-link materialization:

```bash
cosmonauts harness sync [--target <id>] [--scope project|personal] \
  [--kind skill|command] [--asset <assetId>] [--copy|--link] \
  [--check] [--forget-removed <assetId>] [--transfer-owner <ownerId>] \
  [--json|--plain]
```

`--target`, `--scope`, `--kind`, and `--asset` are repeatable and deduplicated. With no target, supported Claude and Codex targets are selected. With no scope, every descriptor uses its registered default (runtime skills are project-scoped; the external `cosmonauts` bundle and commands are personal). An explicit scope overrides those defaults. Any explicit asset list is a partial reconciliation; omitted catalogue and manifest rows are untouched. `--copy` and `--link` are exclusive, and command assets support copy only.

`--check` is read-only and reports each selected row as one of `missing`, `current`, `source-ahead`, or `locally-edited`. Rows include owner diagnostics, source and target paths, recorded and requested modes, before reason, action and final state, recovery/evidence/discovery detail, and any release warning. JSON and tab-separated plain reports are available with `--json` and `--plain`.

A normal sync exits nonzero for any conflict, incomplete inventory, ambiguous recovery, evidence-required state, containment or write failure, or unconfirmed release row. A check exits nonzero for every non-`current` row and never calls transaction or materialization code. `--forget-removed` cannot combine with check, mode, asset selection, or owner transfer. `--transfer-owner` requires explicit assets and cannot combine with check, mode, or forget.

`cosmonauts skills export --target claude|codex [--personal] (--all|<skills...>)` remains the compatibility skill-only facade. Every invocation is partial, including `--all`, so it never reconciles the external bundle, commands, or omitted manifest entries.

### Task Management

Manage tasks directly via subcommands:

```bash
cosmonauts scaffold missions  # Scaffold missions directories
cosmonauts task create        # Create a task interactively
cosmonauts task list          # List all tasks
cosmonauts task list --ready  # Show unblocked tasks
cosmonauts task view COSMO-001
cosmonauts task edit COSMO-001 --status "In Progress"
```

### Plan Management

Manage plans directly via subcommands:

```bash
cosmonauts plan create --slug auth-system --title "Auth System"
cosmonauts plan list
cosmonauts plan view auth-system
cosmonauts plan edit auth-system --status completed
cosmonauts plan archive auth-system
```

### Export Packaged Agents

Phase 1 packaged-agent export builds standalone Claude Code CLI-backed binaries from an `AgentPackageDefinition` JSON file, or from a compatible source agent shorthand.

Export from an explicit package definition:

```bash
cosmonauts export --definition packages/cosmo-planner/package.json --out bin/cosmo-planner
```

Export from a source agent shorthand:

```bash
cosmonauts export <domain>/<agent> --target claude-cli --out bin/explorer-claude
```

`--target` defaults to `claude-cli`; the supported serialized labels are `claude-cli, codex`, and other values are rejected before compiling. Provide exactly one of `--definition <path>` or `<agent-id>`. The shorthand normalizes through a generated package definition that uses the source agent prompt, tools, and skills, so it is compatibility-gated and rejects agents whose raw internal prompts depend on Cosmonauts-only extensions, subagents, or extension-backed capabilities. For planner-like exports, write an explicit definition with an external-safe prompt instead.

Package definitions are JSON:

```json
{
  "schemaVersion": 1,
  "id": "cosmo-planner-claude",
  "description": "Cosmonauts planning discipline packaged for Claude Code subscription use.",
  "sourceAgent": "<domain>/planner",
  "prompt": {
    "kind": "file",
    "path": "planner-claude-system.md"
  },
  "tools": {
    "preset": "coding",
    "notes": "Claude Code-native tools are declared in the target block."
  },
  "skills": {
    "mode": "allowlist",
    "names": ["plan", "engineering-principles", "tdd"]
  },
  "projectContext": "omit",
  "targets": {
    "claude": {
      "promptMode": "append",
      "skillDelivery": "inline",
      "allowedTools": ["Read", "Glob", "Grep", "Bash", "Edit", "Write", "TodoWrite", "Task"]
    }
  }
}
```

Fields:

- `schemaVersion` must be `1`.
- `id` and `description` identify the package.
- `sourceAgent` is optional provenance and metadata, and is required when `prompt.kind` or `skills.mode` is `source-agent`.
- `prompt.kind` is `file`, `inline`, or `source-agent`; file paths resolve relative to the definition JSON.
- `tools.preset` is `coding`, `readonly`, `verification`, or `none`.
- `skills.mode` is `none`, `source-agent`, or `allowlist` with `names`; selected skills are embedded as inline markdown.
- `projectContext` must be `omit` in Phase 1.
- Canonical definition blocks are `targets.claude` and `targets.codex`; the serialized CLI/package labels remain `claude-cli, codex` for compatibility.
- `targets.claude` accepts `promptMode` (`append` or `replace`), `skillDelivery` (`inline`), and optional exact Claude `allowedTools`.

The export command prints one JSON success line with `packageId`, `target`, and `outputPath` when compilation succeeds.

Run an exported binary like this:

```bash
bin/cosmo-planner "design a cache layer"
printf "design a cache layer" | bin/cosmo-planner
bin/cosmo-planner --claude-binary /opt/bin/claude --prompt-mode replace "review this repo"
bin/cosmo-planner --allow-api-billing "use API billing intentionally"
```

Runtime flags:

- `--allow-api-billing` preserves `ANTHROPIC_API_KEY` in the spawned Claude environment.
- `--claude-binary <path>` runs a specific Claude Code CLI binary instead of `claude`.
- `--prompt-mode append|replace` overrides the package's Claude system-prompt mode.

Trailing arguments are passed through to Claude unchanged, after the wrapper's own flags are removed. The wrapper does not read stdin itself: it spawns Claude with `stdio: "inherit"`, so a pipe reaches Claude directly. With no trailing arguments the wrapper passes none, and Claude starts as it would when run with no arguments.

By default, exported binaries remove `ANTHROPIC_API_KEY` before launching Claude and print a warning when they do so. This subscription-safety default prevents accidental Anthropic API billing and keeps Claude Code subscription authentication as the default. Pass `--allow-api-billing` only when you intentionally want API-key billing.

### Project Setup

Bootstrap project instructions for a new codebase:

```bash
cosmonauts init
```

This launches an interactive bootstrap session with the default domain lead. The agent scans the project, asks clarifying questions, proposes `AGENTS.md` content and skill suggestions, and waits for your confirmation before writing any files. Re-running `cosmonauts init` reviews the existing setup and proposes improvements instead of stopping when `AGENTS.md` already exists.

## Architecture

Cosmonauts is built as a [Pi package](https://github.com/earendil-works/pi) — extensions, agent definitions, system prompts, and skills that plug into the Pi agent framework.

```
cosmonauts/
├── lib/              Core libraries (tasks, orchestration, plans, chains, agents)
├── domains/          Built-in domain content (shared/, until D3)
├── cli/              CLI implementation
├── bin/              CLI entry points (cosmonauts)
├── tests/            Test suites (Vitest)
├── missions/         Active tasks, plans, reviews, sessions, and archived work (created by scaffold)
├── memory/           Authored memory, derived state, and machine proposals (created by scaffold)
├── knowledge/        Human-curated OKF knowledge records (created by scaffold)
├── .cosmonauts/      Project config (created by scaffold)
└── docs/             Reference documentation
```

### Agents

Every agent is a Pi session configured by a declarative definition — model, tools, system prompt layers, extensions, skill access, and sub-agent permissions.

Agent definitions come from the domains you install or supply. The coding agents (cody, planner, worker, reviewers, quality manager and the rest) and the `main/cosmo` lead were removed in D2.

### Task System

File-based, git-trackable. Tasks are markdown files with YAML frontmatter stored in `missions/tasks/`.

```markdown
---
id: COSMO-001
title: Create user model
status: To Do
priority: high
labels: [backend, database]
dependencies: []
---

## Description
Create the User model with email and password fields.

- [ ] #1 User model exists with email and password_digest columns
- [ ] #2 Email has uniqueness constraint and index
```

Agents coordinate through task state — no message bus, no shared memory. The coordinator reads task files to decide what's next, workers update their task when done.

## Tech Stack

- **Runtime**: Bun (Node as a fallback)
- **Language**: TypeScript (ESM, strict mode)
- **Agent Framework**: `@earendil-works/pi-coding-agent` — pinned exactly, lockstep with the other `pi-*` packages (see `package.json`)
- **Schema**: TypeBox (`typebox`)
- **Tests**: Vitest (`bun run test`)
- **Linter**: Biome (`bun run lint`)

## Documentation

- **[ROADMAP.md](./ROADMAP.md)** — Prioritized backlog of upcoming work.
- **[AGENTS.md](./AGENTS.md)** — Project conventions and instructions for agents working on this codebase.
- **[docs/domains.md](./docs/domains.md)** — Domain package layout, authoring contract, visibility, active domains, and bindings.
- **[docs/orchestration.md](./docs/orchestration.md)** — Chains, Drive, normalized run observation, CLI surface.
- **[docs/memory.md](./docs/memory.md)** — Authored memory, curated knowledge, proposal authority, retrieval bounds, and gate adoption.
- **[docs/prompts.md](./docs/prompts.md)** — Four-layer prompt composition.
- **[docs/testing.md](./docs/testing.md)** — Testing standards and patterns.
- Pi framework API reference: the **`pi` skill** (`domains/shared/skills/pi/SKILL.md`), loaded on demand. It tracks the pinned `@earendil-works/pi-*` packages and points agents to the current Pi repo and docs.

## License

TBD
