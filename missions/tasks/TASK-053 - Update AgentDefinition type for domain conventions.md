---
id: TASK-053
title: Update AgentDefinition type for domain conventions
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies: []
createdAt: '2026-03-09T16:01:44.347Z'
updatedAt: '2026-03-09T16:13:59.143Z'
---

## Description

Modify the `AgentDefinition` interface to support the new domain-based prompt system. This is a breaking type change that must be coordinated with definition file updates.

**Changes to `lib/agents/types.ts`:**
- Remove `namespace?: string` field
- Replace `prompts: readonly string[]` with `capabilities: readonly string[]`
- Add `domain?: string` (set at runtime by domain loader, not in definition files)
- Update JSDoc comments to reflect new semantics

The `capabilities` array contains unqualified capability pack names (e.g. `["core", "tasks", "coding-readwrite"]`). The framework resolves them to file paths during prompt assembly.

**Reference:** Current type at `lib/agents/types.ts`. Spec section "AgentDefinition Type (Updated)" for exact shape. Note that `subagents` entries will eventually become qualified IDs but that change comes in a later task.

<!-- AC:BEGIN -->
- [x] #1 AgentDefinition in lib/agents/types.ts has capabilities: readonly string[] instead of prompts: readonly string[]
- [x] #2 namespace field is removed from AgentDefinition
- [x] #3 Optional domain?: string field exists on AgentDefinition
- [x] #4 lib/agents/index.ts re-exports are updated to reflect type changes
- [x] #5 TypeScript compilation succeeds for lib/agents/types.ts (downstream consumers may break — expected)
<!-- AC:END -->

## Implementation Notes

Verified all ACs met by prior worker's implementation. types.ts has `capabilities: readonly string[]` (no `prompts`), no `namespace` field, `domain?: string` present, index.ts re-exports are correct, and types.ts compiles cleanly. Downstream consumers (definitions.ts, cli/main.ts, cli/session.ts, agent-spawner.ts, and tests) still reference old fields — expected per AC #5, to be fixed in subsequent tasks.
