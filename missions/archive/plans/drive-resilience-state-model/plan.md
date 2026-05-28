---
title: Drive Resilience and Finalization State Model
status: active
createdAt: '2026-05-22T19:11:48.366Z'
updatedAt: '2026-05-22T19:39:27.474Z'
---

## Overview

Improve Drive resilience when implementation succeeds but driver finalization fails, and make successful driver-owned commit runs leave less manual cleanup. Today `runOneTask` treats driver-owned commit failures and post-commit task-status failures as blocked task outcomes. That makes verified work look behaviorally failed and gives operators no focused retry path. Recent Drive use also showed that successful `driver-commits` runs leave task status changes dirty, and verification-only tasks produce no source commit without explicit no-change evidence.

This plan introduces an exact finalization-failure result/state contract, records pending-finalization recovery data in the run workdir, uses one project-root commit lock across frontends, improves source commit subjects, commits Drive-owned task state at the end of successful driver-owned commit runs, emits plan completion candidate evidence, and teaches CLI resume to retry finalization before backend work.

This is still a Drive state/recovery plan only. It does not implement parallel scheduling, verification-tier optimization, artifact-conformance enforcement, live-follow UI, final summary artifacts, automatic plan completion, or archive/memory automation.

## Scope

Included:

- Add finalization-specific result/outcome vocabulary to Drive types and events.
- Emit phase-specific source commit, task-status update, and final state-commit events.
- Record `pending-finalization.json` when source commit, task-status, or final state-commit finalization fails after backend/postflight success.
- Keep verified-but-not-finalized tasks out of the normal `Blocked` implementation path.
- Add CLI resume behavior that finalizes pending work without re-spawning the backend, then continues remaining tasks when safe.
- Verify current task files are present and `Done` before accepting externally completed state-commit finalization.
- Normalize source/state commit locking on `spec.projectRoot` for both CLI and `run_driver` paths.
- Improve driver-owned source commit subjects by falling back to task titles instead of generic `driver task update`.
- Emit explicit no-change finalization evidence for verification-only tasks with no source changes to commit.
- Add `stateCommitPolicy` with v1 support for `none` and `final-state-commit`; default to `final-state-commit` when `commitPolicy=driver-commits`, otherwise `none`.
- Add a final state commit that stages Drive-owned task status updates for this run under `missions/tasks/` after a successful driver-owned commit run.
- Emit `plan_completion_candidate` when all tasks labeled `plan:<slug>` are Done after successful finalization; do not edit the plan automatically.
- Update `watch_events`, Drive CLI status/list, `lib/driver/README.md`, and `/skill:drive` guidance.

Excluded:

- Parallel task execution, worktree isolation, path-aware scheduling, or merge queues.
- Tiered verification scheduling (`perTaskPostflightCommands` / `finalPostflightCommands`).
- Backend prompt/report contract changes.
- Artifact-conformance enforcement in Drive.
- Automatic plan completion, archive moves, memory distillation, push, PR, or remote automation.
- Generated final run summary artifact files.
- Live-follow dashboard/status UI beyond improved event summaries.

## Decision Log

- **D-001 — Model finalization failure as run state, not a new task status**
  - Decision: Add Drive-level `finalization_failed` outcome and events while leaving task files in existing statuses. A verified task whose source commit finalization fails stays `In Progress` with implementation notes, not `Blocked` or `Done`.
  - Alternatives: Add a global task status such as `Verified`; continue using `Blocked`; mark `Done` before commit/status finalization succeeds.
  - Why: The task system has a small status vocabulary used across the project. Drive-specific recovery state belongs in run artifacts/events, and `Done` before finalization would overstate persistence.
  - Decided by: planner-proposed

- **D-002 — Resume finalizes first instead of re-running implementation**
  - Decision: CLI `--resume` detects `pending-finalization.json`, retries the failed finalization phase, clears pending state on success, and only then continues remaining queued tasks.
  - Alternatives: Add a separate `drive finalize` command; always rerun the backend; require manual task repair before resume.
  - Why: `--resume` is the existing recovery entry point. Finalizing first matches operator intent and prevents re-spawning agents for already verified work.
  - Decided by: planner-proposed

- **D-003 — Commit Drive-owned task state by default for driver-owned commit runs**
  - Decision: Add `stateCommitPolicy`, defaulting to `final-state-commit` when `commitPolicy=driver-commits` and to `none` otherwise. The final state commit stages only Drive-owned task status updates under `missions/tasks/` for this run's task IDs.
  - Alternatives: Keep state persistence as `none`; include task status updates in each source commit; implement broader `per-task-state-commit` / archive / memory commit policies.
  - Why: Recent Drive use showed task status dirtiness as the main manual cleanup. A single final state commit preserves clean source commits while making state persistence explicit and bounded.
  - Decided by: user-approved agent recommendation

