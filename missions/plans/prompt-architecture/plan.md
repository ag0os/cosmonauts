---
title: System Prompt Architecture - Layered Composition and Capability Alignment
status: active
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Summary

Refactor prompt architecture from ad-hoc `base + role` layering to an explicit four-layer contract with deterministic precedence:

1. platform base
2. capability packs
3. persona (authoritative)
4. runtime context (spawn-time)

This removes identity bleed, prevents tool/prompt mismatches, and creates a safer path for future multi-domain agents.

## Scope

In scope:
- Prompt structure and prompt content redistribution
- Agent definition shape and prompt arrays
- Spawn-time runtime context injection contract
- Tests and DESIGN.md updates

Out of scope:
- New agent roles (reviewer/debugger/etc.)
- New orchestration behavior beyond runtime context metadata
- Skill system changes

Assumptions:
- Prompt files are loaded via local prompt loader (`lib/prompts/loader.ts`), not Pi skill resolution.
- Existing built-in agents remain: `cosmo`, `planner`, `task-manager`, `coordinator`, `worker`.

## Current Problems

- `prompts/base/coding.md` mixes identity, shared coding discipline, orchestration instructions, and role-specific constraints.
- Planner and worker inherit Cosmo identity text before role prompts.
- Prompt precedence is currently implicit and fragile ("last instruction wins").
- Some prompt content does not align with actual tool access (e.g. readonly agents inheriting coding/bash discipline).
- No structured spawn context contract for runtime sub-agent framing.

## Design

### Composition Contract (Authoritative)

All agents must compose prompts in this exact order:

1. **Layer 0: Platform base**
2. **Layer 1: Capabilities** (0..n)
3. **Layer 2: Persona** (exactly 1)
4. **Layer 3: Runtime context** (optional, spawn-time)

Rationale:
- Persona must come after capabilities so role constraints remain authoritative.
- Runtime context must come last so invocation-specific constraints override static defaults.

### Layer Definitions

**Layer 0 - Platform Base** (`prompts/cosmonauts.md`)
- Universal operating norms shared by all agents
- Concision, objectivity, accuracy over validation
- High-level context: agent is part of Cosmonauts

**Layer 1 - Capabilities** (`prompts/capabilities/*.md`)
- Reusable discipline bundles mapped to tool surfaces
- No identity language (never "You are X")

**Layer 2 - Persona** (`prompts/agents/<namespace>/<agent>.md`)
- Exactly one persona per agent
- Identity, workflow, role constraints, role-specific rules
- Persona is final authority for role behavior

**Layer 3 - Runtime Context** (`prompts/runtime/sub-agent.md`)
- Spawn-time overlay indicating invocation context
- Parent role, objective, optional task id
- Added only when spawn context indicates sub-agent execution

### Capability Packs (Tool-Aligned)

Split capabilities by actual execution surface to avoid instruction/tool mismatch:

- `capabilities/core.md`
  - Shared communication and quality norms for all agents
- `capabilities/coding-readwrite.md`
  - Coding conventions, editing discipline, bash/git behavior for agents with `tools: "coding"`
- `capabilities/coding-readonly.md`
  - Exploration/reasoning discipline for agents with `tools: "readonly"`
- `capabilities/tasks.md`
  - Task system references (`task_*`) for agents with tasks extension
- `capabilities/spawning.md`
  - Spawn/chain references for agents that delegate (`spawn_agent`, `chain_run`)
- `capabilities/todo.md`
  - Todo usage only for agents with todo extension

### Agent Prompt Mapping

```ts
// cosmo
prompts: [
  "cosmonauts",
  "capabilities/core",
  "capabilities/coding-readwrite",
  "capabilities/tasks",
  "capabilities/spawning",
  "capabilities/todo",
  "agents/coding/cosmo",
]

// planner
prompts: [
  "cosmonauts",
  "capabilities/core",
  "capabilities/coding-readonly",
  "agents/coding/planner",
]

// task-manager
prompts: [
  "cosmonauts",
  "capabilities/core",
  "capabilities/tasks",
  "agents/coding/task-manager",
]

// coordinator
prompts: [
  "cosmonauts",
  "capabilities/core",
  "capabilities/tasks",
  "capabilities/spawning",
  "agents/coding/coordinator",
]

// worker
prompts: [
  "cosmonauts",
  "capabilities/core",
  "capabilities/coding-readwrite",
  "capabilities/tasks",
  "capabilities/todo",
  "agents/coding/worker",
]
```

### Namespacing

Add namespace metadata to `AgentDefinition` with a backward-compatible migration:

```ts
interface AgentDefinition {
  readonly id: string;
  readonly namespace?: string; // phase 1 optional, default "coding"
  // ...existing fields
}
```

Migration policy:
- Built-ins explicitly set `namespace: "coding"`.
- Registry/resolver code treats missing namespace as `"coding"`.
- Namespace can become required in a later major version.

### Runtime Sub-Agent Context Contract

Introduce structured runtime context in spawner types.

