---
id: TASK-001
title: Package scaffold
status: Done
priority: high
labels:
  - setup
dependencies: []
createdAt: '2026-02-09T17:14:36.231Z'
updatedAt: '2026-02-09T17:16:21.368Z'
---

## Description

Create project structure so pi install ./cosmonauts works. package.json with pi field, tsconfig.json, bin/cosmonauts-tasks, extensions/tasks/index.ts placeholder, skills/.gitkeep, lib/tasks/, tests/tasks/, .gitignore. Pin pi deps to exact versions, use commander + gray-matter + typebox deps. Verify: bun install succeeds, tsc --noEmit passes.

<!-- AC:BEGIN -->
- [x] #1 bun install succeeds
- [x] #2 tsc --noEmit passes
- [x] #3 package.json has pi field with extensions and skills paths
<!-- AC:END -->
