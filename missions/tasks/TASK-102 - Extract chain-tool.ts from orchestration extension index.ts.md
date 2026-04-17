---
id: TASK-102
title: Extract chain-tool.ts from orchestration extension index.ts
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies:
  - TASK-100
createdAt: '2026-03-21T03:31:57.385Z'
updatedAt: '2026-03-21T03:40:07.934Z'
---

## Description

Move the `chain_run` tool registration, execute handler, renderCall, and renderResult out of `domains/shared/extensions/orchestration/index.ts` into `domains/shared/extensions/orchestration/chain-tool.ts`. Export a `registerChainTool(pi, getRuntime)` function that `index.ts` calls. Rendering helpers are imported from `rendering.ts`.

<!-- AC:BEGIN -->
- [x] #1 domains/shared/extensions/orchestration/chain-tool.ts exists and exports registerChainTool(pi, getRuntime)
- [x] #2 chain-tool.ts imports rendering helpers from rendering.ts
- [x] #3 extension index.ts calls registerChainTool() instead of defining the chain_run tool inline
- [x] #4 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

Previous worker completed the implementation (chain-tool.ts created, index.ts updated to call registerChainTool()) but did not check off any acceptance criteria. Next worker: verify the implementation is correct, confirm all 4 ACs are satisfied, check them off, and mark Done.
