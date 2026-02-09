# Cosmonauts

An automated coding orchestration system built on `@mariozechner/pi-coding-agent`. Design solutions, break them into atomic tasks, and let agents implement them.

## Vision

A system where you can:
1. Go to any project directory
2. Describe what you want (or point to a specs file)
3. Get a designed, reviewed solution plan
4. Have agents create atomic tasks from the plan
5. Watch agents implement those tasks autonomously

The critical insight: **the design and planning phase is where the human adds the most value.** Once the plan is solid and tasks are well-defined, execution is mechanical. Cosmonauts optimizes for this — great planning tools, atomic task creation, and reliable autonomous execution.

## Prior Art

Three projects inform this design. We cherry-pick from each rather than adopting any wholesale.

### Claude Forge (orchestration + task system)

The workflow that works: **planner creates tasks, coordinator delegates, workers implement.** We take:

- The planner/coordinator/worker agent pattern
- forge-tasks: markdown files with YAML frontmatter, dependency resolution, acceptance criteria
- Phase separation: planners never code, workers never plan
- Orchestra's chain concept (pipeline + loop with completion detection)
- System prompt patterns (role definition, critical rules, workflow steps)
- Direct spawn mode (config-only agents, no compilation step)

### OpenClaw (tools + infrastructure patterns)

Battle-tested implementations we extract as needed:

- Memory system (daily logs + MEMORY.md + vector/BM25 hybrid search)
- Browser automation (Playwright wrapping, profile management)
- Web search/fetch tool implementations
- Heartbeat scheduling (cost-efficient: skip empty, silent ack, deduplication)
- Session compaction strategy (flush memory before compacting)
- Workspace file conventions (AGENTS.md, TOOLS.md, etc.)

### Pi Agent Framework (runtime)

The foundation. We use Pi's REPL, session management, tool framework, skill system, and auth as-is. What Pi gives us over CLI-spawning (Forge's approach):

- In-process agent loop — `createAgentSession()` instead of spawning processes
- `session.steer()` / `session.subscribe()` for real-time control
- `SessionManager.inMemory()` for ephemeral workers
- OAuth auth for Claude Max / ChatGPT Plus (zero marginal cost)
- Built-in TUI/REPL for the interactive planning layer
- 20+ LLM providers with unified API
- Skill/extension/package system

## How It Differs from Claude Forge

| Aspect | Claude Forge | Cosmonauts |
|--------|-------------|------------|
| **Execution** | Spawns Claude CLI processes | In-process Pi agent sessions |
| **Auth** | CLI handles its own auth | Pi's OAuth (subscriptions, zero cost) |
| **Tools** | Whatever the CLI provides | Custom tool registry we control |
| **Streaming** | stdout parsing + completion markers | Event subscription (no markers needed) |
| **Sessions** | Stateless per-spawn | Persistent JSONL transcripts |
| **Models** | One model per spawn | Switch models mid-session, per-agent |
| **Task system** | CLI tool (forge-tasks) | In-process Pi tool (same format) |
| **Orchestration** | Chain DSL + binary agents | In-process chains + skill-based agents |

---

## Core Workflow

```
You (terminal)
  │
  ├─ cosmonauts plan
  │    ↓
  │  Reads codebase context (CLAUDE.md, package.json, structure)
  │    ↓
  │  You describe what you want (or point to SPECS.md)
  │    ↓
  │  Planner agent explores code, designs solution, proposes approach
  │    ↓
  │  You review and approve the plan (this is where humans add value)
  │    ↓
  │  Task Manager agent creates atomic tasks (markdown files in project)
  │    ↓
  │  You review tasks (optional — can auto-approve)
  │
  ├─ cosmonauts build
  │    ↓
  │  Coordinator picks up ready tasks (no unresolved dependencies)
  │    ↓
  │  Spawns worker agents (in-process via Pi, ephemeral sessions)
  │    ↓
  │  Each worker: read task → implement → check ACs → mark done → commit
  │    ↓
  │  Coordinator loops until all tasks complete
  │    ↓
  │  Summary delivered
  │
  └─ cosmonauts chain "<custom-chain-dsl>"
       (advanced: custom agent pipelines)
```

### The Planning Phase (Most Critical)

This is where quality comes from. The planner agent:

1. **Explores the codebase** — reads project structure, existing patterns, CLAUDE.md, dependencies
2. **Understands the request** — asks clarifying questions if needed (interactive mode)
3. **Designs the solution** — proposes architecture, identifies files to change, considers trade-offs
4. **Writes a plan** — structured document with approach, scope, risks, and implementation order
5. **Gets human approval** — you review, adjust, approve

