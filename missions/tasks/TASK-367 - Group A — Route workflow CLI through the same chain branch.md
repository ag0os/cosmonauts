---
id: TASK-367
title: Group A — Route workflow CLI through the same chain branch
status: Done
priority: medium
labels:
  - 'group:a'
  - backend
  - cli
  - testing
  - chain
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-366
createdAt: '2026-06-04T20:47:57.602Z'
updatedAt: '2026-06-04T21:15:34.335Z'
---

## Description

Owns Group A Implementation Order steps 6 and 7. Worker should implement B-008 test-first and place `@cosmo-behavior plan:durable-frontend-migration#B-008` near the executable test. This is the final Group A task and should leave Group A shippable before Group B begins.

<!-- AC:BEGIN -->
- [x] #1 B-008 is proven by `tests/cli/workflow-durable-routing.test.ts` > `routes loop-free -w workflows through the durable graph and loop workflows inline`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-008`.
- [x] #2 Loop-free raw DSL workflows and loop-free named workflows invoked with `cosmonauts -w <workflow-or-dsl> <prompt>` run through the same durable chain path as `chain_run`.
- [x] #3 Workflows containing loop roles or completion labels remain on the legacy inline runner, and no `--chain` flag or other new CLI flag is introduced.
- [x] #4 Existing workflow CLI response/progress behavior, including inline `--profile` behavior, remains compatible or is explicitly covered by the test expectation without changing flags.
- [x] #5 Group A quality gates are green: project-native tests for Group A touched behavior pass, project-native lint/typecheck gates pass, and no named workflow with a loop role routes durable by accident.
<!-- AC:END -->
