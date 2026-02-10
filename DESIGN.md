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

## Design Principles

### Pi-First: Use the Framework

Cosmonauts is built on Pi. Before designing any feature, **check what Pi already provides**. This is not optional — it's the first step in every design decision.

The checklist:

1. **Does Pi's core handle it?** — `createAgentSession`, `DefaultResourceLoader`, `buildSystemPrompt`, built-in tools, session management, compaction, cost tracking. If yes, use it directly.
2. **Does pi-skills provide it?** — `brave-search`, `browser-tools`, and other ready-made skills. If yes, depend on it or adapt it.
3. **Does Pi's extension/skill system enable it?** — `pi.on()` lifecycle events, `pi.registerTool()`, `pi.appendEntry()` for state, `pi.sendMessage()` for injection. If yes, build an extension that hooks into the right event.
4. **Only then build custom.** — If Pi doesn't provide it and can't be extended to do it, build it ourselves.

**Examples of getting this right:**

- Project instructions (AGENTS.md) → Pi's `DefaultResourceLoader` discovers and injects them natively. No extension needed.
- Agent system prompts → Pi's `buildSystemPrompt` composes skills, context files, and custom prompts. We write SKILL.md files, not a custom prompt builder.
- Built-in coding tools → Pi exports `codingTools` and `readOnlyTools` with factory functions. We use these directly.

**Examples of what Pi deliberately doesn't include** (confirmed — we must build):

- Task system (forge-tasks format)
- Sub-agent spawning and orchestration (chain runner)
- Todo/plan tracking ("No built-in to-dos. They confuse models." — Pi README)

### Ongoing Audit

As Pi evolves (207+ releases, lockstep versioning), capabilities change. Before each phase, re-audit the Pi API and pi-skills for new features that might obsolete planned custom work.

---

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