```ts
interface SpawnRuntimeContext {
  readonly mode: "top-level" | "sub-agent";
  readonly parentRole?: string;
  readonly objective?: string;
  readonly taskId?: string;
}

interface SpawnConfig {
  role: string;
  cwd: string;
  model?: string;
  prompt: string;
  signal?: AbortSignal;
  runtimeContext?: SpawnRuntimeContext;
}
```

Behavior:
- If `runtimeContext.mode !== "sub-agent"`, do not append runtime layer.
- If `mode === "sub-agent"`, append `prompts/runtime/sub-agent.md` after static layers.
- Perform simple token replacement (`{{parentRole}}`, `{{objective}}`, `{{taskId}}`) before loader injection.

Integration points:
- `extensions/orchestration` `spawn_agent` accepts optional `runtimeContext`.
- Coordinator prompts should include `runtimeContext.mode="sub-agent"` when spawning workers.
- Chain-runner stage spawns can stay `top-level` (no runtime overlay) unless explicitly needed.

## Directory Structure

```text
prompts/
  cosmonauts.md
  capabilities/
    core.md
    coding-readwrite.md
    coding-readonly.md
    tasks.md
    spawning.md
    todo.md
  agents/
    coding/
      cosmo.md
      planner.md
      task-manager.md
      coordinator.md
      worker.md
  runtime/
    sub-agent.md
```

After migration, remove legacy prompt files under `prompts/base/` and `prompts/roles/`.

## Files to Change

### New files

- `prompts/cosmonauts.md`
- `prompts/capabilities/core.md`
- `prompts/capabilities/coding-readwrite.md`
- `prompts/capabilities/coding-readonly.md`
- `prompts/capabilities/tasks.md`
- `prompts/capabilities/spawning.md`
- `prompts/capabilities/todo.md`
- `prompts/agents/coding/cosmo.md`
- `prompts/agents/coding/planner.md`
- `prompts/agents/coding/task-manager.md`
- `prompts/agents/coding/coordinator.md`
- `prompts/agents/coding/worker.md`
- `prompts/runtime/sub-agent.md`

### Modified files

- `lib/agents/types.ts`
  - Add optional `namespace`
- `lib/agents/definitions.ts`
  - Add namespace to built-ins and update prompt arrays to ordered four-layer contract
- `lib/orchestration/types.ts`
  - Add `SpawnRuntimeContext` and `runtimeContext?: SpawnRuntimeContext` on `SpawnConfig`
- `extensions/orchestration/index.ts`
  - Extend `spawn_agent` tool schema for optional runtime context
- `lib/orchestration/agent-spawner.ts`
  - Append rendered runtime sub-agent layer when `runtimeContext.mode === "sub-agent"`
- `DESIGN.md`
  - Update prompt architecture docs and mapping tables

### Deleted files (post verification)

- `prompts/base/coding.md`
- `prompts/roles/planner.md`
- `prompts/roles/task-manager.md`
- `prompts/roles/coordinator.md`
- `prompts/roles/worker.md`

### Tests to update/add

- `tests/agents/definitions.test.ts`
  - Assert new prompt arrays and namespace behavior
- `tests/orchestration/agent-spawner.test.ts`
  - Add tests for runtime layer inclusion/exclusion and render order
- `tests/orchestration/chain-runner.test.ts`
  - Ensure spawner calls still work with expanded `SpawnConfig`
- `tests/prompts/loader.test.ts`
  - Update prompt refs and verify multi-file layering remains ordered
- `tests/agents/resolver.test.ts`
  - Verify default namespace behavior for missing namespace

## Implementation Order

1. Create new prompt directories and draft new Layer 0 + capability files.
2. Migrate role content into namespaced persona files, ensuring persona-only identity language.
3. Update built-in agent definitions to new ordered prompt arrays.
4. Add optional `namespace` to `AgentDefinition`; implement defaulting behavior in resolver/consumers.
5. Add `SpawnRuntimeContext` types and propagate through orchestration tool + spawner.
6. Implement runtime prompt rendering/injection in spawner.
7. Delete legacy prompt files once all references are updated.
8. Update DESIGN.md documentation.
9. Update and add tests.
10. Verify with `bun run test`, `bun run lint`, `bun run typecheck`.

## Acceptance Criteria

1. No built-in agent prompt includes identity text for another agent.
2. Prompt arrays follow the exact order: base -> capabilities -> persona (-> runtime when sub-agent).
3. Planner and task-manager prompts no longer include read-write coding/bash/git instructions.
4. Spawn path supports optional runtime context without breaking existing callers.
5. Built-in definitions include namespace metadata; missing namespace remains backward compatible.
6. All tests pass after migration and legacy files are removed.

## Risks and Mitigations

- **Risk: capability over-fragmentation increases maintenance cost**
  - Mitigation: keep packs coarse but tool-aligned; merge packs if churn is high.

- **Risk: runtime template variables drift from spawn schema**
  - Mitigation: centralize render helper with explicit defaults; add dedicated unit tests.

- **Risk: hidden dependencies on legacy prompt paths**
  - Mitigation: remove legacy files only after a full test pass and path grep confirms no references.

- **Risk: namespace migration breaks custom agent registrations**
  - Mitigation: keep `namespace` optional first; default to `coding` in runtime logic.