- **D-004 — Preserve existing events and add phase events rather than replacing them**
  - Decision: Keep existing events for compatibility; add `finalize`, `task_finalization_failed`, `run_finalization_failed`, and `plan_completion_candidate` events.
  - Alternatives: Rename existing events; infer phase from event order only.
  - Why: Existing tests and consumers depend on current event names. Additive events give clearer routing without breaking successful flows.
  - Decided by: planner-proposed

- **D-005 — Emit completion candidates, not automatic plan completion**
  - Decision: Drive emits `plan_completion_candidate` when all plan-linked tasks are Done, but it does not mark the plan completed or archive/distill anything.
  - Alternatives: Add `completePlanOnSuccess: true` now; leave plan completion entirely manual with no event.
  - Why: The candidate event reduces operator inspection while avoiding lifecycle side effects and plan/archive policy scope creep.
  - Decided by: planner-proposed, user-approved

- **D-006 — Use one project-root commit lock for all Drive commit paths**
  - Decision: Source commits, final state commits, and finalization retries acquire repo commit locks from `spec.projectRoot`. `cosmonautsRoot`/framework paths are not used for repository commit locking.
  - Alternatives: Keep CLI and `run_driver` lock roots separate; use framework root for tool-launched runs.
  - Why: Separate lock roots permit concurrent commit finalization in one project and make lock-file pathspec guarantees frontend-dependent.
  - Decided by: plan-reviewer finding accepted

- **D-007 — Driver core owns `stateCommitPolicy` defaults**
  - Decision: Add a driver-core resolver for `stateCommitPolicy`, and have both CLI and `run_driver` pass optional overrides to the same spec field.
  - Alternatives: Compute defaults separately in every frontend; leave `run_driver` schema optional/unspecified.
  - Why: `stateCommitPolicy` changes successful run behavior, so the default must be consistent across all Drive frontends.
  - Decided by: plan-reviewer finding accepted

- **D-008 — State-commit external acceptance must prove task state, not just HEAD movement**
  - Decision: Resume may clear pending `state_commit` finalization only after every pending task ID currently resolves to a task whose status is `Done`; changed HEAD and clean worktree alone are insufficient.
  - Alternatives: Disallow external state-commit acceptance entirely; accept any changed HEAD as proof of state persistence.
  - Why: Task status is the state being persisted. A changed HEAD without current Done task files could be unrelated or could have reverted the state updates.
  - Decided by: plan-reviewer finding accepted

## Behaviors

### B-001 — Successful flows emit additive finalization phase events

- Source: AC-001, AC-018
- Context: a task backend reports success, postflight passes, driver-owned source commit succeeds or is explicitly skipped for no changes, and task status updates to Done
- Action: Drive runs the task
- Expected: existing success events still appear, and additive finalization phase events show commit and task-status finalization started/passed/skipped as applicable
- Seam: `lib/driver/run-one-task.ts`; `lib/driver/types.ts`
- Test: `tests/driver/run-one-task.test.ts` > `emits commit and task-status finalization phase events on successful driver commit`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-001`

### B-002 — Commit failure after verified implementation records finalization failure

- Source: AC-002, AC-005
- Context: backend success and postflight commands pass, but `driver-commits` fails while creating the source commit
- Action: Drive finalizes the task
- Expected: Drive emits commit failed and task finalization failed events, writes pending-finalization state with required pre-finalization HEAD, returns `finalization_failed`, leaves the task not Done and not Blocked, and does not emit `task_blocked`
- Seam: `lib/driver/run-one-task.ts`; `lib/driver/run-state.ts`; `lib/driver/types.ts`
- Test: `tests/driver/run-one-task.test.ts` > `records finalization_failed instead of blocked when driver commit fails after passing postflight`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-002`

### B-003 — Task-status update failure after commit records finalization failure with commit SHA

