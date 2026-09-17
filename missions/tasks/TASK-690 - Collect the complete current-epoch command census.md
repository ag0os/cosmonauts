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
updatedAt: '2026-09-17T15:46:54.712Z'
---

## Description

Stage 3 — Command census application.

Owned behaviors: **none**; B-002 remains solely owned by TASK-688. Apply its collector to the supported command surfaces and persist raw/reconciled evidence under the current audit epoch. INV-005 and D-025 are settled: collection/execution evidence precedes conclusions, `incomplete`/`blocked` never renders clean, and the known coverage-threshold policy exit is not misclassified as a test-execution failure. Any command executes project-controlled code only through the documented maintainer invocation.

Reopened 2026-09-17 after the first live run aborted here. The failure was upstream: three B-002 collector defects (unscoped reconciliation on filtered runs, blocked-by-default hook lifecycle on passing tests, exit classification coupled to mismatches) made a clean census unreachable. Those are TASK-688's to fix — this task owns application only, and the worker correctly declined to patch the collector from here. AC #2 was independently satisfied on the first attempt (all three known-flaky suites passed in the full run and twice in isolation); re-verify rather than assume it.

<!-- AC:BEGIN -->
- [ ] #1 Current-epoch evidence contains normal, bounded real-watch initial-cycle plus watcher-start/cleanup, coverage, same-order repeat, and deterministic seeded-shuffle runs using the actual supported package command surfaces.
- [ ] #2 Full-suite outcomes and two isolation runs each are recorded for `tests/driver/cross-plan-commit-lock.test.ts`, `tests/plans/archive.test.ts`, and `tests/extensions/project-tools.test.ts`; isolation evidence never excuses a full-suite failure.
- [ ] #3 Source declarations and runtime modules/cases are reconciled with command identity, parameter counts, skips/todos/filters, empty selections, errors, unsupported cases, flaky/order differences, and limitations visible in `suite-integrity.json` and `suite-integrity.md`.
- [ ] #4 A non-zero coverage policy exit with no reporter module/suite/case error is retained as command evidence and residual uncertainty **regardless of any declaration mismatch elsewhere in the census** (D-025 as amended: exit classification reads the reporter payload alone); only an evidenced collection, execution, or hook failure keeps the census `incomplete` or `blocked`.
- [ ] #5 The bounded regimen’s commands, seeds, timing, exact runner/config/setup inputs, and raw evidence are persisted in the current epoch without asserting universal determinism. Per D-032 the command-census digest is recorded in `suite-integrity.json`/`raw/`, not inside the manifest sealed at C1; this AC is satisfied when digests compare like with like and is never satisfiable by mutating the immutable manifest.
<!-- AC:END -->

## Implementation Notes

Collected the current-epoch command census with the documented explicit-root invocation on 2026-09-17. The collector completed and digest validation passed. The census is correctly blocked rather than clean: repeat failed tests/driver/drive-on-graph-acceptance.test.ts, and isolation-cross-plan-commit-lock-2 failed tests/driver/cross-plan-commit-lock.test.ts; the initial normal run, bounded watch, seeded shuffle, both archive isolations, both project-tools isolations, and the first cross-plan isolation passed. Coverage exited 1 only for the 84.96% branch threshold and is classified post-run-policy-exit with reporter-clean execution.