The foundation. We build on Pi rather than building from scratch. Understanding what Pi provides is critical — see [Design Principles: Pi-First](#pi-first-use-the-framework).

**What Pi gives us (use directly, don't rebuild):**

- `createAgentSession()` — in-process agent loop, no CLI spawning
- `session.steer()` / `session.subscribe()` — real-time control and event streaming
- `SessionManager.inMemory()` / `SessionManager.open()` — ephemeral or persistent sessions
- `DefaultResourceLoader` — discovers `AGENTS.md`, `CLAUDE.md`, `SYSTEM.md`, skills, extensions
- `buildSystemPrompt()` — composes base prompt + context files + skills + tools + appended instructions
- `codingTools` / `readOnlyTools` — pre-built tool sets with per-cwd factory functions
- `InteractiveMode` / `runPrintMode()` / `runRpcMode()` — three execution modes
- `completeSimple()` — lightweight LLM calls without a full session (routing, classification)
- Extension system — `pi.on()` lifecycle events, `pi.registerTool()`, `pi.appendEntry()` for state
- Skill system — `SKILL.md` auto-discovery, compose into system prompt as XML
- OAuth auth for Claude Max / ChatGPT Plus (zero marginal cost)
- 20+ LLM providers with unified API
- Session compaction (automatic context management)
- Cost tracking per model per session

**What pi-skills provides (evaluate before building custom):**

- `brave-search` — web search + content extraction via Brave API
- `browser-tools` — browser automation via Chrome DevTools Protocol
- `gdcli` / `gmcli` / `gccli` — Google Drive, Gmail, Calendar
- `transcribe` — speech-to-text via Groq Whisper

**What Pi deliberately omits (we must build):**

- Sub-agent spawning and orchestration
- Task/todo tracking ("confuse models" — Pi README)
- Inter-agent communication
- Budget enforcement

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

Cosmonauts has a single entry point: `cosmonauts`. It supports both interactive and non-interactive modes, like `claude` or `pi`.

```
# Interactive (default) — opens REPL, chat with Cosmo
cosmonauts

# Interactive with initial prompt — opens REPL, starts working
cosmonauts "design an auth system for this project"

# Non-interactive — runs prompt, outputs result, exits
cosmonauts --print "create tasks from PLAN.md and implement them"

# Non-interactive with chain — runs a specific agent pipeline
cosmonauts --print --chain "planner -> task-manager -> coordinator" @PLAN.md

# Interactive with chain — runs the chain, then drops into REPL
cosmonauts --chain "task-manager -> coordinator" @PLAN.md
```

**The `--chain` flag** specifies an orchestration pipeline. Without it, Cosmo (the main agent) decides how to proceed — it might use tools directly, spawn sub-agents, or trigger a chain based on the request.

**The `--print` flag** makes it non-interactive (fire-and-forget). Without it, you stay in the REPL after the initial prompt or chain completes. Pi already provides `--print` support; we pass it through.

```
     ┌──────────────────────────────────────────┐
     │  Cosmo (main agent)                       │
     │  - General-purpose coding assistant        │
     │  - Coding tools + orchestration tools      │
     │  - Todo tool for session task tracking     │
     │  - Swappable system prompt                 │
     │                                            │
     │  Can spawn sub-agents or chains:           │
     │  ├── Planner session                       │
     │  ├── Task Manager session                  │
     │  ├── Coordinator session                   │
     │  │   └── Worker sessions                   │
     │  └── Any custom chain                      │
     └──────────────────────────────────────────┘
```

**Deployment flexibility**: Interactive mode for local development (chat, iterate, trigger chains on the fly). Non-interactive mode (`--print`) for cloud/CI environments where you pipe in a prompt and collect output.

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

**All agents work in both interactive and non-interactive modes.** The role skill defines behavior; the execution mode is determined at session creation (`InteractiveMode` vs `runPrintMode`). In interactive mode, agents can ask clarifying questions. In non-interactive mode, they make reasonable defaults and proceed autonomously.

### Cosmo (Main Agent)

**Purpose**: The default agent you talk to when you start Cosmonauts. A general-purpose coding assistant with orchestration capabilities — like Claude Code, but with the ability to spawn sub-agents and run chains.

**Skills loaded**: `cosmo` (default system prompt) + all orchestration tools
**Tools**: full coding tools + task tools + orchestration tools (`chain_run`, `spawn_agent`) + `todo` tool
**System prompt**: Swappable. Default is a Claude Code-style prompt focused on concise, direct software engineering assistance. Can be overridden with `--system-prompt` (Pi flag passthrough).

**What Cosmo does**:
- Chats, answers questions, reads/writes code — standard coding assistant
- Triggers chains when asked ("run planner -> task-manager -> coordinator")
- Spawns individual sub-agents when appropriate
- Uses the todo tool for multi-step work within a session
- Delegates to specialized agents rather than trying to do everything itself

**What Cosmo does NOT do**:
- Act as a planner, coordinator, or worker itself — it delegates to those roles
- Make autonomous decisions about large-scale changes without user input (in interactive mode)

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

## Project Instructions (AGENTS.md)

Agentic coding tools use project-level markdown files to provide conventions, constraints, and instructions specific to a codebase. Claude Code uses `CLAUDE.md`, Codex uses `AGENTS.md`, Copilot uses `.github/copilot-instructions.md`. Cosmonauts uses **`AGENTS.md`** — it's tool-agnostic by name and becoming a cross-tool standard.

### Pi Handles This Natively

Pi's `DefaultResourceLoader` automatically discovers and injects `AGENTS.md` and `CLAUDE.md` into the agent's system prompt. Discovery order:

1. Global: `~/.pi/agent/AGENTS.md`
2. Parent directories (walking up from cwd)
3. Current directory

All matching files are concatenated and appended to the system prompt as "Project Context." This means **any Cosmonauts agent using `DefaultResourceLoader` gets project instructions for free** — no custom extension needed.

Pi also reads `CLAUDE.md` as a fallback, so Cosmonauts works immediately on projects that already have Claude Code instructions.

### Which Agents Get Project Instructions

Not every agent needs project-level context. The principle: **agents that interact with project artifacts need project instructions; agents that only orchestrate don't.**

| Agent | Needs project context? | Why |
|-------|----------------------|-----|
| Cosmo | Yes | Codes directly, needs conventions |
| Planner | Yes | Designs solutions that must fit the project |
| Worker | Yes | Implements code, must follow conventions |
| Task Manager | No | Creates tasks from plans, doesn't touch code |
| Coordinator | No | Delegates and monitors, no direct project interaction |

For agents that **should** receive project context: use `DefaultResourceLoader` (default behavior).

For agents that **should not**: configure the resource loader to skip context file discovery. This keeps their context window clean and avoids injecting irrelevant information.

As Cosmonauts evolves beyond coding orchestration, new agent types will fall into one category or the other based on whether they interact with project artifacts.

### `cosmonauts init`

Creates `AGENTS.md` for a project. Behavior:

- If `AGENTS.md` already exists → report it, do nothing (or offer to update)
- If `CLAUDE.md` exists but no `AGENTS.md` → bootstrap `AGENTS.md` from `CLAUDE.md` content
- If neither exists → create a template `AGENTS.md` by scanning the project (package.json, tsconfig, Cargo.toml, etc.)

This is a convenience command, not a requirement. Cosmonauts works without it — Pi reads whatever `AGENTS.md` or `CLAUDE.md` is already present.

---

## Orchestration

### Chain Runner

Inspired by Forge's Orchestra. Runs agent pipelines using Pi sessions instead of CLI processes.

**The DSL is pure topology** — it declares which roles run in what order. Loop behavior is intrinsic to each role (coordinator loops, others run once).

```
cosmonauts --chain "planner -> task-manager -> coordinator" "design and implement auth"
cosmonauts --print --chain "task-manager -> coordinator" @PLAN.md
```

Each role knows its own lifecycle:
- **One-shot roles** (planner, task-manager, worker): run once and exit.
- **Loop roles** (coordinator): repeat until their completion check passes.

**Safety caps** are global config, not per-stage DSL:
- `maxTotalIterations` (default: 50) — shared budget across all loop stages.
- `timeoutMs` (default: 30 min) — absolute deadline for the entire chain.

**Completion detection**: the coordinator checks task state directly — when all tasks are Done, it's complete. No stdout markers needed.

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

## Tools

### What Pi Provides (use directly)

Pi exports two pre-built tool sets:

- **`codingTools`**: `read`, `bash`, `edit`, `write` — full coding capability
- **`readOnlyTools`**: `read`, `grep`, `find`, `ls` — exploration only

Factory functions (`createCodingTools(cwd)`, `createReadOnlyTools(cwd)`) create tools scoped to a working directory. Individual factories (`createReadTool`, `createBashTool`, etc.) allow mixing.

Extensions can **override built-in tools** by registering a tool with the same name. The `--no-tools` flag disables all built-ins.

### What pi-skills Provides (evaluate before building)

The `pi-skills` package (`badlogic/pi-skills`) ships ready-made skills compatible with Pi:

- **`brave-search`** — web search + content extraction via Brave API
- **`browser-tools`** — browser automation via Chrome DevTools Protocol

Before building custom `deepwiki_ask`, `web_fetch`, `web_search`, or `browser` tools, evaluate whether pi-skills already covers the need or can be adapted.

### What We Build (custom extensions)

#### Core Tools (Phase 0)

**Task tools**: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search` — the backbone of the system. Ported from forge-tasks format. Pi has no task system by design.

**Todo tool**: `todo_write`, `todo_read` — in-memory, session-scoped task tracking. Pi deliberately omits this ("No built-in to-dos. They confuse models." — Pi README). We build it as an extension, using `pi.appendEntry()` for state persistence. Pi's `plan-mode.ts` example demonstrates the pattern.

| | **Todo tool** | **Forge-tasks** |
|---|---|---|
| Scope | In-session, ephemeral | Project-level, persistent |
| Purpose | Agent organizes its own work steps | Cross-agent task management |
| Lifecycle | Dies with the session | Lives in `forge/tasks/` |
| Who uses it | Any agent, including Cosmo | Task manager, coordinator, workers |

#### Phase 1 Tools

**`deepwiki_ask`** — ask questions about any public GitHub repo via DeepWiki API. Check pi-skills first for existing integration.

**`web_fetch`** — fetch a web page, strip HTML, return readable text. Check if `brave-search` skill's content extraction covers this.

#### Phase 2+ Tools

**`web_search`** — search the web. Evaluate `brave-search` from pi-skills before building custom.

**`browser`** — browser automation for testing UIs. Evaluate `browser-tools` from pi-skills before building custom.

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
├── bin/                      # CLI entry points
│   ├── cosmonauts            # Main entry: creates Pi session, dispatches to mode
│   └── cosmonauts-tasks      # Task management CLI (standalone, no Pi session)
│
├── cli/                      # CLI implementation
│   ├── main.ts               # Session setup, flag parsing, mode dispatch
│   └── tasks/                # cosmonauts-tasks commands
│
├── extensions/               # Pi extensions (auto-loaded)
│   ├── core/index.ts         # Identity injection, project context
│   ├── tasks/index.ts        # Task tools (create, list, view, edit, search)
│   ├── todo/index.ts         # Todo tool (in-memory session task tracking)
│   ├── orchestration/index.ts # Chain runner, sub-agent spawning
│   ├── deepwiki/index.ts     # deepwiki_ask tool (Phase 1)
│   └── web/index.ts          # web_fetch, web_search tools (Phase 1+)
│
├── skills/                   # SKILL.md files (Pi auto-discovers)
│   ├── agents/               # Cosmo, planner, task-manager, coordinator, worker
│   ├── languages/            # TypeScript, Rust, Python, Swift, Go
│   └── domains/              # Testing, code-review, devops, database, etc.
│
└── data/                     # Runtime (~/.cosmonauts/)
    ├── memory/               # Long-term memory (Phase 2+)
    └── projects.json         # Registered repos
```

**Two install paths**:
- `pi install ./cosmonauts` (dev) or `pi install npm:cosmonauts` (published) — extensions and skills auto-load into `pi`.
- `cosmonauts` binary — standalone entry point that creates a Pi session with all cosmonauts extensions/skills loaded, supports `--print`, `--chain`, and all Pi CLI flags.

The `cosmonauts` binary is a thin wrapper: it creates a `createAgentSession()` with cosmonauts config, then dispatches to `InteractiveMode` or `runPrintMode` based on flags. Pi's existing `--print`, `--model`, `--thinking`, `--skill` flags are passed through.

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

### Phase 0: Task System + Chain Runner + CLI

**Goal**: The core loop works end-to-end. You can start Cosmonauts, chat with Cosmo, trigger chains, and have agents implement tasks on a real project.

- [x] Port forge-tasks core (parser, serializer, TaskManager) as a Pi extension
- [x] Register task tools: `task_create`, `task_list`, `task_view`, `task_edit`, `task_search`
- [x] CLI: `cosmonauts-tasks` with init, create, list, view, edit, delete, search commands
- [x] Package scaffold: Pi package manifest, tsconfig, 209 tests passing
- [x] Build chain runner (role-based lifecycle, completion detection via task state, global safety caps)
- [x] Write agent skills: planner, task-manager, coordinator, worker
- [x] Write first language skill: TypeScript
- [x] Cosmo main agent skill (default system prompt, Claude Code-style)
- [ ] Todo tool extension (in-memory session task tracking, `todo_write`/`todo_read`)
- [ ] CLI entry point: `cosmonauts` binary with `--print`, `--chain`, Pi flag passthrough
- [ ] `cosmonauts init` command (bootstrap AGENTS.md from existing CLAUDE.md or project scan)
- [ ] Test end-to-end on a real project

### Phase 1: Tools + Skills

**Goal**: Agents can look things up and work across languages.

- `deepwiki_ask` tool
- `web_fetch` tool
- More language skills: Rust, Python, Swift, Go
- Domain skills: testing, code-review
- Coordinator skill-routing: match task labels to language/domain skills
- Auto-project detection (read package.json/Cargo.toml, suggest appropriate skills)

### Phase 2: Memory + Codebase Intelligence

**Goal**: Agents learn across sessions and understand project context deeply.

- Memory system (port daily-log + MEMORY.md from OpenClaw patterns)
- Memory tools: `memory_search`, `memory_save`
- Context injection via `before_agent_start` hook (memory)
- `web_search` tool (Brave Search API or similar)

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
