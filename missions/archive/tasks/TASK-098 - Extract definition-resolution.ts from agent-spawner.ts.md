---
id: TASK-098
title: Extract definition-resolution.ts from agent-spawner.ts
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies: []
createdAt: '2026-03-21T03:31:37.440Z'
updatedAt: '2026-03-21T03:34:18.993Z'
---

## Description

Move the agent definition resolution helpers out of `lib/orchestration/agent-spawner.ts` into a new focused module `lib/orchestration/definition-resolution.ts`. Re-export everything from `agent-spawner.ts` so no external consumer breaks.

<!-- AC:BEGIN -->
- [ ] #1 lib/orchestration/definition-resolution.ts exists and contains resolveTools(), resolveExtensionPaths(), isDirectory(), and the ResolveExtensionOptions type
- [ ] #2 agent-spawner.ts re-exports all symbols from definition-resolution.ts so existing import paths are unbroken
- [ ] #3 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

Created lib/orchestration/definition-resolution.ts with resolveTools(), resolveExtensionPaths(), isDirectory() (now exported), and ResolveExtensionOptions. Removed the duplicate code from agent-spawner.ts and replaced it with re-exports. Also cleaned up unused imports (join from node:path, AgentToolSet, createCodingTools, createReadOnlyTools) from agent-spawner.ts since they moved to definition-resolution.ts.
