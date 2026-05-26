---
id: TASK-330
title: Implement final state commit persistence and retryable state-commit failure
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-326
  - TASK-328
  - TASK-329
createdAt: '2026-05-22T19:57:43.746Z'
updatedAt: '2026-05-22T19:57:43.746Z'
---

## Description

Add run-level final state persistence for successful driver-owned commit runs and record retryable state-commit finalization failures. Owns B-014 and the run-loop/pending-state half of B-015 from source AC-004, AC-006, AC-012. Seams: `lib/driver/run-run-loop.ts`, `lib/driver/run-state.ts`, `lib/driver/types.ts`, `cli/drive/subcommand.ts`. Named tests: `tests/driver/run-run-loop.test.ts` > `creates a final state commit only for run task status updates when state policy is final-state-commit`; `tests/cli/drive/run.test.ts` > `resume retries pending state commit without invoking backend work` for the pending-state setup. Tests must carry markers `@cosmo-behavior plan:drive-resilience-state-model#B-014` and `#B-015` as applicable.

<!-- AC:BEGIN -->
- [ ] #1 B-014: A successful `driver-commits` run with `stateCommitPolicy=final-state-commit` creates one final state commit for this run's task files under `missions/tasks/` and emits state-commit phase events.
- [ ] #2 B-014: Final state commit staging excludes source files, `missions/sessions/`, archived tasks/plans, reviews, and `memory/`, and leaves no Drive-owned task status changes dirty on success.
- [ ] #3 B-014: State commit operations use the same `spec.projectRoot` repository commit lock contract as source commits.
- [ ] #4 B-015: A final state commit failure writes pending finalization with phase `state_commit`, task IDs, `headBeforeFinalization`, and reason, then returns `finalization_failed` rather than completed.
- [ ] #5 State commit policy `none` is explicitly skipped with phase evidence and does not create a state commit.
<!-- AC:END -->
