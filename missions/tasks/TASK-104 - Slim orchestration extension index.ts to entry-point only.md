---
id: TASK-104
title: Slim orchestration extension index.ts to entry-point only
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies:
  - TASK-102
  - TASK-103
createdAt: '2026-03-21T03:32:07.839Z'
updatedAt: '2026-03-21T03:50:01.142Z'
---

## Description

Remove all inline tool logic, rendering, and authorization from `domains/shared/extensions/orchestration/index.ts` now that everything has been extracted. The slimmed file retains only: the runtime cache, `getRuntime()`, and calls to `registerChainTool()` and `registerSpawnTool()` in the correct order. Final size should be ~30 lines.

<!-- AC:BEGIN -->
- [ ] #1 index.ts contains only the runtime cache, getRuntime(), and registration calls — no inline tool definitions, rendering functions, or authorization logic
- [ ] #2 registerChainTool() is called before registerSpawnTool() to preserve original tool registration order
- [ ] #3 No symbols previously exported from index.ts are removed (public API is unchanged)
- [ ] #4 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

index.ts was already in the target state — prior extraction tasks (TASK-102/103) had left it as a pure entry-point. No code changes were needed. Verified: 37 lines, runtime cache + getRuntime() + registerChainTool() + registerSpawnTool() only. All 12 orchestration tests pass.
