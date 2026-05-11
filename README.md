# Cosmonauts

An automated coding orchestration system built on [Pi](https://github.com/badlogic/pi-mono). Describe what you want, get a designed solution, and let agents implement it — from plan to pull request.

## What It Does

Cosmonauts automates the mechanical parts of software development. You handle the creative work (requirements, design decisions, architecture), and agents handle the execution (implementation, testing, commits, code review).

The workflow:

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

**Phase 0 is complete.** The core loop works end-to-end: you can start Cosmonauts, chat with `main/cosmo` (Cosmo), trigger multi-agent pipelines, and have agents implement tasks on real projects.

What's built:
- Task system with markdown files, YAML frontmatter, dependencies, and acceptance criteria
- Chain runner for multi-agent pipelines (planner → task-manager → coordinator → workers → integration-verifier → quality-manager)
- Agent spawner creating scoped Pi sessions from declarative agent definitions
- `main/cosmo` cross-domain orchestration, `coding/cody` coding-domain coordination, and specialist roles such as planner, task-manager, worker, reviewer, and fixer
- Four-layer system prompt architecture with capability-aligned composition
- Plan lifecycle: create plans, link tasks, archive completed work, distill learnings into memory
- Drive runs for approved plan-linked task batches via `run_driver`, `watch_events`, and `cosmonauts drive`
- Named workflows for common pipelines (`plan-and-build`, `tdd`, `spec-and-build`, `spec-and-tdd`, `implement`, `verify`, `adapt`) with adversarial plan review as the default
- CLI with interactive and non-interactive modes
- Todo tool for in-session task tracking
- Vitest test suite passing

What's next: more language/domain skills, web/deepwiki tools, memory system, parallel workers, browser automation. See [ROADMAP.md](./ROADMAP.md).

## Installation

Cosmonauts requires [Bun](https://bun.sh/) and [Pi](https://github.com/badlogic/pi-mono).

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

# 3. (Optional) Customize .cosmonauts/config.json — adjust skills and workflows

# 4. Run your first workflow
cosmonauts --workflow plan-and-build "describe what you want to build"
```

The `scaffold missions` command creates `missions/` and `memory/` directories for tasks, plans, and archived work, plus `.cosmonauts/config.json` with default workflows and skills. All are local and gitignored. You can customize the config to match your project, or use the defaults as-is.

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

Run named workflows defined in your `.cosmonauts/config.json`:

```bash
# Full pipeline: design → tasks → implement → verify
cosmonauts --workflow plan-and-build "design an auth system for this project"

# Implement an existing plan
cosmonauts --workflow implement "implement the plan in missions/plans/auth-system/"

# Run quality checks and remediation on current changes
cosmonauts --workflow verify "review against main and fix findings"

# List available workflows
cosmonauts --list-workflows

# List agents with qualified IDs such as main/cosmo and coding/cody
cosmonauts --list-agents
```

Or use raw chain DSL for custom pipelines:

```bash
cosmonauts --chain "planner -> task-manager -> coordinator -> integration-verifier -> quality-manager" "custom pipeline"
```

The chain DSL supports **bracket groups** for parallel steps and **fan-out** for multiple instances of the same role:

```bash
# Parallel steps: run task-manager and reviewer concurrently, then coordinator
cosmonauts --chain "planner -> [task-manager, reviewer] -> coordinator" "design with review"

# Fan-out: run 3 reviewer instances in parallel
cosmonauts --chain "coordinator -> reviewer[3]" "multi-pass review"
```

> **Fan-out note:** `reviewer[3]` spawns three instances that each receive the **same prompt** — it does not partition work or assign different tasks to each instance. Use fan-out for independent parallel passes, not for task distribution.

### Drive Runs

Run approved plan-linked task batches through the driver loop:

```bash
# Launch a detached external-agent run
cosmonauts drive run --plan auth-system --backend codex --mode detached --branch feature/auth

# Check a detached run and list known runs
cosmonauts drive status run-abc --plan auth-system
cosmonauts drive list

# Resume a previous run
cosmonauts drive run --plan auth-system --resume run-abc
```

Agents use the same driver through `run_driver` and monitor with `watch_events`. Driver runs write artifacts under `missions/sessions/<plan>/runs/<runId>/`.

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

### Project Setup

Bootstrap project instructions for a new codebase:

```bash
cosmonauts init
```

This launches an interactive bootstrap session with the default domain lead (`main/cosmo`, or `coding/cody` when using `-d coding`). The agent scans the project, asks clarifying questions, proposes `AGENTS.md` content and skill suggestions, and waits for your confirmation before writing any files. Re-running `cosmonauts init` reviews the existing setup and proposes improvements instead of stopping when `AGENTS.md` already exists.

## Architecture

Cosmonauts is built as a [Pi package](https://github.com/badlogic/pi-mono) — extensions, agent definitions, system prompts, and skills that plug into the Pi agent framework.

```
cosmonauts/
├── lib/              Core libraries (tasks, orchestration, plans, workflows, agents)
├── domains/          Built-in domains: shared/ and main/
├── bundled/coding/   Installable coding domain (coding/cody and specialists)
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
- **Agent Framework**: `@mariozechner/pi-coding-agent` — pinned exactly, lockstep with the other `pi-*` packages (see `package.json`)
- **Schema**: TypeBox (`typebox`)
- **Tests**: Vitest (`bun run test`)
- **Linter**: Biome (`bun run lint`)

## Documentation

- **[ROADMAP.md](./ROADMAP.md)** — Prioritized backlog of upcoming work.
- **[AGENTS.md](./AGENTS.md)** — Project conventions and instructions for agents working on this codebase.
- **[docs/orchestration.md](./docs/orchestration.md)** — Chains, workflows, drive, CLI surface.
- **[docs/prompts.md](./docs/prompts.md)** — Four-layer prompt composition.
- **[docs/testing.md](./docs/testing.md)** — Testing standards and patterns.
- Pi framework API reference: the **`pi` skill** (`domains/shared/skills/pi/SKILL.md`), loaded on demand.

## License

TBD
