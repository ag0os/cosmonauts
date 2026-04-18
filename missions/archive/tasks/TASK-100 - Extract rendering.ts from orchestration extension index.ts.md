---
id: TASK-100
title: Extract rendering.ts from orchestration extension index.ts
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies: []
createdAt: '2026-03-21T03:31:47.897Z'
updatedAt: '2026-03-21T03:35:04.724Z'
---

## Description

Move all rendering helper functions out of `domains/shared/extensions/orchestration/index.ts` into a new focused module `domains/shared/extensions/orchestration/rendering.ts`. These are pure functions with no dependency on the spawner or runtime modules.

<!-- AC:BEGIN -->
- [ ] #1 domains/shared/extensions/orchestration/rendering.ts exists and contains roleLabel(), ROLE_LABELS, formatDuration(), chainEventToProgressLine(), buildProgressText(), buildCostTable(), and renderTextFallback()
- [ ] #2 extension index.ts imports rendering helpers from rendering.ts (not defined inline)
- [ ] #3 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

rendering.ts created with all 7 exports (ROLE_LABELS, roleLabel, formatDuration, chainEventToProgressLine, buildProgressText, buildCostTable, renderTextFallback). index.ts already had isSubagentAllowed extracted to authorization.ts; removed unqualifyRole and ChainStats imports (no longer needed inline), replaced rendering block with import from ./rendering.ts. Text import remains in index.ts as it's still used in renderCall/renderResult methods.
