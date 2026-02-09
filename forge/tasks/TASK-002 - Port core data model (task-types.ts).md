---
id: TASK-002
title: Port core data model (task-types.ts)
status: Done
priority: high
labels:
  - port
dependencies:
  - TASK-001
createdAt: '2026-02-09T17:15:03.520Z'
updatedAt: '2026-02-09T17:16:37.009Z'
---

## Description

Copy task-types.ts from forge-tasks/core/ to lib/tasks/. Pure TypeScript types, no deps.

<!-- AC:BEGIN -->
- [x] #1 tsc --noEmit passes
<!-- AC:END -->