Only after approval does the task manager break the plan into atomic tasks. This separation means the human controls the "what" and "how", agents control the "do".

### The Task System

Ported from Claude Forge's forge-tasks. Simple, file-based, proven.

**Task format**: markdown files with YAML frontmatter.

```
<project>/forge/tasks/
├── config.json
├── TASK-001 - Create user model.md
├── TASK-002 - Add validation rules.md
├── TASK-003 - Write model tests.md
└── TASK-004 - Add API endpoints.md
```

**Task file anatomy**:

```markdown
---
id: TASK-001
title: Create user model
status: To Do
priority: high
labels:
  - backend
  - database
dependencies: []
createdAt: 2026-02-09T10:00:00.000Z
---

## Description

Create the User model with email and password fields.

<!-- AC:BEGIN -->
- [ ] #1 User model exists with email and password_digest columns
- [ ] #2 Email has uniqueness constraint and index
- [ ] #3 Migration runs cleanly
<!-- AC:END -->
```

**Key properties**:
- **Atomic**: each task is one PR scope, completable in one agent session
- **Outcome-focused ACs**: "User can log in" not "Add handleLogin function"
- **Dependencies**: DAG structure, `--ready` flag finds unblocked tasks
- **Labels**: route tasks to appropriate specialist skills (backend, frontend, api, testing)
- **Status flow**: To Do → In Progress → Done

**Task tools** (registered as Pi tools, not CLI):

| Tool | Description |
|------|-------------|
| `task_create` | Create a new task with title, description, ACs, labels, deps |
| `task_list` | List tasks, filter by status/priority/label/ready |
| `task_view` | Read full task details |
| `task_edit` | Update status, check ACs, append notes |
| `task_search` | Search tasks by text |

Same data format as forge-tasks, but accessed in-process instead of shelling out to a CLI.

---

## Agent Roles

Agents are not separate binaries — they are **Pi sessions with specific skills loaded**. A "planner agent" is just a Pi session with the planner skill and read-only tools. A "worker agent" is a Pi session with a worker skill, language skill, and full coding tools.

### Planner

**Purpose**: Design solutions. Explore code, understand requirements, propose approaches.

**Skills loaded**: `planner` + relevant domain skills
**Tools**: read-only (read, grep, glob, ls, find) + `deepwiki_ask` + `web_search`
**Critical rule**: **Never writes code. Never creates tasks.** Only produces a plan document.

**System prompt pattern**:
```
You are the Planner. You design solutions for codebases.

Your job:
1. Read and understand the codebase structure
2. Understand the requirements
3. Design an implementation approach
4. Write a clear plan with: scope, approach, files to change, risks, order of operations

You do NOT:
- Write or modify code
- Create tasks
- Make implementation decisions the human hasn't approved
```

### Task Manager

**Purpose**: Break approved plans into atomic, implementable tasks.

**Skills loaded**: `task-manager`
**Tools**: read-only + task tools (`task_create`, `task_list`, `task_view`)
**Critical rule**: **Creates tasks, does not implement them.**

**Task creation principles** (from Forge):
- Outcome-focused ACs, not implementation steps
- Each task is single-PR scope (1-7 ACs)
- No forward dependency references
- Standard labels for routing (backend, frontend, api, database, testing, devops)
- Dependencies form a DAG (no cycles)

### Coordinator

**Purpose**: Delegate tasks to workers, monitor progress, verify completion.

**Skills loaded**: `coordinator`
**Tools**: task tools + `spawn_agent`

**Workflow**:
1. `task_list --ready` to find unblocked tasks
2. For each ready task, spawn a worker with appropriate skills
3. Monitor worker progress via `session.subscribe()`
4. Verify task completion (ACs checked, status Done)
5. Loop until all tasks complete or error

### Worker

**Purpose**: Implement one task at a time. Focused, ephemeral.

**Skills loaded**: `worker` + language skill (e.g., `typescript`, `rust`) + domain skill if relevant
**Tools**: full coding tools (read, write, edit, bash, grep, glob) + `task_view` + `task_edit`
**Session**: `SessionManager.inMemory()` — ephemeral, no persistence needed

**Workflow**:
1. Read task via `task_view`
2. Update status to In Progress via `task_edit`
3. Explore relevant code
4. Implement changes
5. Check off ACs incrementally via `task_edit`
6. Run tests
7. Commit with task ID reference
8. Mark task Done

### Specialist Workers

A specialist is just a worker with a specific language/domain skill loaded. The coordinator matches task labels to skills:

| Task Label | Skill Loaded |
|-----------|-------------|
| `backend` + TypeScript project | `worker` + `typescript` |
| `frontend` | `worker` + `typescript` + `frontend` |
| `database` | `worker` + `database` |
| `testing` | `worker` + `testing` |
| `devops` | `worker` + `devops` |
| `rust` | `worker` + `rust` |

