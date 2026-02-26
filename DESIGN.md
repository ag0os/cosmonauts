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
- System prompt composition → Pi's `additionalSkillPaths` lets us layer prompt files at session creation. We compose base prompts + role overlays using this mechanism.
- Built-in coding tools → Pi exports `codingTools` and `readOnlyTools` with factory functions. We use these directly.

**Examples of what Pi deliberately doesn't include** (confirmed — we must build):

- Task system (forge-tasks format)
- Sub-agent spawning and orchestration (chain runner)
- Todo/plan tracking ("No built-in to-dos. They confuse models." — Pi README)

### Ongoing Audit

As Pi evolves (207+ releases, lockstep versioning), capabilities change. Before each phase, re-audit the Pi API and pi-skills for new features that might obsolete planned custom work.

### Architecture Vision

Cosmonauts is designed as three layers, each more specialized than the last:

- **Layer 1: Framework** — Orchestration, persistence, tasks, CLI, agent definitions, skill loading. Domain-agnostic infrastructure that any agent domain can build on.
- **Layer 2: Domain agents** — Coding (Cosmo) is the first domain. Each domain brings its own base system prompt, agent definitions, workflows, and skills. Future domains (marketing, ops, etc.) plug in as new prompts, agent definitions, and skills — requiring no framework changes.
- **Layer 3: Executive assistant** (future) — An always-on heartbeat that triggers domain workflows, captures decisions, and manages long-running projects.

"Coding with Cosmo" is the DEFAULT domain, not the ONLY possibility. Adding a new domain later means writing new system prompts + agent definitions + skills — the framework stays unchanged.

### Three Pillars: Agents, Prompts, Skills

Cosmonauts separates three concepts that are often conflated:

**Agent definitions** are declarative config objects that describe an agent's identity and capabilities: what model it uses, which tools it has, what system prompt layers compose its behavior, which skills it can access, and which other agents it can spawn. Every agent — including Cosmo — is defined the same way. Any agent can serve as a sub-agent when spawned by another.

**System prompts** are composable prompt layers that define WHO an agent IS. A coding agent gets a base coding prompt (tone, conventions, tool discipline) plus a role overlay (planner constraints, worker workflow, etc.). These are loaded at session creation and injected into the system prompt. They are not fetched on demand — they ARE the agent's identity.

**Skills** are on-demand capability files that teach agents HOW to do specific things. A TypeScript skill teaches TypeScript patterns. A testing skill teaches testing strategies. Unlike system prompts, skills are NOT injected wholesale at session creation. Instead, the agent receives a **skill index** — a list of available skills with one-line descriptions. When the agent decides it needs a skill for the current task, it fetches the full content via Pi's built-in `/skill:name` command or `read` tool. This is the Claude Code approach: give the agent awareness of what's available, let it load what it needs, save tokens.

**Why this separation matters:**

The alternative (everything is a "skill" injected at session creation) creates two problems:

1. **Token waste**: Injecting all skills into every agent's system prompt burns tokens on knowledge the agent may never use. A worker implementing a database migration doesn't need frontend testing patterns in context.

2. **Identity confusion**: When agent role definitions and domain knowledge live in the same mechanism, it's unclear what defines the agent vs what the agent knows. Cosmo's identity prompt is not the same kind of thing as "how to write TypeScript tests."

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
- Skill system — `SKILL.md` auto-discovery via `additionalSkillPaths`, used for system prompt composition
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
| **Orchestration** | Chain DSL + binary agents | In-process chains + definition-based agents |

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

# Named workflow — run a predefined agent pipeline
cosmonauts --workflow plan-and-build "design an auth system"
cosmonauts --print --workflow implement "create tasks from PLAN.md and implement"

