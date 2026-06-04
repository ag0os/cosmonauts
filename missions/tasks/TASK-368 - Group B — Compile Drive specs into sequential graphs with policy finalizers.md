---
id: TASK-368
title: Group B — Compile Drive specs into sequential graphs with policy finalizers
status: Done
priority: high
labels:
  - 'group:b'
  - backend
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-367
createdAt: '2026-06-04T20:48:07.201Z'
updatedAt: '2026-06-04T21:38:08.621Z'
---

## Description

Owns Group B Implementation Order step 8. Worker should implement B-009 and B-010 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. This is the first Group B task and intentionally depends on the last Group A task so Group B starts from green main after Group A.

<!-- AC:BEGIN -->
- [x] #1 B-009 is proven by `tests/driver/drive-graph-compiler.test.ts` > `compiles selected task ids into sequential drive task steps`: selected task IDs compile to one `kind: drive` step per original task ID in exact selected order, with marker `@cosmo-behavior plan:durable-frontend-migration#B-009`.
- [x] #2 B-010 is proven by `tests/driver/drive-graph-compiler.test.ts` > `adds only policy-enabled drive finalizer steps in executable order`: finalizer emission is policy-gated and dependencies preserve backend/report -> source commit -> task status -> final state commit ordering, with marker `@cosmo-behavior plan:durable-frontend-migration#B-010`.
- [x] #3 Drive graph step IDs and finalizer IDs reuse the existing `durable-steps.ts` conventions, including task IDs as task step IDs and `finalizer-source-commit-<taskId>`, `finalizer-task-status-<taskId>`, and `finalizer-state-commit`.
- [x] #4 Every compiled graph step has a seeded pending `StepRecord`, and every Drive finalizer `StepRecord` carries the explicit finalizer retry policy required to preserve retry evidence.
- [x] #5 Project-native tests for the touched Drive graph compiler behavior pass, and project-native lint/typecheck gates remain green with `lib/durable-runtime/*` kept frontend-agnostic.
<!-- AC:END -->