---

## Skills

Skills are Pi SKILL.md files — prompt fragments that teach agents domain expertise. Pi auto-discovers them from `skills/` and loads on demand.

### Skill Anatomy

```
skills/
├── agents/                    # Agent role skills
│   ├── planner/SKILL.md
│   ├── task-manager/SKILL.md
│   ├── coordinator/SKILL.md
│   └── worker/SKILL.md
│
├── languages/                 # Language skills
│   ├── typescript/SKILL.md
│   ├── rust/SKILL.md
│   ├── python/SKILL.md
│   ├── swift/SKILL.md
│   └── go/SKILL.md
│
└── domains/                   # Domain skills
    ├── testing/SKILL.md
    ├── code-review/SKILL.md
    ├── devops/SKILL.md
    ├── database/SKILL.md
    ├── api-design/SKILL.md
    └── frontend/SKILL.md
```

### SKILL.md Format

```markdown
---
name: typescript
description: TypeScript/Node/Bun best practices. Load for TypeScript projects.
---

# TypeScript

When working on TypeScript projects:
- Prefer strict typing, avoid `any`
- Use ESM imports, never CommonJS
- Prefer Bun for execution and testing
- Use Vitest for testing
...
```

### Skills vs Agents

| Use a **Skill** when... | Use an **Agent** (separate session) when... |
|---|---|
| It's knowledge/best practices | It needs its own context window |
| It's a prompt fragment | It runs in parallel with other work |
| It composes with other skills | It needs different tools than the parent |
| One agent can hold it in context | It would bloat the parent's context |

---

## Orchestration

### Chain Runner

Inspired by Forge's Orchestra. Runs agent pipelines and loops using Pi sessions instead of CLI processes.

**Pipeline mode**: run agents in sequence, each once.
```
cosmonauts chain "planner -> task-manager"
```

**Loop mode**: run an agent repeatedly until done.
```
cosmonauts chain "coordinator:20"
```

**Combined**: pipeline stages with loops.
```
cosmonauts chain "planner -> task-manager -> coordinator:20"
```

**Completion detection**: instead of stdout markers (Forge), we use Pi's event system. The coordinator checks task state directly — when all tasks are Done, it's complete.

### Sub-Agent Spawning

Each sub-agent is a Pi session with scoped configuration:

```typescript
const worker = await createAgentSession({
  model: "anthropic/claude-sonnet-4-5",
  sessionManager: SessionManager.inMemory(),
  resourceLoader: new DefaultResourceLoader({
    noSkills: true,
    additionalSkillPaths: ["skills/agents/worker", "skills/languages/typescript"],
  }),
  // task tools + coding tools registered
});
await worker.prompt(`Implement TASK-003. [full task content]`);
// Extract result from worker.messages
```

