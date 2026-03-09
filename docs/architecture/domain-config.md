# Domain Configuration Architecture

Design for convention-based, multi-domain agent organization in Cosmonauts.

## Motivation

Cosmonauts is designed as a three-layer system: framework, domain agents, and executive assistant. The coding domain is the first implementation, but the architecture should support arbitrary domains (marketing, operations, product management, etc.) without framework changes.

Currently, everything is centralized: agent definitions in one file, prompts in a shared tree, skills in a flat structure. This works for one domain but creates friction for multiple domains and makes future framework extraction harder.

The goal: **convention over configuration**. Put files in the right directory and the framework discovers and wires everything automatically.

## Core Concept

A **domain** is a self-contained directory with a fixed shape. Each domain brings its own agents, prompts, capabilities, skills, and workflows. The framework scans for domains, loads their manifests, and registers everything by convention.

Domains collaborate freely — chains can reference agents from any domain, and agents can spawn sub-agents across domain boundaries.

## Directory Structure

Every domain directory has the same shape. No exceptions, including `shared`.

```
domains/
├── shared/                          # Framework-level resources, same shape as any domain
│   ├── domain.ts                    # Manifest
│   ├── agents/                      # Framework-aware agents (optional, future)
│   ├── prompts/
│   │   ├── base.md                  # Layer 0 — universal operating norms
│   │   └── runtime/
│   │       └── sub-agent.md         # Layer 3 — spawn context template
│   ├── capabilities/                # Universal capability packs (Layer 1)
│   │   ├── core.md
│   │   ├── tasks.md
│   │   ├── spawning.md
│   │   └── todo.md
│   ├── skills/                      # Framework skills (archive, plan, roadmap, task)
│   │   ├── archive/
│   │   ├── plan/
│   │   ├── roadmap/
│   │   └── task/
│   ├── extensions/                  # Shared Pi extensions
│   │   ├── tasks/
│   │   ├── plans/
│   │   ├── orchestration/
│   │   ├── todo/
│   │   └── init/
│   └── workflows.ts                 # Minimal or empty
│
├── coding/                          # First domain — same shape
│   ├── domain.ts                    # { id: "coding", lead: "cosmo" }
│   ├── agents/
│   │   ├── cosmo.ts
│   │   ├── planner.ts
│   │   ├── worker.ts
│   │   ├── coordinator.ts
│   │   ├── task-manager.ts
│   │   ├── quality-manager.ts
│   │   ├── reviewer.ts
│   │   └── fixer.ts
│   ├── prompts/                     # Layer 2 agent personas
│   │   ├── cosmo.md
│   │   ├── planner.md
│   │   ├── worker.md
│   │   ├── coordinator.md
│   │   ├── task-manager.md
│   │   ├── quality-manager.md
│   │   ├── reviewer.md
│   │   └── fixer.md
│   ├── capabilities/                # Domain-specific capability packs (Layer 1)
│   │   ├── coding-readwrite.md
│   │   └── coding-readonly.md
│   ├── skills/
│   │   └── languages/
│   │       └── typescript/
│   └── workflows.ts                 # Domain default workflows
│
├── marketing/                       # Future domain — same shape exactly
│   ├── domain.ts
│   ├── agents/
│   ├── prompts/
│   ├── capabilities/
│   ├── skills/
│   └── workflows.ts
```

## Domain Manifest

Each domain has a `domain.ts` that exports its metadata:

```typescript
interface DomainManifest {
  id: string;                  // "coding", "marketing", "shared"
  description: string;         // Human-readable purpose
  lead?: string;               // Optional entry-point agent (unqualified ID)
  defaultModel?: string;       // Domain-wide model default (agents can override)
}
```

Examples:

```typescript
// domains/shared/domain.ts
export default {
  id: "shared",
  description: "Framework-level resources available to all domains",
} satisfies DomainManifest;

// domains/coding/domain.ts
export default {
  id: "coding",
  description: "Software engineering — design, implement, review, ship",
  lead: "cosmo",
  defaultModel: "anthropic/claude-opus-4-6",
} satisfies DomainManifest;
```

The lead agent is optional. Domains without a lead are "headless" — they provide agents for other domains to reference in chains and sub-agent spawns, but cannot be used as the default interactive agent.

## Convention-Based Agent Definitions

Agent definitions drop the manual `prompts` array. The framework assembles prompts automatically.

### Before (current)

```typescript
export const WORKER_DEFINITION = {
  id: "worker",
  namespace: "coding",
  prompts: [
    "cosmonauts",
    "capabilities/core",
    "capabilities/coding-readwrite",
    "capabilities/tasks",
    "capabilities/todo",
    "agents/coding/worker",
  ],
  // ...
};
```

### After (convention-based)

```typescript
// domains/coding/agents/worker.ts
export default {
  id: "worker",
  description: "Implements a single task...",
  capabilities: ["core", "tasks", "todo", "coding-readwrite"],
  model: "anthropic/claude-opus-4-6",
  tools: "coding",
  extensions: ["tasks", "todo"],
  skills: undefined,
  subagents: [],
  projectContext: true,
  session: "ephemeral",
  loop: false,
} satisfies AgentDefinition;
```

Changes:
- **`namespace` is gone** — inferred from the domain directory the agent lives in.
- **`prompts` is replaced by `capabilities`** — a list of capability pack names, not file paths.
- **Persona prompt is auto-loaded** — the framework finds `domains/{domain}/prompts/{agent-id}.md` by convention.
- **Base prompt is always included** — `domains/shared/prompts/base.md` is prepended to every agent.

## Prompt Assembly (Automatic)

The framework assembles the four prompt layers without manual path wiring:

1. **Layer 0 — Base**: Always load `domains/shared/prompts/base.md`.
2. **Layer 1 — Capabilities**: For each name in the agent's `capabilities` array, resolve the file:
   - First check `domains/{agent's-domain}/capabilities/{name}.md`
   - Fall back to `domains/shared/capabilities/{name}.md`
   - Error if not found in either location
3. **Layer 2 — Persona**: Auto-load `domains/{agent's-domain}/prompts/{agent-id}.md`.
4. **Layer 3 — Runtime**: If spawned as a sub-agent, append `domains/shared/prompts/runtime/sub-agent.md` with variable substitution.

This means: name your agent `worker`, put `worker.md` in your domain's `prompts/` directory, list the capabilities you want — done.

## Agent ID Namespacing

Agent IDs are globally unique as `{domain}/{agent}`:

```
coding/worker
coding/planner
marketing/analyst
shared/diagnostics
```

### Resolution Rules

Unqualified names resolve contextually:

1. **In chain DSL within a domain's `workflows.ts`**: resolve against that domain.
   - `"planner -> coordinator"` in coding's workflows → `coding/planner -> coding/coordinator`
2. **In project config workflows or CLI `--chain`**: resolve against the default domain.
   - `"planner -> coordinator"` with default domain `coding` → `coding/planner -> coding/coordinator`
3. **Explicit qualification always works**: `"marketing/analyst -> coding/worker"` is unambiguous.
4. **Ambiguity is an error**: if `planner` exists in both `coding` and `marketing` and no context disambiguates, the framework reports the conflict and asks the user to qualify.

### Registry Changes

The `AgentRegistry` stores fully qualified IDs:

```typescript
registry.resolve("coding/worker");         // direct lookup
registry.resolve("worker", "coding");      // with domain context
registry.resolveInDomain("coding");        // list all agents in a domain
```

## Skill Resolution

Follows the same domain-first-then-shared pattern as capabilities:

