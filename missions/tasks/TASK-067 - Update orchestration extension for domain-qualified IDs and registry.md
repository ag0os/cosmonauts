---
id: TASK-067
title: Update orchestration extension for domain-qualified IDs and registry
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-057
  - TASK-060
  - TASK-061
createdAt: '2026-03-09T16:04:33.992Z'
updatedAt: '2026-03-09T22:42:00.000Z'
---

## Description

Update the orchestration extension (now at `domains/shared/extensions/orchestration/index.ts`) to use domain-qualified agent IDs and receive a registry instance instead of creating its own.

**Changes:**
- Remove `const DEFAULT_REGISTRY = createDefaultRegistry()` (line 15)
- Receive registry from extension context or reconstruct from domain loading
- Spawn permission checks: when checking if a caller agent can spawn a target, compare using qualified IDs (e.g. `callerDef.subagents` contains `"coding/worker"`)
- `ROLE_LABELS` map updated for qualified IDs or made dynamic
- `parseChain` call passes registry parameter
- `runChain` call passes registry through config

**Reference:** Plan section "Orchestration extension update". Current file at `extensions/orchestration/index.ts` (moving to `domains/shared/extensions/orchestration/index.ts` in TASK-057).

<!-- AC:BEGIN -->
- [x] #1 Orchestration extension has no module-level DEFAULT_REGISTRY constant
- [x] #2 Spawn permission checks use qualified agent IDs from definitions
- [x] #3 parseChain receives a registry parameter
- [x] #4 runChain receives a registry through ChainConfig
- [x] #5 ROLE_LABELS or equivalent handles qualified agent IDs
- [x] #6 Orchestration extension tests pass with domain-qualified IDs
<!-- AC:END -->

## Implementation Notes

- Removed module-level `DEFAULT_REGISTRY` constant; registry is now created per tool execution call
- Added `isSubagentAllowed()` helper that checks both unqualified (`targetDef.id`) and qualified (`${targetDef.domain}/${targetDef.id}`) matches against the caller's subagents list
- Updated `roleLabel()` to strip domain prefix for display (e.g. "coding/worker" renders as "Worker")
- Registry is passed to both `parseChain(expression, registry)` and `runChain({ ..., registry })`
- Added `AgentDefinition` type import for the helper function signature
- New tests: authorized spawn with scan-all resolution, denied spawn with unknown qualified caller ID
- All 691 tests pass, typecheck clean
