---
id: COSMO-012
title: Build chain runner core
status: Done
priority: high
labels:
  - orchestration
dependencies:
  - COSMO-009
  - COSMO-010
  - COSMO-011
createdAt: '2026-02-09T19:09:15.981Z'
updatedAt: '2026-02-09T19:16:20.205Z'
---

## Description

Create lib/orchestration/chain-runner.ts. The main orchestration engine. Takes a chain expression (or ChainStage array), executes stages sequentially. Pipeline stages run once. Loop stages repeat until completion check passes or maxIterations reached. Completion check for coordinator: all tasks Done. Emits events for progress. Collects results from each stage.

<!-- AC:BEGIN -->
- [x] #1 runChain(config) executes all stages sequentially and returns ChainResult
- [x] #2 Pipeline stages execute once via agent spawner
- [x] #3 Loop stages repeat until completionCheck or maxIterations
- [x] #4 Default completion check: all tasks in Done status
- [x] #5 Collects per-stage results (success, messages, duration)
- [x] #6 Handles errors gracefully - stage failure stops chain, returns partial results
- [x] #7 Abort support via AbortSignal
<!-- AC:END -->