1. Agent's `skills` allowlist + project's `skills` config → compute effective skill set (existing intersection logic, unchanged).
2. Skill file resolution: check `domains/{agent's-domain}/skills/` first, fall back to `domains/shared/skills/`.
3. Framework skills (archive, plan, roadmap, task) live in `domains/shared/skills/` and are available to all domains.
4. Domain-specific skills (e.g., `languages/typescript`) live in their domain's `skills/` directory.

## Extension Resolution

Extensions resolve the same way:

1. Check `domains/{agent's-domain}/extensions/{name}/`
2. Fall back to `domains/shared/extensions/{name}/`

In practice, most extensions (tasks, plans, orchestration, todo, init) are framework-level and live in `shared`. Domain-specific extensions are possible but expected to be rare.

## Workflow Resolution

Workflows come from two sources, merged with project config taking precedence:

1. **Domain workflows**: Each domain's `workflows.ts` exports its default workflows. These are auto-registered with the domain as context for unqualified agent name resolution.
2. **Project workflows**: `.cosmonauts/config.json` defines project-specific workflows (including cross-domain chains). These use the default domain for unqualified resolution.

```typescript
// domains/coding/workflows.ts
export default [
  {
    name: "plan-and-build",
    description: "Full pipeline: design, create tasks, implement, quality gates",
    chain: "planner -> task-manager -> coordinator -> quality-manager",
  },
  {
    name: "implement",
    description: "From existing plan: create tasks, implement, quality gates",
    chain: "task-manager -> coordinator -> quality-manager",
  },
  {
    name: "verify",
    description: "Run quality gates on existing changes",
    chain: "quality-manager",
  },
] satisfies WorkflowDefinition[];
```

Workflow names are globally unique. If two domains define the same workflow name, the framework reports the conflict. Project config can override any workflow.

## Cross-Domain Collaboration

Domains collaborate through two mechanisms:

### Chain composition

Chains reference agents from any domain using qualified names:

```
"marketing/analyst -> marketing/copywriter -> coding/task-manager -> coding/coordinator"
```

### Sub-agent spawning

An agent's `subagents` list can include qualified IDs:

```typescript
// domains/coding/agents/coordinator.ts
export default {
  id: "coordinator",
  subagents: ["worker", "marketing/copywriter"],  // cross-domain spawn
  // ...
};
```

Unqualified names in `subagents` resolve within the agent's own domain. Qualified names reference other domains explicitly.

### No domain dependency declarations

Cross-domain references are open. Any agent can reference any other domain's agents in chains or subagent lists. The `subagents` allowlist on each agent already constrains what can be spawned — no additional domain-level access control is needed.

## CLI UX

### New flag: `--domain` / `-d`

Sets the domain context for the current invocation:

```bash
# Interactive — default domain's lead agent
cosmonauts                                    # → coding/cosmo

# Switch domain context for this invocation
cosmonauts -d marketing                       # → marketing's lead agent
cosmonauts -d marketing -a analyst            # → marketing/analyst

# Unqualified agent resolves in default domain
cosmonauts -a planner                         # → coding/planner

# Qualified agent — explicit, ignores default domain
cosmonauts -a marketing/analyst               # → works regardless of default

# Workflows — same resolution
cosmonauts -w plan-and-build "auth system"    # → coding's plan-and-build
cosmonauts -d marketing -w campaign "Q2"      # → marketing's campaign

# Cross-domain chain — qualify where needed
cosmonauts --chain "marketing/analyst -> coding/worker" "landing page"
```

### Discovery commands

```bash
cosmonauts --list-domains
#   coding (default)    Software engineering — design, implement, review, ship
#   marketing           Marketing content and campaign management

cosmonauts --list-agents
#   shared
#     (none)
#   coding
#     cosmo *           Main coding assistant (lead)
#     planner           Designs solutions...
#     worker            Implements a single task...
#     coordinator       Delegates tasks to workers...
#   marketing
#     analyst           Analyzes marketing data...
#     copywriter        Writes marketing copy...

cosmonauts --list-agents -d coding
#   cosmo *             Main coding assistant (lead)
#   planner             Designs solutions...
#   ...

cosmonauts --list-workflows
#   coding
#     plan-and-build    planner -> task-manager -> coordinator -> quality-manager
#     implement         task-manager -> coordinator -> quality-manager
#     verify            quality-manager
#   marketing
#     campaign          analyst -> copywriter -> quality-manager
```

