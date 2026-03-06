---
id: COSMO-040
title: Set thinkingLevel defaults on built-in agent definitions
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-039
createdAt: '2026-03-05T16:02:18.630Z'
updatedAt: '2026-03-05T16:06:15.302Z'
---

## Description

Set `thinkingLevel` values on the built-in agent definitions in `lib/agents/definitions.ts`. Per the plan, agents that benefit from higher thinking (planner, task-manager) get `"high"`, while others remain `undefined` (Pi default behavior — no thinking).

**Files to change:**
- `lib/agents/definitions.ts` — add `thinkingLevel: "high"` to `PLANNER_DEFINITION` and `TASK_MANAGER_DEFINITION`; leave all other definitions without a `thinkingLevel` field (or explicitly `undefined`)

<!-- AC:BEGIN -->
- [ ] #1 PLANNER_DEFINITION has thinkingLevel set to "high"
- [ ] #2 TASK_MANAGER_DEFINITION has thinkingLevel set to "high"
- [ ] #3 All other built-in definitions (cosmo, coordinator, worker, quality-manager, reviewer, fixer) have thinkingLevel as undefined
- [ ] #4 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Added `thinkingLevel: \"high\"` to PLANNER_DEFINITION (line 62) and TASK_MANAGER_DEFINITION (line 85). All other definitions have no thinkingLevel field (defaults to undefined). Pre-existing test failure in definitions.test.ts (model format regex doesn't match `gpt-5.3-codex` with a dot) is unrelated to this change.