**Key properties**:
- In-process (no CLI spawning overhead)
- Ephemeral (no session persistence for workers)
- Scoped skills (only load what's relevant)
- Different models per agent (Opus for planning, Sonnet for workers, Haiku for scouts)

### Parallel Execution (Phase 3+)

Fan-out independent tasks to multiple workers:

```
Coordinator
  ├── Worker A (TASK-001) ──→ done
  ├── Worker B (TASK-002) ──→ done
  └── Worker C (TASK-003) ──→ done
  collect results → next batch
```

Uses `Promise.all()` on worker sessions. Coordinator batches tasks that have no mutual dependencies.

---

## Custom Tools

Pi provides built-in coding tools (read, write, edit, bash, ls, find, grep). We add these as Pi extensions.

### Core Tools (Phase 0)

**Task tools**: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search` — the backbone of the system. Ported from forge-tasks format.

### Phase 1 Tools

**`deepwiki_ask`** — ask questions about any public GitHub repo via DeepWiki API.

**`web_fetch`** — fetch a web page, strip HTML, return readable text. Port from OpenClaw's implementation.

### Phase 2+ Tools

**`web_search`** — search the web via Brave Search API or similar.

**`browser`** — Playwright-based browser automation for testing UIs. Port patterns from OpenClaw.

**`memory_search` / `memory_save`** — persistent memory across sessions. Port daily-log + MEMORY.md pattern from OpenClaw.

---

## Architecture

Cosmonauts is a **Pi package** — extensions, skills, and tools that plug into Pi.

```
cosmonauts/
├── package.json              # { "pi": { "extensions": [...], "skills": [...] } }
├── tsconfig.json
├── DESIGN.md
│
├── extensions/               # Pi extensions (auto-loaded)
│   ├── core/index.ts         # Identity injection, project context
│   ├── tasks/index.ts        # Task tools (create, list, view, edit, search)
│   ├── orchestration/index.ts # Chain runner, sub-agent spawning
│   ├── deepwiki/index.ts     # deepwiki_ask tool
│   └── web/index.ts          # web_fetch, web_search tools
│
├── skills/                   # SKILL.md files (Pi auto-discovers)
│   ├── agents/               # Planner, task-manager, coordinator, worker
│   ├── languages/            # TypeScript, Rust, Python, Swift, Go
│   └── domains/              # Testing, code-review, devops, database, etc.
│
└── data/                     # Runtime (~/.cosmonauts/)
    ├── memory/               # Long-term memory (Phase 2+)
    └── projects.json         # Registered repos
```

Install: `pi install ./cosmonauts` (dev) or `pi install npm:cosmonauts` (published).

After install, run `pi` normally. Extensions auto-load, skills auto-discover, tools appear. No separate binary.

---

## Tech Stack

- **Runtime**: Bun (dev + execution), Node (production fallback)
- **Language**: TypeScript (ESM, strict)
- **Agent Framework**: `@mariozechner/pi-coding-agent` + `pi-ai` + `pi-agent-core`
- **Schema**: `@sinclair/typebox` (tool parameters)
- **Sessions**: JSONL via Pi's SessionManager
- **Task storage**: Markdown + YAML frontmatter (forge-tasks format)
- **Browser**: Playwright (Phase 2+)
- **Build**: Bun bundler

---

## Roadmap

> **Important**: Each phase will be revised with more detail and a concrete implementation plan before we start building it. The descriptions below are directional — they establish scope and ordering, not final specifications. Before each phase begins, we'll review what we learned from the previous phase, adjust the plan, and write detailed specs.

### Phase 0: Task System + Chain Runner

**Goal**: The core loop works end-to-end. You can plan, create tasks, and have agents implement them on a real project.

- Port forge-tasks core (parser, serializer, TaskManager) as a Pi extension
- Register task tools: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search`
- Build chain runner (pipeline + loop modes, completion detection via task state)
- Write agent skills: planner, task-manager, coordinator, worker
- Write first language skill: TypeScript
- Commands: `cosmonauts plan`, `cosmonauts build`
- Test end-to-end on a real project

### Phase 1: Tools + Skills

**Goal**: Agents can look things up and work across languages.

- `deepwiki_ask` tool
- `web_fetch` tool
- More language skills: Rust, Python, Swift, Go
- Domain skills: testing, code-review
- Coordinator skill-routing: match task labels to language/domain skills
- Auto-project detection (read package.json/Cargo.toml, suggest appropriate skills)
- `cosmonauts chain` command for custom DSL chains

### Phase 2: Memory + Codebase Intelligence

**Goal**: Agents learn across sessions and understand project context deeply.

- Memory system (port daily-log + MEMORY.md from OpenClaw patterns)
- Memory tools: `memory_search`, `memory_save`
- Context injection via `before_agent_start` hook (memory + project context)
- `web_search` tool (Brave Search API or similar)
- Workspace files: AGENTS.md for per-project agent instructions

### Phase 3: Parallel Workers + Browser

**Goal**: Multiple workers in parallel, browser for testing.

- Parallel worker execution (fan-out independent tasks)
- Progress reporting (coordinator subscribes to worker events)
- `browser` tool via Playwright (port patterns from OpenClaw)
- Domain skills: frontend, devops, api-design, database

### Phase 4: Heartbeat + Channels

**Goal**: Autonomous background work, talk to Cosmonauts from anywhere.

- Heartbeat system (port from OpenClaw: periodic timer, HEARTBEAT.md, cost-efficient)
- Decision capture system (manual recording + end-of-session extraction)
- Telegram/WhatsApp transports (via Pi RPC mode or SDK)
- Notification delivery (agent pings you when work is done)

---

## Open Questions

1. **Pi version pinning**: Pin exact version. Pi uses lockstep versioning, `^` could break us.
2. **Auth storage**: Use Pi's default `~/.pi/agent/auth.json` — share credentials with pi CLI.
3. **Data directory**: `~/.cosmonauts/` for memory, projects config. Tasks live in the project directory.
4. **Task location**: `<project>/forge/tasks/` (same as Forge) or `<project>/.cosmonauts/tasks/`?
5. **Search API**: Brave Search (free tier), Tavily, or self-hosted SearXNG?
6. **Browser tool**: Playwright (full, headless) vs CDP direct (lighter, existing Chrome)?
7. **Memory format**: Start with markdown files, upgrade to vector search later (OpenClaw has both).
