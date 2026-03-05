---
id: COSMO-018
title: Update chain runner for loop-until-done
status: Done
priority: high
labels:
  - orchestration
dependencies:
  - COSMO-016
  - COSMO-017
createdAt: '2026-02-09T19:30:31.991Z'
updatedAt: '2026-02-09T19:32:30.055Z'
---

## Description

Loop stages now repeat until completionCheck passes or global safety cap (maxTotalIterations) is hit. No per-stage iteration limit. Track total iterations across all stages. Timeout support via config.timeoutMs.

<!-- AC:BEGIN -->
- [x] #1 Loop stages repeat until completionCheck returns true
- [x] #2 Global maxTotalIterations cap across all stages
- [x] #3 Timeout support via timeoutMs
- [x] #4 Events updated to reflect new model (no maxIterations in stage_iteration)
<!-- AC:END -->
