---
id: TASK-369
title: Group B — Bridge Drive scheduler steps to selected backend execution
status: To Do
priority: high
labels:
  - 'group:b'
  - backend
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-368
createdAt: '2026-06-04T20:48:16.954Z'
updatedAt: '2026-06-04T20:48:16.954Z'
---

## Description

Owns Group B Implementation Order step 9. Worker should implement B-011, B-012, and B-013 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. Scope is the Drive-specific scheduler backend bridge and selected-backend capability registration.

<!-- AC:BEGIN -->
- [ ] #1 B-011 is proven by `tests/driver/drive-scheduler-backend.test.ts` > `builds BackendInvocation from scheduler input and rendered task prompts`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-011`.
- [ ] #2 B-012 is proven by `tests/driver/drive-scheduler-backend.test.ts` > `runs preflight backend postflight and report inference before returning StepResult`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-012`.
- [ ] #3 B-013 is proven by `tests/driver/drive-scheduler-backend.test.ts` > `registers only the selected drive backend with production recovery capabilities`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-013`.
- [ ] #4 BackendInvocation preparation writes `prompts/<taskId>.md`, carries the complete Drive invocation context and scheduler signal, and validates task IDs against authoritative original selected IDs rather than a resume remaining queue.
- [ ] #5 Drive task execution preserves preflight/postflight, report parsing, unknown-vs-success inference, partial mode, unchecked acceptance-criteria handling, timeout, and compatible blocking/finalization outcomes from current Drive behavior.
- [ ] #6 Production backend maps contain exactly the selected Drive backend plus `shell-command`, using `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES`, and do not make generic durable-runtime modules import Drive invocation types.
- [ ] #7 Project-native tests for the touched Drive scheduler bridge behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