- Source: AC-003, AC-005
- Context: a driver-owned source commit succeeds but updating the task file to Done fails
- Action: Drive handles task-status finalization
- Expected: Drive emits task-status failed and task finalization failed events, writes pending-finalization state with required `commitSha`, returns `finalization_failed`, and does not emit `task_done`
- Seam: `lib/driver/run-one-task.ts`; `lib/driver/run-state.ts`; `lib/driver/types.ts`
- Test: `tests/driver/run-one-task.test.ts` > `records finalization_failed with commit sha when task status update fails after commit`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-003`

### B-004 — Run loop persists finalization_failed with exact result details

- Source: AC-004, AC-005, AC-018
- Context: task execution or final state persistence returns a finalization-failed outcome
- Action: `runRunLoop` creates the terminal run result
- Expected: the persisted `DriverResult` has outcome `finalization_failed`, required `finalizationPhase` and `finalizationReason`, optional `finalizationTaskId`/`finalizationCommitSha`, and no `blockedTaskId`/`blockedReason` overload; it emits terminal `run_finalization_failed`
- Seam: `lib/driver/run-run-loop.ts`; `lib/driver/types.ts`; `lib/driver/run-state.ts`
- Test: `tests/driver/run-run-loop.test.ts` > `reports finalization_failed outcome with exact finalization details`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-004`

### B-005 — Resume retries pending commit finalization before backend work

- Source: AC-006
- Context: a previous run has `pending-finalization.json` for phase `commit` and source changes are still committable
- Action: `cosmonauts drive run --plan <slug> --resume <runId>` runs
- Expected: CLI retries commit and task-status finalization without invoking `runInline`, `startDetached`, or any backend for that task; after success it clears pending state and continues remaining queued tasks when the worktree is safe
- Seam: `cli/drive/subcommand.ts`; `lib/driver/run-state.ts`; `lib/driver/run-one-task.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume finalizes pending commit failure before invoking backend work`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-005`

### B-006 — Resume accepts an already-created external commit when safe

- Source: AC-007
- Context: pending commit finalization exists with required `headBeforeFinalization`, no committable source changes remain, and `HEAD` differs from that recorded head
- Action: CLI resume finalizes the task
- Expected: Drive records current HEAD as accepted commit evidence, updates task status, clears pending finalization, and does not rerun backend or fail dirty-worktree guard
- Seam: `cli/drive/subcommand.ts`; `lib/driver/run-state.ts`; `lib/driver/run-one-task.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume accepts changed HEAD as existing commit for pending finalization`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-006`

### B-007 — Resume refuses unsafe external commit evidence

- Source: AC-007
- Context: pending commit finalization is missing `headBeforeFinalization`, current `HEAD` is unchanged, or source changes remain dirty but cannot be committed
- Action: CLI resume evaluates external commit acceptance
- Expected: Drive leaves pending finalization in place, reports finalization failure, and does not mark the task Done or accept unrelated history movement
- Seam: `cli/drive/subcommand.ts`; `lib/driver/run-state.ts`; `lib/driver/run-one-task.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume refuses external commit acceptance without changed head evidence`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-007`

### B-008 — State-commit external acceptance requires current Done task files

- Source: AC-008
- Context: pending `state_commit` finalization exists, worktree is clean, and current `HEAD` differs from recorded `headBeforeFinalization`
- Action: CLI resume evaluates external state-commit acceptance
- Expected: Drive clears pending finalization only if every pending task ID resolves through `TaskManager.getTask()` and has status `Done`; if any task is missing or not Done, it leaves pending finalization in place and reports failure
- Seam: `cli/drive/subcommand.ts`; `lib/driver/run-state.ts`; `lib/tasks/task-manager.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume refuses state commit external acceptance when pending tasks are missing or not done`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-008`

### B-009 — Watch events summarize phase-specific finalization and no-change outcomes

- Source: AC-005
- Context: a detached or inline run emits commit failure, commit skipped for no source changes, state commit failure, or run finalization failure events
- Action: an operator calls `watch_events`
- Expected: compact one-line summaries include finalization phase and failure/skipped reason so the operator can route recovery to driver finalization, verification-only completion, or state persistence rather than code remediation
- Seam: `domains/shared/extensions/orchestration/watch-events-tool.ts`
- Test: `tests/extensions/orchestration-watch-events.test.ts` > `summarizes finalization phase failures and no-change commits distinctly from task blocks`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-009`

### B-010 — Finalization failure events are bridgeable and terminal

- Source: AC-017
- Context: a detached run emits `run_finalization_failed`
- Action: the JSONL event bridge tails the event log
- Expected: the event is bridged to the activity bus and stops the bridge like `run_completed` and `run_aborted`
- Seam: `lib/driver/event-stream.ts`
- Test: `tests/driver/event-stream.test.ts` > `bridges run_finalization_failed and treats it as terminal`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-010`

### B-011 — Drive status and list expose finalization_failed runs