# Raw chain DSL — advanced escape hatch
cosmonauts --chain "planner -> coordinator" "custom pipeline"
```

**The `--workflow` flag** is the primary way to run multi-agent pipelines. Named workflows map to chain DSL expressions defined in config. Built-in workflows: `plan-and-build`, `implement`, `plan`. No `@file` references — tell the agent in natural language what document to work with.

**The `--chain` flag** is the advanced escape hatch for custom pipelines. Specifies a raw chain DSL expression directly.

**The `--print` flag** makes it non-interactive (fire-and-forget). Without it, you stay in the REPL after the initial prompt or chain completes.

**Explicit flags** (Phase 0): `--print`, `--workflow`, `--chain`, `--model`, `--thinking`. Each declared explicitly in Commander — no catch-all passthrough of Pi flags.

```
     ┌──────────────────────────────────────────┐
     │  Cosmo (main agent)                       │
     │  - General-purpose coding assistant        │
     │  - Coding + orchestration tools              │
     │  - Loads skills on demand                   │
     │  - Swappable system prompt (coding-base)   │
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

**Plan association**: Tasks can be linked to a plan via `plan:<slug>` labels. The `task_create` tool accepts an optional `plan` parameter that auto-adds the appropriate `plan:<slug>` label — do not add it manually. A task can have at most one `plan:` label. Use `task_list` with `--label plan:<slug>` to see all tasks for a plan.

### Forge Lifecycle

The forge lifecycle manages the full arc of implementation work:

```
plan → tasks → implement → archive → distill
```

**Plans** (`forge/plans/<slug>/`): Implementation plans containing `plan.md` (required) and `spec.md` (optional). Created via the `plan_create` tool. A plan scopes a body of work, describes the approach, and produces tasks that agents can implement. Plans have `active` or `completed` status.

**Task-plan linkage**: Tasks associate with plans via `plan:<slug>` labels. The `task_create` tool's `plan` parameter auto-adds this label. Tasks stay flat in `forge/tasks/` — they are not nested under the plan directory. Use `task_list` label filtering to query tasks by plan.

**Archive** (`forge/archive/`): Completed plans and their associated tasks are moved here by `plan_archive`. This is a mechanical operation — no LLM involved. It preserves the original file structure under `archive/plans/` and `archive/tasks/`. The archive is browseable and reversible. Safety check: rejects if any associated tasks are not Done.

**Memory** (`memory/`): Distilled knowledge from archived work. Written by agents using the `forge-archive` skill. Memory files are a project-level resource, consumed as context the same way AGENTS.md or skills are. The `memory/` directory is the shared storage backend for all distilled knowledge, regardless of source.

**Distillation**: Agent-driven extraction of learnings from archived materials into memory files. Explicitly triggered, not automatic. Implemented as a Pi skill (`forge-archive`) that teaches any agent how to read archived plans and tasks, extract key decisions and patterns, and write a memory file to `memory/<slug>.md`.

**Plan tools**:

| Tool | Description |
|------|-------------|
| `plan_create` | Create a new plan directory with `plan.md` and optional `spec.md` |
| `plan_list` | List plans with status and associated task counts |
| `plan_view` | View full plan content and summary of associated tasks |
| `plan_archive` | Archive a completed plan and its associated tasks to `forge/archive/` |

---

## Agent System

Agents are **Pi sessions configured by declarative agent definitions**. An agent definition specifies the model, system prompt layers, tools, extensions, skill access, and sub-agent permissions. Every agent — including Cosmo — is defined the same way and can serve as a sub-agent when spawned by another.

**All agents work in both interactive and non-interactive modes.** The system prompt defines behavior; the execution mode is determined at session creation (`InteractiveMode` vs `runPrintMode`). In interactive mode, agents can ask clarifying questions. In non-interactive mode, they make reasonable defaults and proceed autonomously.

### Agent Definition

Each agent is defined by a declarative config:

```typescript
interface AgentDefinition {
  /** Unique agent identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** System prompt layers, composed in order (paths to prompt files) */
  prompts: string[];
  /** Default model (provider/model-id format) */
  model: string;
  /** Tool set: "coding" (full), "readonly" (exploration), "none" */
  tools: "coding" | "readonly" | "none";
  /** Pi extensions to load */
  extensions: string[];
  /** Skill access: undefined = all available, string[] = allowlist, [] = none */
  skills?: string[];
  /** Which agent IDs this agent can spawn as sub-agents */
  subagents?: string[];
  /** Whether to load project context (AGENTS.md/CLAUDE.md) */
  projectContext: boolean;
  /** Session persistence mode */
  session: "ephemeral" | "persistent";
}
```

