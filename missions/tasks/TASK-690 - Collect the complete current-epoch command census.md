---
id: TASK-690
title: Collect the complete current-epoch command census
status: Done
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-689
createdAt: '2026-09-16T18:34:47.392Z'
updatedAt: '2026-09-17T16:10:39.821Z'
---

## Description

Stage 3 — Command census application.

Owned behaviors: **none**; B-002 remains solely owned by TASK-688. Apply its collector to the supported command surfaces and persist raw/reconciled evidence under the current audit epoch. INV-005 and D-025 are settled: collection/execution evidence precedes conclusions, `incomplete`/`blocked` never renders clean, and the known coverage-threshold policy exit is not misclassified as a test-execution failure. Any command executes project-controlled code only through the documented maintainer invocation.

Reopened 2026-09-17 after the first live run aborted here. The failure was upstream: three B-002 collector defects (unscoped reconciliation on filtered runs, blocked-by-default hook lifecycle on passing tests, exit classification coupled to mismatches) made a clean census unreachable. Those are TASK-688's to fix — this task owns application only, and the worker correctly declined to patch the collector from here. AC #2 was independently satisfied on the first attempt (all three known-flaky suites passed in the full run and twice in isolation); re-verify rather than assume it.

<!-- AC:BEGIN -->
- [x] #1 Current-epoch evidence contains normal, bounded real-watch initial-cycle plus watcher-start/cleanup, coverage, same-order repeat, and deterministic seeded-shuffle runs using the actual supported package command surfaces.
- [x] #2 Full-suite outcomes and two isolation runs each are recorded for `tests/driver/cross-plan-commit-lock.test.ts`, `tests/plans/archive.test.ts`, and `tests/extensions/project-tools.test.ts`; isolation evidence never excuses a full-suite failure.
- [x] #3 Source declarations and runtime modules/cases are reconciled with command identity, parameter counts, skips/todos/filters, empty selections, errors, unsupported cases, flaky/order differences, and limitations visible in `suite-integrity.json` and `suite-integrity.md`.
- [x] #4 A non-zero coverage policy exit with no reporter module/suite/case error is retained as command evidence and residual uncertainty **regardless of any declaration mismatch elsewhere in the census** (D-025 as amended: exit classification reads the reporter payload alone); only an evidenced collection, execution, or hook failure keeps the census `incomplete` or `blocked`.
- [x] #5 The bounded regimen’s commands, seeds, timing, exact runner/config/setup inputs, and raw evidence are persisted in the current epoch without asserting universal determinism. Per D-032 the command-census digest is recorded in `suite-integrity.json`/`raw/`, not inside the manifest sealed at C1; this AC is satisfied when digests compare like with like and is never satisfiable by mutating the immutable manifest.
<!-- AC:END -->

## Implementation Notes

Re-collected the current-epoch command census with the documented explicit-root invocation on 2026-09-17. The collector and digest validation completed successfully. Normal, bounded watch, same-order repeat, seeded shuffle (seed 689), and all six isolation runs passed; the three named suites passed on every full-suite surface and in both isolations each. Coverage exited 1 only because branch coverage was 84.94% against the 85% threshold and is classified post-run-policy-exit with reporter-clean execution. The census is correctly incomplete rather than clean because skips/todos, filtered non-selections, and bounded collector limitations remain undisposed; it has no blocked collection, execution, hook, or outcome-difference finding. bun run lint and bun run typecheck passed.