- Source: AC-005, AC-006
- Context: a run has `run.completion.json` with outcome `finalization_failed`
- Action: a user runs `cosmonauts drive status` or `cosmonauts drive list`
- Expected: JSON output reports status `finalization_failed` and includes finalization details from `DriverResult`
- Seam: `cli/drive/subcommand.ts`; `tests/cli/drive/status.test.ts`; `tests/cli/drive/list.test.ts`
- Test: `tests/cli/drive/status.test.ts` > `reports finalization_failed completion details`; `tests/cli/drive/list.test.ts` > `lists finalization_failed runs`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-011`

### B-012 — Commit locks use project root across CLI and run_driver

- Source: AC-009, AC-010
- Context: CLI and Pi `run_driver` both run with `driver-commits`
- Action: Drive acquires the repository commit lock for source or state commits
- Expected: both frontends use `getRepoCommitLockPath(spec.projectRoot)` so concurrent finalization shares one project lock and `.cosmonauts/*.lock` pathspec tests cover the actual lock path
- Seam: `lib/driver/run-one-task.ts`; `lib/driver/driver.ts`; `domains/shared/extensions/orchestration/driver-tool.ts`; `lib/driver/lock.ts`
- Test: `tests/extensions/orchestration-driver-tool.test.ts` > `run_driver uses the project root for repository commit locking`; `tests/driver/run-one-task.test.ts` > `driver commit exclusion uses repo lock excludes missions and memory and emits sha`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-012`

### B-013 — State commit policy defaults consistently across frontends

- Source: AC-011
- Context: a Drive run is created through CLI or `run_driver` without an explicit state commit policy
- Action: Drive resolves the run spec
- Expected: driver core defaults to `final-state-commit` for `driver-commits` and `none` otherwise; both frontends expose and propagate optional overrides
- Seam: `lib/driver/types.ts`; `cli/drive/subcommand.ts`; `domains/shared/extensions/orchestration/driver-tool.ts`
- Test: `tests/cli/drive/run.test.ts` > `defaults state commit policy from commit policy`; `tests/extensions/orchestration-driver-tool.test.ts` > `run_driver propagates state commit policy defaults and overrides`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-013`

### B-014 — Final state commit persists only run task status updates

- Source: AC-004, AC-012
- Context: a driver-owned commit run completes all queued tasks and Drive has updated task markdown status/timestamps under `missions/tasks/`
- Action: final state persistence runs with `stateCommitPolicy=final-state-commit`
- Expected: Drive creates one final state commit for the run's task files only, excludes source files, `missions/sessions/`, archive moves, and `memory/`, emits state-commit phase events, and leaves no Drive-owned task status changes dirty on success
- Seam: `lib/driver/run-run-loop.ts`; `lib/driver/types.ts`; `cli/drive/subcommand.ts`
- Test: `tests/driver/run-run-loop.test.ts` > `creates a final state commit only for run task status updates when state policy is final-state-commit`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-014`

### B-015 — State commit failure is retryable finalization failure

- Source: AC-004, AC-006, AC-012
- Context: all task implementations finalized but the final task-state commit fails
- Action: Drive persists final state
- Expected: Drive writes pending finalization with phase `state_commit`, returns `finalization_failed`, and resume retries only the state commit without re-running task backends
- Seam: `lib/driver/run-run-loop.ts`; `lib/driver/run-state.ts`; `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume retries pending state commit without invoking backend work`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-015`

### B-016 — Driver-owned source commit subjects use task titles when reports are generic

- Source: AC-013
- Context: backend output lacks useful notes or would otherwise produce `TASK-###: driver task update`
- Action: Drive creates a driver-owned source commit
- Expected: the commit subject falls back to the task title, for example `TASK-324: Update artifact conformance guidance`
- Seam: `lib/driver/run-one-task.ts`
- Test: `tests/driver/run-one-task.test.ts` > `uses task title as driver commit subject when report summary is generic`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-016`

### B-017 — Verification-only tasks emit explicit no-source-change finalization evidence

- Source: AC-014
- Context: a task succeeds and postflight passes, but there are no source changes for a driver-owned source commit
- Action: Drive finalizes the task
- Expected: Drive emits commit finalization as skipped/passed with reason `no_changes`, does not emit `commit_made`, marks the task Done, and includes no-change evidence in events/results
- Seam: `lib/driver/run-one-task.ts`; `domains/shared/extensions/orchestration/watch-events-tool.ts`
- Test: `tests/driver/run-one-task.test.ts` > `emits explicit no-change commit finalization evidence for verification-only tasks`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-017`

### B-018 — Plan completion candidate is emitted after all plan tasks are Done

- Source: AC-015, AC-019
- Context: a run completes and every task labeled `plan:<slug>` is Done
- Action: Drive finishes run-level finalization
- Expected: Drive emits `plan_completion_candidate` with the plan slug and task count, while leaving `missions/plans/<slug>/plan.md` unchanged
- Seam: `lib/driver/run-run-loop.ts`; `lib/driver/types.ts`; `domains/shared/extensions/orchestration/watch-events-tool.ts`
- Test: `tests/driver/run-run-loop.test.ts` > `emits plan completion candidate without editing the plan when all plan tasks are done`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-018`

### B-019 — Partial-continue runs skip state commit and completion candidate

- Source: AC-016, AC-018
- Context: a task returns partial and `partialMode=continue` lets the run proceed to later tasks
- Action: the run loop reaches run-level finalization with `tasksBlocked > 0`
- Expected: existing `run_completed` summary semantics remain, but Drive skips final state commit with reason `not_all_tasks_done` and does not emit `plan_completion_candidate`
- Seam: `lib/driver/run-run-loop.ts`
- Test: `tests/driver/run-run-loop.test.ts` > `skips final state commit and completion candidate for partial continue runs`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-019`

### B-020 — Existing implementation failure paths keep behaviorally blocked semantics

- Source: AC-018, AC-019
- Context: preflight fails, backend exits nonzero, report outcome fails, or postflight fails
- Action: Drive runs a task
- Expected: these remain normal blocked/aborted implementation or verification outcomes and do not write pending-finalization state or final state commits
- Seam: `lib/driver/run-one-task.ts`; `lib/driver/run-run-loop.ts`
- Test: `tests/driver/run-one-task.test.ts` > `does not write pending finalization for backend or postflight failures`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-020`

### B-021 — Drive guidance documents recovery and bounded UX follow-ups

- Source: AC-011, AC-019
- Context: an operator reads Drive docs or `/skill:drive` after these changes
- Action: they look for finalization recovery, state commit policy, no-change tasks, plan completion candidate, and known non-goals
- Expected: guidance explains finalization-failed recovery, default final state commit behavior, explicit verification-only no-change events, and defers live-follow UI/final summary artifacts/automatic plan completion
- Seam: `lib/driver/README.md`; `domains/shared/skills/drive/SKILL.md`; `tests/prompts/drive-skill.test.ts`
- Test: `tests/prompts/drive-skill.test.ts` > `documents finalization recovery state commits no-change tasks and deferred UX followups`
- Marker: `@cosmo-behavior plan:drive-resilience-state-model#B-021`

## Design

### Exact result and pending-state contract

Do not overload blocked fields for finalization failures. Define result shapes explicitly in `lib/driver/types.ts`:

```ts
export type DriverResultOutcome =
	| "completed"
	| "aborted"
	| "blocked"
	| "finalization_failed";

export type TaskOutcomeStatus =
	| "done"
	| "blocked"
	| "partial"
	| "finalization_failed";

export type FinalizationPhase = "commit" | "task_status" | "state_commit";
export type StateCommitPolicy = "none" | "final-state-commit";

interface DriverResultBase {
	runId: string;
	outcome: DriverResultOutcome;
	tasksDone: number;
	tasksBlocked: number;
}

export type DriverResult =
	| (DriverResultBase & {
			outcome: "completed";
			stateCommitSha?: string;
			planCompletionCandidate?: { planSlug: string; taskCount: number };
	  })
	| (DriverResultBase & {
			outcome: "blocked" | "aborted";
			blockedTaskId?: string;
			blockedReason?: string;
	  })
	| (DriverResultBase & {
			outcome: "finalization_failed";
			finalizationPhase: FinalizationPhase;
			finalizationReason: string;
			finalizationTaskId?: string;
			finalizationCommitSha?: string;
			pendingFinalizationPath: string;
	  });
```

Persisted `run.completion.json`, `drive status`, and `drive list` all use this contract. `blockedTaskId` and `blockedReason` remain for behavioral blocks/aborts only.

Define `PendingFinalizationState` as a discriminated union so required recovery evidence cannot be optional for the relevant phase:

```ts
interface PendingBase {
	runId: string;
	planSlug: string;
	createdAt: string;
	commitPolicy: DriverRunSpec["commitPolicy"];
	stateCommitPolicy: StateCommitPolicy;
	reason: string;
}

export type PendingFinalizationState =
	| (PendingBase & {
			phase: "commit";
			taskId: string;
			headBeforeFinalization: string;
			commitSubject: string;
			verifiedAt: string;
	  })
	| (PendingBase & {
			phase: "task_status";
			taskId: string;
			commitSha: string;
			commitSubject?: string;
	  })
	| (PendingBase & {
			phase: "state_commit";
			taskIds: string[];
			headBeforeFinalization: string;
	  });
```

`pending-finalization.json` lives at `missions/sessions/<plan>/runs/<runId>/pending-finalization.json`, is written atomically, and is cleared only after the pending phase succeeds or safe external evidence is accepted.

Task file policy:

- On source commit finalization failure after verified implementation, leave status `In Progress`; add implementation notes that backend/postflight succeeded and driver commit finalization failed.
- On task-status update failure after source commit, the task file may remain in its previous state because the status write failed; the pending-finalization state and events carry recovery truth.
- Do not mark `Done` until source commit policy and task-status update have both succeeded.
- Do not mark `Blocked` for finalization failures caused by driver source commit/status/state infrastructure.

### Event contract and bridge semantics

Add these event variants in `lib/driver/types.ts`:

```ts
| {
	type: "finalize";
	taskId?: string;
	phase: "commit" | "task_status" | "state_commit";
	status: "started" | "passed" | "failed" | "skipped";
	details?: {
		sha?: string;
		subject?: string;
		error?: string;
		reason?: "no_changes" | "policy_none" | "not_all_tasks_done";
	};
}
| {
	type: "task_finalization_failed";
	taskId: string;
	phase: "commit" | "task_status";
	reason: string;
	commitSha?: string;
	retryable: true;
}
| {
	type: "run_finalization_failed";
	phase: "commit" | "task_status" | "state_commit";
	reason: string;
	taskId?: string;
	commitSha?: string;
}
| {
	type: "plan_completion_candidate";
	planSlug: string;
	taskCount: number;
	reason: "all_plan_tasks_done";
}
```

Keep existing events. `event-stream.ts` must bridge `task_finalization_failed`, `run_finalization_failed`, and `plan_completion_candidate`. `run_finalization_failed` is terminal for `bridgeJsonlToActivityBus` and must be included in `isTerminalEvent()` alongside `run_completed` and `run_aborted`.

### Commit lock and commit-scope rules

Repository commit locking contract:

- All source commits, state commits, and finalization retries call `acquireRepoCommitLock(spec.projectRoot)` or an equivalent helper whose root is `spec.projectRoot`.
- Do not use `ctx.cosmonautsRoot`, framework root, or package root for repository commit locks.
- Framework/package roots may still be used for locating bundled envelopes or detached runner binaries.

Source commit scope:

- Source commits keep existing exclusions: `missions/**`, `memory/**`, and `.cosmonauts/*.lock`.
- Lock-file regression coverage must prove the actual project-root lock used by both CLI and `run_driver` cannot enter source commit scope.

Final state commit scope:

- Stage only task files under `missions/tasks/` whose task IDs are in `spec.taskIds` and whose current files exist.
- Do not stage source files, `missions/sessions/`, archived tasks/plans, reviews, or `memory/`.
- Subject: `Drive state: mark <planSlug> tasks done`.

### Source commit and no-change contract

Refactor driver-owned source commit finalization so it has explicit outcomes:

```ts
type SourceCommitResult =
	| { status: "committed"; sha: string; subject: string }
	| { status: "no_changes" }
	| { status: "failed"; reason: string };
```

Rules:

- Commit subject uses `TASK-ID: <useful report summary>` when report notes are useful; otherwise `TASK-ID: <task title>`.
- Verification-only success with no committable source changes is a valid `no_changes` outcome. Emit `finalize(commit, skipped, reason: no_changes)` and continue to task-status finalization.
- Unknown reports can still infer success only when postflight passed and committable changes exist, preserving current behavior; no-change inference remains blocked unless the report itself was structured success.

### State commit policy defaults

Add `stateCommitPolicy?: StateCommitPolicy` to `DriverRunSpec`, but resolve defaults in driver core through a shared helper:

```ts
export function resolveStateCommitPolicy(
	spec: Pick<DriverRunSpec, "commitPolicy" | "stateCommitPolicy">,
): StateCommitPolicy {
	return spec.stateCommitPolicy ??
		(spec.commitPolicy === "driver-commits" ? "final-state-commit" : "none");
}
```

CLI and `run_driver` both accept optional `stateCommitPolicy` and write it into the spec when provided. If omitted, all driver code calls `resolveStateCommitPolicy()` so defaults are identical across frontends.

Final state commit runs only when every queued task in this run finished as `done`. If `tasksBlocked > 0` because of partial-continue or any other non-done outcome, emit `finalize(state_commit, skipped, reason: not_all_tasks_done)`, do not create a state commit, keep existing run summary behavior, and do not emit `plan_completion_candidate`.

### Finalization retry contract

Normal task execution and CLI resume should share finalization helpers:

- Commit retry uses source commit scope and `spec.projectRoot` commit lock.
- Commit-pending external acceptance requires phase `commit`, required `headBeforeFinalization`, no committable source changes, and current `HEAD !== headBeforeFinalization`. Missing or unchanged HEAD evidence fails safely.
- Status finalization updates task to `Done` and emits `task_done` only after the update succeeds.
- State commit retry stages only run task files and uses `spec.projectRoot` commit lock.
- State-commit external acceptance requires all of these conditions:
  - pending phase is `state_commit`
  - no committable state changes remain for the pending task files
  - current `HEAD !== headBeforeFinalization`
  - every `taskId` in pending state resolves through `TaskManager.getTask()` and has `status: "Done"`
- If any pending state task is missing or not Done, leave pending finalization in place and report failure even if HEAD changed and the worktree is clean.
- After successful pending finalization, remove `pending-finalization.json` before continuing remaining tasks.

CLI resume changes:

- `loadResumeDefaults()` loads pending finalization along with spec/events.
- Dirty-worktree refusal does not block initial pending finalization retry when dirty paths are expected for commit or state-commit retry.
- After finalization succeeds, recompute dirty paths. If dirty paths remain and remaining backend tasks would run, keep the existing dirty-worktree guard unless `--resume-dirty` was supplied.
- Resume slicing must not treat `task_finalization_failed` as completed. It continues after the finalized task only once `task_done` exists.
- Clear stale `run.completion.json` for detached resumes as well as inline resumes before continuing.

### Plan completion candidate

After successful task/status/state finalization, query tasks labeled `plan:<slug>`. If all are `Done`, emit:

```ts
{
	type: "plan_completion_candidate",
	planSlug,
	taskCount,
	reason: "all_plan_tasks_done"
}
```

Do not call `PlanManager`, do not edit `plan.md`, and do not archive/distill. This is evidence for the coordinator/human to take the normal lifecycle step separately.

## Files to Change

- `tests/driver/run-one-task.test.ts` — B-001, B-002, B-003, B-012, B-016, B-017, B-020.
- `tests/driver/run-run-loop.test.ts` — B-004, B-014, B-018, B-019.
- `tests/driver/event-stream.test.ts` — B-010 bridge/terminal coverage.
- `tests/cli/drive/run.test.ts` — B-005, B-006, B-007, B-008, B-013, B-015 plus stale detached completion cleanup.
- `tests/cli/drive/status.test.ts` — B-011 status output coverage.
- `tests/cli/drive/list.test.ts` — B-011 list output coverage.
- `tests/extensions/orchestration-watch-events.test.ts` — B-009 watch summary coverage.
- `tests/extensions/orchestration-driver-tool.test.ts` — B-012 and B-013 `run_driver` commit lock / state policy coverage.
- `tests/driver/prompt-template.test.ts` — state commit policy rendering coverage.
- `tests/prompts/drive-skill.test.ts` — B-021 Drive guidance coverage.
- `lib/driver/types.ts` — result/status/event/pending-state/state-policy types and spec field.
- `lib/driver/run-state.ts` — pending-finalization read/write/clear helpers and terminal outcome support.
- `lib/driver/run-one-task.ts` — finalization phase events, pending state, finalization_failed return, project-root commit lock, improved commit subjects, no-change evidence, implementation failure preservation.
- `lib/driver/run-run-loop.ts` — exact finalization result, final state commit, partial skip, plan completion candidate.
- `lib/driver/event-stream.ts` — bridge and terminal handling for finalization events.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` — summarize new events.
- `cli/drive/subcommand.ts` — parse/propagate `stateCommitPolicy`, resume pending finalization, validate state-commit external acceptance via current Done tasks, status/list compatibility, dirty guard behavior.
- `domains/shared/extensions/orchestration/driver-tool.ts` — accept/propagate `stateCommitPolicy`; ensure project-root commit lock behavior through driver core.
- `lib/driver/prompt-template.ts` — render state commit policy in expectations.
- `lib/driver/README.md` — finalization-failed state, pending state, resume recovery, no-change tasks, plan completion candidate, state commit policy.
- `domains/shared/skills/drive/SKILL.md` — operator recovery routing, final state commits, no-change tasks, deferred UX follow-ups.

## Risks

- **Run result compatibility.** Mitigation: exact `DriverResult` union; status/list tests assert finalization fields are present without blocked-field overload.
- **Commit lock split across frontends.** Mitigation: project-root lock contract and CLI/`run_driver` tests.
- **State commit could stage too much.** Mitigation: pathspec tests prove only run task files under `missions/tasks/` are staged.
- **Resume could hide dirty worktree risks.** Mitigation: bypass dirty guard only for pending finalization; re-run dirty guard before continuing backend tasks.
- **External source commit acceptance could accept unrelated history.** Mitigation: required pre-finalization HEAD and negative tests for missing/unchanged evidence.
- **External state commit acceptance could accept unrelated history.** Mitigation: require current pending tasks to exist and be `Done`; negative tests cover missing/not-Done task files.
- **Detached event bridge may hang after new terminal event.** Mitigation: event-stream terminal test for `run_finalization_failed`.
- **Partial-mode ambiguity.** Mitigation: explicit skip state commit/candidate behavior when any queued task is not done.
- **Plan lifecycle scope creep.** Mitigation: emit candidate only; no plan edit/archive/memory automation.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Driver, CLI, extension, and prompt tests pass; existing inline/detached flows remain green | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | This plan's behaviors name tests and markers; implemented tests carry matching `@cosmo-behavior` markers | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negative tests distinguish backend/postflight failures from commit/status/state finalization failures, dirty resume from pending-finalization resume, missing/unchanged HEAD from accepted external source commit, changed HEAD with missing/not-Done tasks from accepted external state commit, source commits from state commits, and partial-continue from all-done completion | pending | unbound, not enforced; reviewer judgment required |
| 4 | `boundary-conformance` | bindable | unbound | Driver core remains independent of CLI/extensions; CLI/watch tools depend inward; no backend prompt contract changes or PlanManager dependency in run loop | pending | unbound, not enforced; reviewer judgment required |
| 5 | `complexity` | bindable | unbound | Finalization retry reuses normal helpers; no parallel scheduler, worktree manager, gate runner, summary artifact, live-follow UI, or archive/memory engine is introduced | pending | unbound, not enforced; reviewer judgment required |

## Implementation Order

1. **Result/state contract tests first.** Add failing tests for B-002 through B-004 and exact `DriverResult` / pending-state shapes.
2. **Implement task finalization failure recording.** Update `types.ts`, `run-state.ts`, `run-one-task.ts`, and `run-run-loop.ts` for commit/status finalization failures and implementation failure preservation.
3. **Normalize commit lock root.** Add B-012 tests, then change repo commit lock acquisition to `spec.projectRoot` across source/state/retry paths.
4. **Add successful phase, no-change, and commit-subject behavior.** Cover B-001, B-016, and B-017 in `run-one-task`.
5. **Implement state policy defaults and final state commit.** Add B-013/B-014/B-015 tests, shared resolver, final state commit pathspecs, and state-commit pending retry.
6. **Implement CLI resume finalization.** Add B-005/B-006/B-007/B-008 tests and update resume to finalize pending work before backend execution with safe source/state external acceptance evidence.
7. **Update event bridge/status/watch.** Add B-009/B-010/B-011 tests and update event-stream, watch summaries, status/list classification.
8. **Add plan completion and partial handling.** Add B-018/B-019 tests and implementation; confirm no plan file edits.
9. **Make guidance explicit.** Add B-021/prompt-template tests, update README and Drive skill guidance.
10. **Regression/coherence pass.** Ensure B-020 and excluded-scope checks hold; verify finalization events, pending cleanup, run completion files, resume slicing, dirty guard, state commit pathspecs, state acceptance checks, and docs agree.
11. **Final verification.** Run `bun run test`, `bun run lint`, `bun run typecheck`, and `cosmonauts plan check-artifacts drive-resilience-state-model` after markers exist.

## Assumptions

- The previous `.cosmonauts/*.lock` source commit exclusion fix is present and should be preserved with behavior-marker coverage.
- CLI resume is the first recovery surface; adding a Pi `run_driver` resume/finalize tool can be a later follow-up if needed.
- `missions/sessions/<plan>/runs/<runId>/` is durable enough for pending-finalization recovery because Drive already depends on it for `spec.json`, `events.jsonl`, and completion state.
- Drive-created task status changes under `missions/tasks/` are the only state artifacts committed by v1 `final-state-commit`; archive directories and `memory/` remain lifecycle-managed outside Drive.
- Plan completion remains a candidate event, not an automatic plan lifecycle transition.
