---
id: COSMO-016
title: Refactor ChainStage to remove maxIterations
status: Done
priority: high
labels:
  - orchestration
dependencies: []
createdAt: '2026-02-09T19:30:24.657Z'
updatedAt: '2026-02-09T19:31:10.141Z'
---

## Description

Simplify ChainStage: remove maxIterations, replace with loop boolean. Add global safety caps to ChainConfig (maxTotalIterations, timeoutMs). Add ROLE_LIFECYCLE mapping so known roles declare whether they loop. Planner/task-manager/worker are one-shot, coordinator loops.

<!-- AC:BEGIN -->
- [x] #1 ChainStage has name and loop (boolean) instead of maxIterations
- [x] #2 ChainConfig has maxTotalIterations (default 50) and timeoutMs (default 30min)
- [x] #3 ROLE_LIFECYCLE exported mapping: known roles to loop behavior
- [x] #4 Typecheck passes
<!-- AC:END -->
