---
id: TASK-054
title: Create domain agent definitions and delete centralized definitions
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-052
  - TASK-053
createdAt: '2026-03-09T16:02:05.141Z'
updatedAt: '2026-03-09T16:23:58.589Z'
---

## Description

Move agent definitions from the centralized `lib/agents/definitions.ts` to individual per-agent files in `domains/coding/agents/`. Each file exports a default `AgentDefinition` using the new `capabilities` array instead of `prompts`, without `namespace`.

**New files (8 agent definitions):**
- `domains/coding/agents/cosmo.ts`
- `domains/coding/agents/planner.ts`
- `domains/coding/agents/worker.ts`
- `domains/coding/agents/coordinator.ts`
- `domains/coding/agents/task-manager.ts`
- `domains/coding/agents/quality-manager.ts`
- `domains/coding/agents/reviewer.ts`
- `domains/coding/agents/fixer.ts`

**Deleted files:**
- `lib/agents/definitions.ts`

**Mapping example:** `COSMO_DEFINITION.prompts: ["cosmonauts", "capabilities/core", "capabilities/coding-readwrite", ...]` becomes `capabilities: ["core", "coding-readwrite", "tasks", "spawning", "todo"]` (base prompt and persona are auto-loaded by convention).

**Reference:** Current definitions at `lib/agents/definitions.ts`. All 8 definitions must preserve the same model, tools, extensions, skills, subagents, projectContext, session, and loop values.

<!-- AC:BEGIN -->
- [ ] #1 Eight agent definition files exist in domains/coding/agents/, one per agent
- [ ] #2 Each definition uses capabilities array instead of prompts array and has no namespace field
- [ ] #3 lib/agents/definitions.ts is deleted
- [ ] #4 lib/agents/index.ts no longer exports BUILTIN_DEFINITIONS or individual definition constants
- [ ] #5 All agent definitions preserve their original model, tools, extensions, skills, subagents, session, loop, and thinkingLevel values
- [ ] #6 Tests verify the new definition files export valid AgentDefinition objects
<!-- AC:END -->

## Implementation Notes

All 8 agent definition files created in `domains/coding/agents/`, each using `capabilities` array (no `prompts`, no `namespace`). All original values preserved.\n\n**Additional changes beyond ACs:**\n- `lib/agents/resolver.ts`: Updated to import from domain files as a temporary bridge. `createDefaultRegistry()` returns a registry populated from domain definitions. TASK-059/060 will replace this with dynamic domain loading.\n- `cli/main.ts`: Updated to import cosmo definition from domain file.\n- `cli/session.ts` and `lib/orchestration/agent-spawner.ts`: Changed `def.prompts` property access to reconstruct prompt paths from `def.capabilities` (temporary bridge until TASK-058 adds proper four-layer prompt assembly).\n- `tests/agents/resolver.test.ts`: Updated fixtures to use `capabilities` instead of `prompts`/`namespace`.\n- `tests/agents/definitions.test.ts`: Deleted (replaced by `tests/domains/coding-agents.test.ts`).\n\n**Pre-existing issues not addressed:**\n- 2 type errors in `tests/orchestration/agent-spawner.test.ts` (fixtures still use `prompts` field from TASK-053).\n- 20 lint warnings (pre-existing non-null assertions in other test files)."