### Default domain

The project config declares which domain is the default for unqualified resolution:

```json
{
  "domain": "coding"
}
```

If not set, the framework uses the first non-shared domain discovered (alphabetical). The `--domain` flag overrides this per-invocation.

## Project Configuration

```json
{
  "domain": "coding",
  "skills": ["typescript"],
  "workflows": {
    "campaign-with-code": {
      "description": "Cross-domain: marketing analysis then coding implementation",
      "chain": "marketing/analyst -> marketing/copywriter -> coding/planner -> coding/coordinator"
    }
  }
}
```

- `domain` — default for unqualified name resolution.
- `skills` — project-level skill filter (existing behavior, unchanged).
- `workflows` — project-specific workflows, can reference agents from any domain.

No `domains` array is needed. All discovered domains are active. If restriction becomes necessary, it can be added later.

## Domain Discovery

The framework scans the `domains/` directory at startup:

1. List subdirectories of `domains/`.
2. For each subdirectory, check for `domain.ts` (or `domain.json`).
3. If found, load the manifest and register the domain.
4. Walk `agents/` subdirectory, load each `.ts` file as an `AgentDefinition`, stamp with the domain's namespace.
5. Walk `capabilities/`, `prompts/`, `skills/` — index for resolution.
6. Load `workflows.ts` — register domain workflows.

Order: `shared` is always loaded first (other domains depend on its capabilities/extensions).

## Framework Extraction

This design facilitates future separation of framework and content:

- **Framework**: `lib/` (orchestration, config, registry, prompt assembly, chain runner, CLI) + `domains/shared/` (base prompts, shared capabilities, extensions, framework skills).
- **Content**: `domains/coding/`, `domains/marketing/`, etc. — each is a self-contained package of agents, prompts, capabilities, skills, and workflows.

Extracting the framework means shipping `lib/` + `domains/shared/` as a package. Domain directories become separate packages or live in user repositories. The convention-based discovery means domains work identically whether they're in the main package or installed separately.

Project-local domains (in `.cosmonauts/domains/` or a configured path) would allow teams to define custom domains without modifying the cosmonauts package. The discovery mechanism is the same — scan a directory, find manifests, register.

## What Changes in the Framework

Framework layer (`lib/`) remains domain-agnostic. Changes:

| Component | Change |
|-----------|--------|
| **Domain loader** (new) | Scans `domains/`, reads manifests, registers agents/skills/workflows |
| **Agent registry** | Keys become `domain/agent`, gains namespace-aware resolution |
| **Agent definition type** | `prompts` → `capabilities`, `namespace` removed (inferred) |
| **Prompt loader** | Resolves capabilities domain-first then shared, auto-loads persona |
| **Chain parser** | Handles qualified (`coding/planner`) and unqualified (`planner`) names |
| **Config loader** | Adds `domain` field, merges domain workflows with project overrides |
| **CLI** | Adds `--domain` flag, `--list-domains`, grouped discovery output |
| **Definitions file** | Deleted — agents move into `domains/coding/agents/*.ts` |

**Unchanged**: chain runner, task system, plan system, Pi integration, extension loading mechanics.

## What Doesn't Change

- **Chain runner** — receives `ChainStage[]`, doesn't care about domains.
- **Task system** — tasks are domain-agnostic markdown files.
- **Plan system** — same.
- **Pi integration** — sessions, tools, extensions — all unchanged.
- **Extension loading** — physically relocated to `domains/shared/extensions/` but API identical.
