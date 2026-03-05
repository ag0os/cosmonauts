---
id: COSMO-038
title: Add timer-controlled orchestration tests and coverage gates
status: Done
priority: medium
assignee: worker
labels:
  - forge
  - testing
  - quality
  - 'plan:test-suite-standardization'
dependencies:
  - COSMO-035
  - COSMO-036
  - COSMO-037
createdAt: '2026-03-04T20:32:10.000Z'
updatedAt: '2026-03-04T21:20:44.121Z'
---

## Description

Close reliability gaps by testing time-dependent orchestration logic with fake timers and establishing practical baseline coverage gates. This task finalizes the suite-standardization effort by enforcing measurable quality thresholds.

<!-- AC:BEGIN -->
- [ ] #1 Time-dependent tests in orchestration/plans/tasks areas use `vi.useFakeTimers()` where delays/timeouts are part of behavior
- [ ] #2 New/updated tests verify delay/retry/timeout semantics without real-time sleeps
- [ ] #3 Coverage reporting is integrated into normal test runs or CI with a documented baseline gate
- [ ] #4 Coverage threshold targets are explicitly set (initially realistic, with a documented ratchet strategy)
- [ ] #5 `bun run test`, `bun run lint`, and `bun run typecheck` pass with timer tests and coverage gating enabled
<!-- AC:END -->

## Implementation Notes

## Changes

**Fake timers (AC #1, #2):**
- `tests/plans/plan-manager.test.ts`: 2 tests ("should update the updatedAt timestamp", "preserves createdAt after update") — replaced `setTimeout(resolve, 10)` sleeps with `vi.useFakeTimers()` + `vi.setSystemTime()`.
- `tests/tasks/task-manager.test.ts`: 1 test ("should update the updatedAt timestamp") — same pattern.
- `tests/orchestration/chain-runner.test.ts`: 7 loop tests — replaced `Date.now() + 60_000` deadline computation with a fixed `FIXED_NOW` constant under fake timers for deterministic deadlines.

**Coverage gates (AC #3, #4):**
- `vitest.config.ts`: Added `thresholds` block — statements: 65%, branches: 85%, functions: 55%, lines: 65%.
- `package.json`: Added `test:coverage` script.
- Added `@vitest/coverage-v8@3.2.4` as devDependency (matched vitest 3.x).

**Documentation (AC #4):**
- `docs/testing.md`: Added "Coverage Thresholds" section with baseline table, ratchet strategy, and running instructions. Also added "Testing Timestamp Differences" subsection under Fake Timers with the `vi.setSystemTime()` pattern.

## Pre-existing issues
- `bun run lint` exits with 231 errors / 99 warnings — all pre-existing, none in modified files.
- `bun run typecheck` exits with errors in `tests/workflows/workflow-loader.test.ts` — pre-existing, none in modified files.

## Threshold rationale
Thresholds set ~5-6 points below measured values (measured: stmts 71%, branches 89%, funcs 61%, lines 71%) to avoid false failures from normal code churn while still catching meaningful regressions."
