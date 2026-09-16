---
id: TASK-690
title: Collect the complete current-epoch command census
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-689
createdAt: '2026-09-16T18:34:47.392Z'
updatedAt: '2026-09-16T18:34:47.392Z'
---

## Description

Stage 3 — Command census application.

Owned behaviors: **none**; B-002 remains solely owned by TASK-688. Apply its collector to the supported command surfaces and persist raw/reconciled evidence under the current audit epoch. INV-005 and D-025 are settled: collection/execution evidence precedes conclusions, `incomplete`/`blocked` never renders clean, and the known coverage-threshold policy exit is not misclassified as a test-execution failure. Any command executes project-controlled code only through the documented maintainer invocation.

<!-- AC:BEGIN -->
- [ ] #1 Current-epoch evidence contains normal, bounded real-watch initial-cycle plus watcher-start/cleanup, coverage, same-order repeat, and deterministic seeded-shuffle runs using the actual supported package command surfaces.
- [ ] #2 Full-suite outcomes and two isolation runs each are recorded for `tests/driver/cross-plan-commit-lock.test.ts`, `tests/plans/archive.test.ts`, and `tests/extensions/project-tools.test.ts`; isolation evidence never excuses a full-suite failure.
- [ ] #3 Source declarations and runtime modules/cases are reconciled with command identity, parameter counts, skips/todos/filters, empty selections, errors, unsupported cases, flaky/order differences, and limitations visible in `suite-integrity.json` and `suite-integrity.md`.
- [ ] #4 A non-zero coverage policy exit with no reporter module/suite/case error or declaration mismatch is retained as command evidence and residual uncertainty, while any evidenced collection, execution, or hook failure keeps the census `incomplete` or `blocked`.
- [ ] #5 The bounded regimen’s commands, seeds, timing, exact runner/config/setup inputs, raw evidence, and resulting digests are persisted in the immutable current-epoch manifest/raw evidence without asserting universal determinism.
<!-- AC:END -->
