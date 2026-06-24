# Cosmonauts

An **agent-first** AI orchestration framework built on [Pi](https://github.com/earendil-works/pi). Declare your agents, compose their system prompts, expose skills, and wire up workflows — for any domain. You bring the domain; Cosmonauts gives you the tooling to build, coordinate, and run the agents.

What makes it different from using a single assistant directly:

- **Agent-first** — you build your *own* agents and the workflows that run them automatically, instead of working inside someone else's fixed assistant.
- **Backend-agnostic** — run whatever model is available: OpenAI, Anthropic, or open-source.
- **Orchestrate internally *or* externally** — drive agents from the Cosmonauts CLI, or from another agent harness that calls Cosmonauts' skills and tools (chains and the drive system).

> ⚠️ **Alpha software.** Cosmonauts is in early development and the architecture is still evolving. Expect breaking changes — APIs, file formats, CLI surface, and domain conventions may all change without notice between versions.

## What It Does

Cosmonauts is domain-agnostic. A **domain** (`domain.ts` at a domain root) packages its own agents, persona prompts, capabilities, skills, extensions, and named chains — and domains are pluggable, not shipped with the framework itself. The framework provides the substrate: declarative agent definitions, four-layer prompt composition, on-demand skills, multi-agent orchestration (chains and Drive runs), and a persistent plan/task/memory spine so work compounds instead of drifting.

**Coding is the current reference domain** — it's what's built out today because it's the maintainer's daily work, and it doubles as the worked example of how to build a domain. (It's slated to be extracted out of this repo.) The rest of this README uses the coding domain to show the framework in action; the same machinery applies to any domain you define.

### The coding domain, as an example

Here, you handle the creative work (requirements, design decisions, architecture) and agents handle the execution (implementation, testing, commits, code review). The workflow:

1. **You describe what you want** — in natural language, a spec file, or interactively.
2. **A planner agent designs the solution** — explores the codebase, proposes an approach, writes a plan.
3. **You review and approve the plan** — adjust anything before execution begins.
4. **A task manager breaks the plan into atomic tasks** — each one is single-PR scope with clear acceptance criteria.
5. **A coordinator delegates tasks to worker agents** — respecting dependencies, routing skills.
6. **Workers implement, test, and commit** — each in a fresh context with the right tools.
7. **An integration verifier checks plan-level contracts** — comparing the implemented changes against the approved plan.
8. **A quality manager verifies everything** — lint, typecheck, code review, and remediation.

The key insight: **the design phase is where humans add the most value.** Once the plan is solid and tasks are well-defined, execution is mechanical. Cosmonauts optimizes for great planning and reliable autonomous execution.

## Current Status

**Phase 0 is complete.** The core loop works end-to-end: you can start Cosmonauts, chat with `main/cosmo` (Cosmo), trigger multi-agent pipelines, and have agents implement tasks on real projects. The maintainer has dogfooded it daily since late February 2026 — the typical loop is bouncing design and plan ideas with an agent, turning that into a technical plan, revising it, and automating the implementation.

**Coding is the only built-out domain so far.** The framework is domain-agnostic by design, but the coding domain is the only fully-realized example today — and it's slated to be extracted out of this repo. Building additional domains is supported through the contract in [docs/domains.md](./docs/domains.md).

What's built:
- Task system with markdown files, YAML frontmatter, dependencies, and acceptance criteria
- Chain runner for multi-agent pipelines (planner → task-manager → coordinator → workers → integration-verifier → quality-manager)
- Agent spawner creating scoped Pi sessions from declarative agent definitions
- `main/cosmo` cross-domain orchestration, `coding/cody` coding-domain coordination, and specialist roles such as planner, task-manager, worker, reviewer, and fixer
- Four-layer system prompt architecture with capability-aligned composition
- Plan lifecycle: create plans, link tasks, archive completed work, distill learnings into memory
- Drive runs for approved plan-linked task batches via `run_driver`, normalized `run_status`/`run_watch` observation, deprecated `watch_events` compatibility, and `cosmonauts run drive`
- Named chains for common pipelines (`plan-and-build`, `spec-and-build`, `implement`, `verify`, `adapt`) with adversarial plan review as the default
- CLI with interactive and non-interactive modes
- Todo tool for in-session task tracking
- Vitest test suite passing

Before it's ready for a wider audience (the maintainer's bar):
- A **memory system** — built out, ideally automatic
- **Extract the coding domain into its own plugin** so the framework ships domain-free (see the `domain-plugins` idea in the roadmap)
- Make **Cosmo** (`main/cosmo`, the executive agent) genuinely useful — it has to carry more weight once there's no embedded domain
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

# 2. Install the coding domain if your project has not installed one yet
cosmonauts install coding

# 3. (Optional) Customize .cosmonauts/config.json — adjust skills and named chains

# 4. Run your first named chain
cosmonauts run chain plan-and-build "describe what you want to build"
```

The `scaffold missions` command creates `missions/` and `memory/` directories for tasks, plans, and archived work, plus `.cosmonauts/config.json` with default named chains and skills. You can customize the config to match your project, or use the defaults as-is.

## Usage

### Interactive Mode (default)

Start a REPL session with Cosmo (`main/cosmo`), the cross-domain orchestrator:

```bash
cosmonauts
```

For a coding-focused REPL session with Cody (`coding/cody`):

```bash
cosmonauts -d coding
```

Chat naturally — Cosmo clarifies goals and delegates across installed domains; Cody can read/write code and coordinate coding specialists.

```bash
# Start with an initial prompt to main/cosmo
cosmonauts "explain how the task system works"

# Start with an initial prompt to coding/cody
cosmonauts -d coding "explain the worker agent"
```

### Non-Interactive Mode

Process a prompt and exit:

```bash
cosmonauts --print "create tasks from the plan and implement them"
```

### Multi-Agent Pipelines

Run named chains defined by installed domains or `.cosmonauts/config.json`:

```bash
# Full pipeline: design → tasks → implement → verify
cosmonauts run chain plan-and-build "design an auth system for this project"

# Implement an existing plan
cosmonauts run chain implement "implement the plan in missions/plans/auth-system/"

# Run quality checks and remediation on current changes
cosmonauts run chain verify "review against main and fix findings"

# List available named chains
cosmonauts run chain list

# List agents with qualified IDs such as main/cosmo and coding/cody
cosmonauts --list-agents
```

Or pass a raw chain DSL expression for custom pipelines:

```bash
cosmonauts run chain "planner -> task-manager -> coordinator -> integration-verifier -> quality-manager" "custom pipeline"
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
cosmonauts export coding/explorer --target claude-cli --out bin/explorer-claude
```

`--target` defaults to `claude-cli`; Phase 1 rejects other export targets before compiling. Provide exactly one of `--definition <path>` or `<agent-id>`. The shorthand normalizes through a generated package definition that uses the source agent prompt, tools, and skills, so it is compatibility-gated and rejects agents whose raw internal prompts depend on Cosmonauts-only extensions, subagents, or extension-backed capabilities. For planner-like exports, write an explicit definition with an external-safe prompt instead.

Package definitions are JSON:

```json
{
  "schemaVersion": 1,
  "id": "cosmo-planner-claude",
  "description": "Cosmonauts planning discipline packaged for Claude Code subscription use.",
  "sourceAgent": "coding/planner",
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
    "claude-cli": {
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
- `targets["claude-cli"]` accepts `promptMode` (`append` or `replace`), `skillDelivery` (`inline`), and optional exact Claude `allowedTools`.

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

Trailing prompt arguments are joined and passed to Claude; if no prompt arguments are provided, the binary reads stdin. If both are empty, it prints usage and exits non-zero.

By default, exported binaries remove `ANTHROPIC_API_KEY` before launching Claude and print a warning when they do so. This subscription-safety default prevents accidental Anthropic API billing and keeps Claude Code subscription authentication as the default. Pass `--allow-api-billing` only when you intentionally want API-key billing.

### Project Setup

Bootstrap project instructions for a new codebase:

```bash
cosmonauts init
```

This launches an interactive bootstrap session with the default domain lead (`main/cosmo`, or `coding/cody` when using `-d coding`). The agent scans the project, asks clarifying questions, proposes `AGENTS.md` content and skill suggestions, and waits for your confirmation before writing any files. Re-running `cosmonauts init` reviews the existing setup and proposes improvements instead of stopping when `AGENTS.md` already exists.

## Architecture

Cosmonauts is built as a [Pi package](https://github.com/earendil-works/pi) — extensions, agent definitions, system prompts, and skills that plug into the Pi agent framework.

```
cosmonauts/
├── lib/              Core libraries (tasks, orchestration, plans, chains, agents)
├── domains/          Built-in domains: shared/ and main/
├── bundled/coding/   Installable root-domain package (coding/cody and specialists)
├── cli/              CLI implementation
├── bin/              CLI entry points (cosmonauts)
├── tests/            Test suites (Vitest)
├── missions/         Local, gitignored — active tasks, plans, and archived work (created by init)
├── memory/           Local, gitignored — distilled knowledge from completed work (created by init)
├── .cosmonauts/      Local, gitignored — project config (created by init)
└── docs/             Reference documentation
```

### Agents

Every agent is a Pi session configured by a declarative definition — model, tools, system prompt layers, extensions, skill access, and sub-agent permissions.

| Agent | Role |
|-------|------|
| **Cosmo (`main/cosmo`)** | Cross-domain orchestrator and top-level assistant. Clarifies goals and delegates directly to specialists. |
| **Cody (`coding/cody`)** | Coding-domain coordinator for `cosmonauts -d coding`. Handles coding sessions and delegates to coding specialists. |
| **Planner** | Designs solutions. Explores code, proposes approaches, writes plans. Read-only tools. |
| **Task Manager** | Breaks plans into atomic, implementable tasks with dependencies and ACs. |
| **Coordinator** | Delegates tasks to workers, monitors progress, verifies completion. |
| **Worker** | Implements one task. Full coding tools, ephemeral session. |
| **Integration Verifier** | Checks implemented changes against the approved plan and plan-level contracts. |
| **Quality Manager** | Runs lint/format/typecheck, spawns reviewers and fixers, ensures merge-readiness. |
| **Reviewer** | Clean-context code review against main. Writes findings, does not fix. |
| **Fixer** | Applies targeted remediation from review findings. |

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
- **[docs/prompts.md](./docs/prompts.md)** — Four-layer prompt composition.
- **[docs/testing.md](./docs/testing.md)** — Testing standards and patterns.
- Pi framework API reference: the **`pi` skill** (`domains/shared/skills/pi/SKILL.md`), loaded on demand. It tracks the pinned `@earendil-works/pi-*` packages and points agents to the current Pi repo and docs.

## License

TBD
