## Purpose

Make Drive distinguish verified implementation work from driver infrastructure/finalization failures, and make successful `driver-commits` runs leave repository state cleaner. A backend success plus passing postflight should not look like a behaviorally blocked task just because source commit, task-status, or final task-state persistence failed.

## Users

- Coordinators monitoring Drive runs through `watch_events`.
- Humans using `cosmonauts drive run/status/list` to recover failed detached or inline runs.
- Maintainers debugging driver infrastructure failures separately from implementation failures.
- Operators reviewing Drive-created commit history after ordered task runs.

## User Experience

- Finalization failures report `finalization_failed` with explicit phase/reason details in events, `run.completion.json`, `drive status`, and `drive list`.
- `watch_events` distinguishes backend/postflight/task blocks from commit, task-status, and state-commit failures.
- `cosmonauts drive run --resume <runId>` retries pending finalization before spawning any backend.
- Safe external source-commit acceptance requires recorded pre-finalization HEAD evidence.
- Pending state-commit recovery never clears unless run task files are currently present and Done.
- `driver-commits` uses task-title fallback commit subjects, explicit no-change evidence, and a final task-state commit by default.
- Drive emits `plan_completion_candidate` when all plan-linked tasks are Done, but does not edit the plan.

## Acceptance Criteria

- [ ] AC-001 - Drive emits explicit additive phase events for source commit, task-status, and final state-commit finalization while preserving existing backend/postflight events and successful run behavior.
- [ ] AC-002 - A source commit failure after backend success and passing postflight records `finalization_failed` with phase `commit`, task ID, reason, pending state, and no behavioral `Blocked`/`Done` task status.
- [ ] AC-003 - A task-status update failure after a source commit records `finalization_failed` with phase `task_status`, task ID, reason, commit SHA, and no `task_done` event.
- [ ] AC-004 - A final task-state commit failure records `finalization_failed` with phase `state_commit`, reason, pending state, and retryability.
- [ ] AC-005 - Persisted `DriverResult` has an exact finalization-failure detail contract consumed by status/list output without overloading `blockedTaskId` or `blockedReason`.
- [ ] AC-006 - CLI resume detects pending finalization and retries only the failed finalization phase before backend work; successful retry clears pending state and then continues remaining tasks when safe.
- [ ] AC-007 - Resume accepts an already-created external source commit only when phase is `commit`, `headBeforeFinalization` exists, no committable source changes remain, and current `HEAD` differs from that recorded head; missing/unchanged evidence fails safely.
- [ ] AC-008 - Resume accepts externally completed state-commit finalization only when all pending run task IDs still resolve to current tasks with status `Done`; clean worktree plus changed HEAD alone is not enough.
- [ ] AC-009 - All Drive source/state commit operations use one project repo commit-lock root derived from `spec.projectRoot`, regardless of CLI or `run_driver` frontend.
- [ ] AC-010 - Transient Drive lock files remain outside driver-owned source commit scope, with regression coverage for ignored `.cosmonauts/*.lock` paths.
- [ ] AC-011 - `stateCommitPolicy` is resolved consistently in driver core: `final-state-commit` by default when `commitPolicy=driver-commits`, otherwise `none`; CLI and `run_driver` both expose/propagate the optional override.
- [ ] AC-012 - Final state commits stage only Drive-owned task files for the run's task IDs under `missions/tasks/`; they do not stage source files, `missions/sessions/`, archive moves, or `memory/`.
- [ ] AC-013 - Driver-owned source commit subjects use the task title when backend reports lack a useful summary.
- [ ] AC-014 - Verification-only tasks with no source changes emit explicit no-change source-commit evidence and complete normally when status/state persistence succeeds.
- [ ] AC-015 - When all tasks labeled `plan:<slug>` are Done after successful finalization, Drive emits `plan_completion_candidate` without editing the plan.
- [ ] AC-016 - Partial outcomes, including `partialMode=continue`, keep existing run semantics but skip final state commit and plan completion candidate because not all queued tasks are Done.
- [ ] AC-017 - `run_finalization_failed` is both bridgeable and terminal for detached event bridges.
- [ ] AC-018 - Existing inline, detached, preflight failure, backend failure, postflight failure, partial, and normal commit-success flows keep current observable behavior except for additive phase/state events and final state commits under the new policy.
- [ ] AC-019 - The plan does not implement parallel scheduling, per-task worktrees, verification-tier scheduling, backend prompt contract changes, artifact-conformance enforcement, final summary artifact generation, live-follow UI, automatic plan completion, pushing, or PR automation.

## Scope

Included:

- Driver event/result/pending-state vocabulary for finalization phases.
- Pending-finalization state file in run workdir.
- Finalization retry during CLI resume with safe external acceptance checks.
- Event summary, event bridge, status/list updates.
- Consistent project-root commit locking across CLI and `run_driver` paths.
- Better source commit subjects and no-source-change evidence.
- `stateCommitPolicy` with v1 `none` and `final-state-commit` support.
- Plan completion candidate event.
- Drive docs/skill updates.

Excluded:

- Parallel execution, per-task worktrees, tiered verification, backend prompt contract changes.
- Artifact-conformance enforcement in Drive.
- Automatic plan completion, archive, memory distillation, push, or PR automation.
- Generated final run summary artifact or live-follow dashboard.

## Assumptions

- A task should not be marked `Done` until source commit policy and task-status update both succeed.
- A run with `stateCommitPolicy=final-state-commit` is not fully completed until Drive-owned task state is committed, explicitly skipped for no changes, or externally accepted with current task files verified Done.
- Finalization recovery state belongs in run artifacts/events, not in a new global task status.

## Open Questions

- Future work should decide whether `completePlanOnSuccess`, live-follow status UI, and generated final run summary artifacts belong in Drive or higher-level lifecycle tooling.