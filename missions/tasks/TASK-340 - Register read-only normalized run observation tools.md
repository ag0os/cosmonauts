---
id: TASK-340
title: Register read-only normalized run observation tools
status: To Do
priority: medium
labels:
  - api
  - backend
  - testing
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-339
createdAt: '2026-06-03T21:57:53.171Z'
updatedAt: '2026-06-03T21:57:53.171Z'
---

## Description

Implementation Order step 4. Add orchestration extension tools for normalized runtime observation only. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named test from the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-014 is covered by `tests/extensions/orchestration-run-control.test.ts` > `registers only read-only normalized run observation tools`: orchestration extension registration exposes `run_status` and `run_watch` backed by `lib/durable-runtime/controller.ts`, returns the same status/watch details as direct helpers, does not write files, and does not register mutating `run_pause`, `run_resume`, `run_cancel`, or `run_intervene` controls.
<!-- AC:END -->