Built-in agent definitions:

| Agent | Prompts | Tools | Extensions | Skills | Subagents | Context |
|-------|---------|-------|------------|--------|-----------|---------|
| cosmo | coding-base | coding | tasks, plans, orchestration, todo, init | all | planner, task-manager, coordinator, worker | yes |
| planner | coding-base + planner-role | readonly | plans | all | — | yes |
| task-manager | task-manager-role | readonly | tasks | — | — | no |
| coordinator | coordinator-role | none | tasks, orchestration | — | worker | no |
| worker | coding-base + worker-role | coding | tasks, todo | per-task | — | yes |

### System Prompt Composition

System prompts are composable layers that define the agent's identity and behavior. They are loaded at session creation via Pi's `additionalSkillPaths` mechanism and injected into the system prompt. They are NOT fetched on demand — they ARE the identity.

```
cosmo        → [coding-base]
planner      → [coding-base] + [planner-role]
worker       → [coding-base] + [worker-role]
coordinator  → [coordinator-role]          (no coding base — orchestration only)
task-manager → [task-manager-role]         (no coding base — task creation only)
```

The **coding-base** prompt defines the shared identity for agents that interact with code: tone and style (concise, direct), tool discipline (use dedicated tools over bash), convention-following, git workflow, and professional objectivity. Think of it as the Claude Code personality.

**Role prompts** layer constraints and workflows on top: planners get exploration workflow + output format + "never write code" rules; workers get implementation workflow + AC tracking + "stay in scope" rules; coordinators get delegation workflow + error handling.

Agents that touch project artifacts (cosmo, planner, worker) also get project context (AGENTS.md/CLAUDE.md) via `DefaultResourceLoader`. Orchestration-only agents (coordinator, task-manager) skip it to keep their context clean.

### Sub-Agent Spawning

Every agent can be a sub-agent. When agent A spawns agent B:

- B's session is created from B's agent definition (same prompts, tools, extensions)
- B is constrained by A's `subagents` allowlist — A can only spawn agents it's permitted to
- The parent-child relationship is tracked (who spawned whom, session IDs)
- Sub-agent sessions are always ephemeral regardless of the agent's default session mode

The `spawn_agent` tool takes an agent ID, resolving the full agent definition to configure the session. This replaces the old approach of hardcoded role-to-config switch statements.

### Cosmo (Main Agent)

**Purpose**: The default agent you talk to when you start Cosmonauts. A general-purpose coding assistant with orchestration capabilities — like Claude Code, but with the ability to spawn sub-agents and run chains.

**System prompt**: coding-base (swappable via `--system-prompt`)
**Tools**: full coding tools + task tools + orchestration tools (`chain_run`, `spawn_agent`) + `todo` tool
**Can spawn**: planner, task-manager, coordinator, worker

**What Cosmo does**:
- Chats, answers questions, reads/writes code — standard coding assistant
- Triggers chains when asked ("run planner -> task-manager -> coordinator")
- Spawns individual sub-agents when appropriate
- Loads skills on demand when it needs domain expertise
- Uses the todo tool for multi-step work within a session
- Delegates to specialized agents rather than trying to do everything itself

**What Cosmo does NOT do**:
- Act as a planner, coordinator, or worker itself — it delegates to those roles
- Make autonomous decisions about large-scale changes without user input (in interactive mode)

### Planner

**Purpose**: Design solutions. Explore code, understand requirements, propose approaches.

**System prompt**: coding-base + planner-role
**Tools**: read-only (read, grep, glob, ls, find) + `deepwiki_ask` + `web_search` + `plan_create`
**Critical rule**: **Never writes code. Never creates tasks.** Creates plan documents via `plan_create`.

### Task Manager

**Purpose**: Break approved plans into atomic, implementable tasks.

**System prompt**: task-manager-role
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

**System prompt**: coordinator-role
**Tools**: task tools + `spawn_agent`
**Can spawn**: worker

**Workflow**:
1. `task_list --ready` to find unblocked tasks
2. For each ready task, spawn a worker
3. Monitor worker progress via `session.subscribe()`
4. Verify task completion (ACs checked, status Done)
5. Loop until all tasks complete or error

