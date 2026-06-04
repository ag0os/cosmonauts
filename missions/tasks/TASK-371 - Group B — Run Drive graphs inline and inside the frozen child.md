---
id: TASK-371
title: Group B — Run Drive graphs inline and inside the frozen child
status: To Do
priority: medium
labels:
  - 'group:b'
  - backend
  - cli
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-370
createdAt: '2026-06-04T20:48:35.981Z'
updatedAt: '2026-06-04T20:48:35.981Z'
---

## Description

Owns Group B Implementation Order step 11. Worker should implement B-016 and B-017 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. Scope is the shared `runDriveOnGraph` entry and Architecture X routing through inline host mode and detached frozen-child mode.

<!-- AC:BEGIN -->
- [ ] #1 B-016 is proven by `tests/driver/drive-on-graph-routing.test.ts` > `runs inline Drive through runDriveOnGraph in the host process`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-016`.
- [ ] #2 B-017 is proven by `tests/driver/drive-on-graph-routing.test.ts` > `runs detached Drive by executing runDriveOnGraph inside the frozen runner`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-017`.
- [ ] #3 Inline Drive graph runs produce the current run workdir artifacts and response behavior, including `spec.json`, `task-queue.txt`, `events.jsonl`, `run.inline.json`, durable `graph.json`, step records, and final `run.completion.json`.
- [ ] #4 Detached Drive still prepares the workdir, `run.pid`, `run.sh`, copied/prebuilt `bin/cosmonauts-drive-step`, `compile:drive-step`, and detached unsupported `cosmonauts-subagent` behavior as today, while scheduler execution happens inside the frozen child.
- [ ] #5 The host process for detached Drive does not load mutable orchestration code after spawn and observes only `run.completion.json`; `runRunLoop` remains available only as legacy/debug fallback rather than the production path.
- [ ] #6 Project-native tests for touched graph routing behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
