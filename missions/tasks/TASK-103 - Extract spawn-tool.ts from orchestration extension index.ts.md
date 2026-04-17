---
id: TASK-103
title: Extract spawn-tool.ts from orchestration extension index.ts
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies:
  - TASK-100
  - TASK-101
createdAt: '2026-03-21T03:32:01.744Z'
updatedAt: '2026-03-21T03:48:50.415Z'
---

## Description

Move the `spawn_agent` tool registration, execute handler, renderCall, and renderResult out of `domains/shared/extensions/orchestration/index.ts` into `domains/shared/extensions/orchestration/spawn-tool.ts`. Export a `registerSpawnTool(pi, getRuntime)` function that `index.ts` calls. Rendering helpers are imported from `rendering.ts` and authorization from `authorization.ts`.

<!-- AC:BEGIN -->
- [ ] #1 domains/shared/extensions/orchestration/spawn-tool.ts exists and exports registerSpawnTool(pi, getRuntime)
- [ ] #2 spawn-tool.ts imports rendering helpers from rendering.ts and isSubagentAllowed from authorization.ts
- [ ] #3 extension index.ts calls registerSpawnTool() instead of defining the spawn_agent tool inline
- [ ] #4 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

Implementation verified on disk (2026-03-21):
- spawn-tool.ts exists at domains/shared/extensions/orchestration/spawn-tool.ts and exports registerSpawnTool(pi, getRuntime) ✓
- spawn-tool.ts imports renderTextFallback and roleLabel from ./rendering.ts, and isSubagentAllowed from ./authorization.ts ✓
- index.ts imports registerSpawnTool from ./spawn-tool.ts and calls it instead of inlining the tool ✓
- All 836 tests pass (46 test files) ✓

Previous workers completed the implementation correctly but failed to tick ACs. Closing out now.