The coordinator tells the worker (via its spawn prompt) which skills to load based on task labels.

### Worker

**Purpose**: Implement one task at a time. Focused, ephemeral.

**System prompt**: coding-base + worker-role
**Tools**: full coding tools (read, write, edit, bash, grep, glob) + `task_view` + `task_edit`
**Session**: always ephemeral

**Workflow**:
1. Load relevant skills based on task labels (e.g., `/skill:typescript`, `/skill:testing`)
2. Read task via `task_view`
3. Update status to In Progress via `task_edit`
4. Explore relevant code
5. Implement changes
6. Check off ACs incrementally via `task_edit`
7. Run tests
8. Commit with task ID reference
9. Mark task Done

### Specialist Routing

The coordinator matches task labels to skills and instructs the worker which to load:

| Task Label | Skills to Load |
|-----------|-------------|
| `backend` + TypeScript project | `typescript` |
| `frontend` | `typescript` + `frontend` |
| `database` | `database` |
| `testing` | `testing` |
| `devops` | `devops` |
| `rust` | `rust` |

The worker loads each skill into its context at the start of its session. A task labeled `backend` + `testing` gets both the typescript and testing skills loaded.

---

## Skills

Skills are declarative knowledge files that teach agents domain expertise. They are loaded **on demand** — the agent decides when it needs a skill and fetches it via Pi's built-in `/skill:name` command or `read` tool.

