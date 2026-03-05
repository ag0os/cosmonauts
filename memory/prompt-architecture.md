---
source: archive
plan: prompt-architecture
distilledAt: 2026-03-05T15:41:00.000Z
---

# System Prompt Architecture — Layered Composition and Capability Alignment

## What Was Built

Refactored the prompt system from ad-hoc `base + role` layering into an explicit four-layer composition contract: platform base → capability packs → persona → runtime context. Each layer has a single responsibility and deterministic precedence. Capability packs are aligned to tool surfaces so agents only receive instructions matching their actual capabilities. A structured runtime context contract allows spawned sub-agents to receive invocation-specific metadata (parent role, objective, task ID) as a final prompt layer.

## Key Decisions

- **Four-layer ordering is a hard contract, not a guideline.** Base → capabilities → persona → runtime. Persona comes after capabilities so role-specific constraints are authoritative. Runtime comes last so spawn-time overrides win. This ordering is enforced in agent definitions, not just documented.
- **Capability packs are tool-aligned, not role-aligned.** `coding-readwrite.md` vs `coding-readonly.md` splits on whether the agent has write tools, not on the agent's name. This eliminated the problem where read-only agents (planner, task-manager) inherited bash/git/commit instructions they couldn't execute.
- **Persona is exactly one file per agent.** No composition or inheritance between personas. Each persona under `prompts/agents/coding/` is self-contained with its own identity, workflow, and constraints. This prevents identity bleed where one agent's prompt claimed another agent's identity.
- **Namespace metadata is optional for backward compatibility.** `AgentDefinition.namespace` defaults to `"coding"` when omitted. This lets custom/external agent definitions work without modification while built-ins explicitly declare their namespace.
- **Runtime context uses simple template replacement.** `prompts/runtime/sub-agent.md` has `{{parentRole}}`, `{{objective}}`, `{{taskId}}` placeholders replaced at spawn time. No template engine — just string replacement with safe defaults. The spawner only appends this layer when `runtimeContext.mode === "sub-agent"`.
- **Legacy files removed only after full verification.** `prompts/base/` and `prompts/roles/` were deleted only after tests passed and a path grep confirmed no remaining references. This staged approach prevented breakage.

## Patterns Established

- **Prompt directory structure**: `prompts/cosmonauts.md` (base), `prompts/capabilities/*.md` (6 packs), `prompts/agents/<namespace>/<agent>.md` (personas), `prompts/runtime/sub-agent.md` (runtime overlay).
- **Capability pack naming**: `core`, `coding-readwrite`, `coding-readonly`, `tasks`, `spawning`, `todo` — each maps to a tool surface or extension.
- **Agent prompt arrays**: Defined in `lib/agents/definitions.ts` as ordered arrays following the four-layer contract. Example: worker gets `["cosmonauts", "capabilities/core", "capabilities/coding-readwrite", "capabilities/tasks", "capabilities/todo", "agents/coding/worker"]`.
- **No identity in capabilities**: Capability files never contain "You are X" statements. Identity is exclusively in persona files.
- **SpawnRuntimeContext interface**: `{ mode: "top-level" | "sub-agent"; parentRole?: string; objective?: string; taskId?: string }` on `SpawnConfig`. Coordinator uses this when spawning workers.

## Files Changed

- `prompts/cosmonauts.md` — New Layer 0 platform base with universal operating norms
- `prompts/capabilities/` — Six new capability pack files (core, coding-readwrite, coding-readonly, tasks, spawning, todo)
- `prompts/agents/coding/` — Five persona files (cosmo, planner, task-manager, coordinator, worker) replacing legacy role prompts
- `prompts/runtime/sub-agent.md` — Runtime overlay template with placeholder tokens
- `lib/agents/types.ts` — Added optional `namespace` to `AgentDefinition`
- `lib/agents/definitions.ts` — Rebuilt prompt arrays to follow four-layer contract; added namespace metadata
- `lib/orchestration/types.ts` — Added `SpawnRuntimeContext` interface and `runtimeContext` on `SpawnConfig`
- `extensions/orchestration/index.ts` — Extended `spawn_agent` tool schema for optional runtime context fields
- `lib/orchestration/agent-spawner.ts` — Runtime layer rendering and conditional injection
- `DESIGN.md` — Documented layered architecture, capability-tool alignment, runtime context contract
- `prompts/base/`, `prompts/roles/` — Deleted after migration verified

## Gotchas & Lessons

- **Prompt precedence is positional, not semantic.** Later prompts override earlier ones in the composition array. If a capability pack and a persona contradict each other, the persona wins purely because it appears later. This is the design intent but it is not enforced — a misordered array silently produces wrong behavior.
- **Capability deduplication requires judgment.** When migrating from monolithic base prompts to layered capabilities, deciding what belongs in a capability vs a persona is not always clear-cut. The rule of thumb: if it is about *how to use a tool*, it is a capability; if it is about *when and why*, it is a persona.
- **The readonly/readwrite split was the highest-value change.** The planner receiving bash/git/commit instructions it couldn't execute was a concrete source of confused agent behavior. Splitting on tool surface instead of role name fixed this cleanly.
- **Template tokens must have safe defaults.** If `runtimeContext` fields are undefined, the template renderer must substitute empty strings or sensible defaults — never leave raw `{{placeholder}}` tokens in the final prompt. The spawner handles this but there are no compile-time guarantees.
- **Namespace is a migration bridge.** The optional namespace exists to avoid breaking custom agents. Once all known consumers set it explicitly, it should become required. This is noted as future work, not forgotten.
