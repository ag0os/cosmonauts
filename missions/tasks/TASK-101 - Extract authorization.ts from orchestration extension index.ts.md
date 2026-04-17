---
id: TASK-101
title: Extract authorization.ts from orchestration extension index.ts
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies: []
createdAt: '2026-03-21T03:31:51.307Z'
updatedAt: '2026-03-21T03:33:54.382Z'
---

## Description

Move the `isSubagentAllowed()` function out of `domains/shared/extensions/orchestration/index.ts` into a new focused module `domains/shared/extensions/orchestration/authorization.ts`.

## Implementation Plan

1. Create domains/shared/extensions/orchestration/authorization.ts with isSubagentAllowed() exported.
2. Add import of isSubagentAllowed from ./authorization.ts in index.ts.
3. Remove the function definition and the now-unused AgentDefinition import from index.ts.

<!-- AC:BEGIN -->
- [ ] #1 domains/shared/extensions/orchestration/authorization.ts exists and exports isSubagentAllowed()
- [ ] #2 isSubagentAllowed() is no longer defined in index.ts; it is imported from authorization.ts
- [ ] #3 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

Created authorization.ts with isSubagentAllowed() and updated index.ts to import from it. The AgentDefinition import was also removed from index.ts since it was only needed by the extracted function. All 12 orchestration tests pass.