**Skills are NOT system prompts.** System prompts define agent identity and behavior (see [System Prompt Composition](#system-prompt-composition)). Skills provide domain knowledge — TypeScript patterns, testing strategies, database design guidelines. They live in a separate directory and are loaded through a different mechanism.

### How Skills Work

Pi discovers `SKILL.md` files from directories listed in `package.json`'s `pi.skills` field. At session creation, every agent with skill access receives a **skill index** in its system prompt — a list of available skills with one-line descriptions. When the agent encounters a task that requires specific domain knowledge, it uses `/skill:typescript` to load the full skill content into context. The agent decides what to load — this saves significant tokens compared to injecting all skills into every agent's system prompt.

### Skill Anatomy

```
skills/
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

Note: agent system prompts (cosmo, planner, worker, etc.) are NOT in the `skills/` directory. They live in `prompts/` and are loaded as system prompt layers at session creation. See [System Prompt Composition](#system-prompt-composition).

### SKILL.md Format

```markdown
---
name: typescript
description: TypeScript best practices and patterns. Load for TypeScript projects.
---

# TypeScript

When working on TypeScript projects:
- Prefer strict typing, avoid `any`
- Use ESM imports, never CommonJS
- Prefer Bun for execution and testing
- Use Vitest for testing
...
```

The `description` field is what appears in the skill index. Keep it concise — one line that tells the agent when to load this skill.

### Skill Access Control

Agent definitions include a `skills` field that controls which skills the agent can load. This is enforced via Pi's `skillsOverride` at session creation:

- `undefined` (omitted) — agent can load any skill (cosmo, planner, worker)
- `["typescript", "testing"]` — agent can only load these specific skills
- `[]` — agent cannot load any skills (coordinator, task-manager — they don't need domain knowledge)

The coordinator uses task labels to determine which skills a worker should load. It passes this guidance in the worker's spawn prompt: "Load the typescript and testing skills for this task."

### Skills vs System Prompts

| | **System Prompts** | **Skills** |
|---|---|---|
| Purpose | Define agent identity and behavior | Provide domain knowledge |
| Loading | At session creation (always present) | On demand via `/skill:name` |
| Examples | Coding-base, planner-role, worker-role | TypeScript patterns, testing strategies |
| Token cost | Always in context | Only when needed |
| Location | `prompts/` directory | `skills/` directory |

### Skills vs Agents

| Use a **Skill** when... | Use an **Agent** (sub-agent) when... |
|---|---|
| It's domain knowledge/best practices | It needs its own context window |
| Agent selectively loads it for the current task | It runs in parallel with other work |
| It composes with other knowledge | It needs different tools than the parent |
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

Not every agent needs project-level context. This is controlled by the `projectContext` field in the agent definition. The principle: **agents that interact with project artifacts need project instructions; agents that only orchestrate don't.**

| Agent | `projectContext` | Why |
|-------|-----------------|-----|
| Cosmo | `true` | Codes directly, needs conventions |
| Planner | `true` | Designs solutions that must fit the project |
| Worker | `true` | Implements code, must follow conventions |
| Task Manager | `false` | Creates tasks from plans, doesn't touch code |
| Coordinator | `false` | Delegates and monitors, no direct project interaction |

When `projectContext` is true, `DefaultResourceLoader` discovers and injects AGENTS.md/CLAUDE.md. When false, context file discovery is skipped to keep the agent's context clean.

### `cosmonauts init`

Agent-driven project initialization. Not a hardcoded CLI subcommand — it's a Pi command (`/init`) backed by an extension. The agent analyzes the project and creates `AGENTS.md`.

**Two entry points, same prompt:**
- REPL: `/init` (Cosmo runs the init prompt interactively)
- CLI: `cosmonauts init` (runs the init prompt in print mode)

**Behavior:**
- If `AGENTS.md` already exists → report it, do nothing (or offer to update)
- If `CLAUDE.md` exists but no `AGENTS.md` → bootstrap `AGENTS.md` from `CLAUDE.md` content
- If neither exists → create `AGENTS.md` by scanning project manifests (package.json, tsconfig, Cargo.toml, etc.)

Both paths use the same `buildInitPrompt()` function, which generates a structured prompt telling Cosmo what to do. This is a convenience command, not a requirement — Cosmonauts works without it.

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

Each sub-agent is a Pi session configured from its agent definition:

```typescript
// The spawner resolves the agent definition for "worker":
//   prompts: [coding-base, worker-role]
//   tools: coding
//   extensions: [tasks, todo]
//   projectContext: true
//   session: ephemeral
const result = await spawner.spawn({
  agentId: "worker",
  cwd: projectRoot,
  prompt: `Implement TASK-003. Load the typescript skill. [full task content]`,
});
```

**Key properties**:
- In-process (no CLI spawning overhead)
- Always ephemeral (sub-agent sessions are never persisted)
- Configured by agent definition (no hardcoded switch statements)
- Skills loaded on demand by the agent itself
- Different models per agent (Opus for planning, Sonnet for workers, Haiku for scouts)
- Parent-child relationship tracked (which agent spawned which)

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

### Workflow System

Named workflows are the primary user interface for multi-agent pipelines, replacing raw `--chain` DSL for common use cases.

**Built-in workflows:**

| Name | Chain | Purpose |
|------|-------|---------|
| `plan-and-build` | `planner -> task-manager -> coordinator` | Full pipeline: design, create tasks, implement |
| `implement` | `task-manager -> coordinator` | Create tasks from existing plan and implement |
| `plan` | `planner` | Design only |

**Custom project workflows** are defined in `.cosmonauts/workflows.json`:

```json
{
  "workflows": {
    "refactor": {
      "description": "Plan and implement a refactoring",
      "chain": "planner -> task-manager -> coordinator"
    }
  }
}
```

Project-level definitions override built-in defaults on name collision. Missing config file = defaults only.

**CLI usage:**

```
cosmonauts --workflow plan-and-build "design an auth system"
cosmonauts --list-workflows   # show available workflows
```

### Chain Output (Non-Interactive Mode)

When running chains with `--print`, events stream to stderr for observability while the final output goes to stdout:

```
[chain] Starting: planner -> task-manager -> coordinator
[planner] Starting...
[planner] Completed (45s)
[task-manager] Starting...
[task-manager] Completed (12s)
[coordinator] Starting iteration 1...
[coordinator] Spawned worker (session-abc123)
[coordinator] Iteration 1 complete
[chain] Complete (5m 23s)
```

Each `ChainEvent` type maps to a formatted stderr line. This lets you pipe the final result while still seeing progress.

### Session Persistence

Cosmo (the main agent in interactive mode) uses `SessionManager.continueRecent()` for persistent sessions across REPL invocations. This continues the most recent session for the current working directory, or creates a new one.

Workers stay ephemeral (`SessionManager.inMemory()`). Print mode is always ephemeral (one-shot).

Future: extract decisions and important context from persisted sessions for long-term memory.

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

Cosmonauts is a **Pi package** — extensions, agent definitions, system prompts, skills, and tools that plug into Pi.

```
cosmonauts/
├── package.json              # { "pi": { "extensions": [...] } }
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
├── lib/                      # Core libraries (no Pi dependency)
│   ├── agents/               # Agent definitions, resolver
│   ├── orchestration/        # Chain parser, runner, agent spawner
│   ├── tasks/                # Task manager, parser, serializer
│   └── workflows/            # Workflow definitions, loader, defaults
│
├── extensions/               # Pi extensions
│   ├── tasks/index.ts        # Task tools (create, list, view, edit, search)
│   ├── plans/index.ts        # Plan tools (create, list, view, archive)
│   ├── todo/index.ts         # Todo tool (in-memory session task tracking)
│   ├── orchestration/index.ts # Chain runner, sub-agent spawning
│   ├── init/index.ts         # /init command (agent-driven AGENTS.md bootstrap)
│   ├── deepwiki/index.ts     # deepwiki_ask tool (Phase 1)
│   └── web/index.ts          # web_fetch, web_search tools (Phase 1+)
│
├── prompts/                  # System prompt layers (loaded at session creation)
│   ├── base/
│   │   └── coding.md         # Base coding agent identity (tone, conventions, tools)
│   └── roles/
│       ├── planner.md        # Planner constraints and workflow
│       ├── task-manager.md   # Task creation rules
│       ├── coordinator.md    # Delegation and monitoring workflow
│       └── worker.md         # Implementation workflow
│
├── skills/                   # On-demand capabilities (loaded via /skill:name)
│   ├── languages/            # TypeScript, Rust, Python, Swift, Go
│   └── domains/              # Testing, code-review, devops, database, forge-plan, etc.
│
├── forge/                    # Project work lifecycle
│   ├── tasks/                # Active task files (markdown + YAML frontmatter)
│   ├── plans/                # Active plan directories (plan.md, optional spec.md)
│   │   └── <slug>/plan.md
│   └── archive/              # Completed plans and tasks (preserved after archive)
│       ├── plans/            # Archived plan directories
│       └── tasks/            # Archived task files
│
├── memory/                   # Distilled knowledge from completed work (project root)
│
└── data/                     # Runtime (~/.cosmonauts/)
    ├── memory/               # Long-term memory (Phase 2+)
    └── projects.json         # Registered repos
```

**Two install paths**:
- `pi install ./cosmonauts` (dev) or `pi install npm:cosmonauts` (published) — extensions auto-load into `pi`.
- `cosmonauts` binary — standalone entry point that creates a Pi session with cosmonauts agent definitions, extensions, and prompt layers loaded.

The `cosmonauts` binary is a thin wrapper: it resolves the Cosmo agent definition, creates a `createAgentSession()` with the appropriate prompts/tools/extensions, then dispatches to `InteractiveMode` or `runPrintMode` based on flags.

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
- [x] Package scaffold: Pi package manifest, tsconfig, 228 tests passing
- [x] Build chain runner (role-based lifecycle, completion detection via task state, global safety caps)
- [x] Write agent system prompts: planner, task-manager, coordinator, worker
- [x] Write first language skill: TypeScript
- [x] Cosmo main agent system prompt (coding-base, Claude Code-style)
- [x] Todo tool extension (in-memory session task tracking, `todo_write`/`todo_read`)
- [x] Agent definitions (declarative config for all agents, replaces hardcoded switch statements)
- [x] System prompt separation (move agent prompts from `skills/agents/` to `prompts/`)
- [x] Workflow system (named workflows, config loading, built-in defaults)
- [x] Agent spawner rewrite (resolve agent definitions instead of role-based switch statements)
- [x] CLI entry point: `cosmonauts` binary with `--print`, `--workflow`, `--chain`, `--model`, `--thinking`
- [x] `cosmonauts init` command (agent-driven AGENTS.md bootstrap via `/init` Pi command)
- [x] Forge lifecycle: plans, archive, memory, distillation (plan tools, task-plan linkage, archive tool, forge-plan and forge-archive skills)
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
