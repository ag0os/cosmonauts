---
type: decision
title: Drive Resilience and Finalization State Model
description: Archived plan distillation for drive-resilience-state-model.
resource: knowledge/drive-resilience-state-model.md
tags:
  - 'plan:drive-resilience-state-model'
  - 'source:legacy-distillation'
timestamp: '2026-05-26T16:21:11.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/drive-resilience-state-model.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: drive-resilience-state-model
legacyDistilledAt: '2026-05-26T16:21:11Z'
legacySourceSha256: be306a1e7284d9b4b883326b307b560675e31402fb79fde1a8394111edd59b55
---

# Drive Resilience and Finalization State Model

## What Was Built
Drive now distinguishes implementation/verification failures from driver finalization failures. Verified work that fails during source commit, task-status update, or final task-state persistence reports `finalization_failed`, writes retryable pending-finalization state, and can be recovered by CLI resume without re-running backends. Driver-owned commit runs also default to a bounded final state commit for run task files, emit clearer events/status output, and produce plan-completion candidate evidence without taking over plan lifecycle automation.

## Key Decisions
- Model finalization failure as Drive run state, not a new task status: task status vocabulary stays small, while recovery truth lives in `pending-finalization.json`, events, and exact `DriverResult` finalization fields.
- Reuse `cosmonauts drive run --resume <runId>` as the recovery entry point: resume retries pending finalization before backend work, then recomputes dirty-worktree safety before continuing.
- Default `stateCommitPolicy` in driver core: `driver-commits` implies `final-state-commit`, other commit policies imply `none`, and CLI/`run_driver` only pass optional overrides.
- Emit `plan_completion_candidate` rather than completing or archiving the plan: Drive supplies evidence, but lifecycle actions remain coordinator/human-owned.

## Patterns Established
- Pending finalization is phase-specific: commit recovery requires `headBeforeFinalization`, task-status recovery requires `commitSha`, and state-commit recovery requires run task IDs plus `headBeforeFinalization`.
- All Drive commit operations use the project repository lock from `spec.projectRoot`; do not use framework/package roots for source/state commit locking.
- Final state commits stage only the run’s task markdown files under `missions/tasks/`; they must not stage source files, sessions, archives, reviews, or `memory/`.
- Finalization observability is additive: preserve existing Drive events and add `finalize`, `task_finalization_failed`, `run_finalization_failed`, and `plan_completion_candidate` for phase-specific routing.

## Files Changed
- `lib/driver/types.ts`, `lib/driver/run-state.ts` — finalization result types, pending-state contract, state commit policy, and new event vocabulary.
- `lib/driver/run-one-task.ts` — task-level commit/status finalization, no-change evidence, title fallback commit subjects, and project-root commit locking.
- `lib/driver/run-run-loop.ts` — terminal finalization-failed results, final state commits, partial-run skips, and plan completion candidates.
- `cli/drive/subcommand.ts` — resume-first finalization recovery, safe external evidence checks, state policy propagation, and status/list reporting.
- `lib/driver/event-stream.ts`, `domains/shared/extensions/orchestration/watch-events-tool.ts` — bridge/watch support for finalization events and terminal run failures.
- `domains/shared/extensions/orchestration/driver-tool.ts`, `lib/driver/prompt-template.ts` — `run_driver` state policy propagation and prompt expectations.
- `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md` — operator guidance for recovery, state commits, no-change tasks, and deferred non-goals.

## Gotchas & Lessons
- Do not clear pending `state_commit` just because HEAD changed and the worktree is clean; every pending task must currently exist and be `Done`.
- Do not let resume slicing treat `task_finalization_failed` as completion. Continue past the task only after `task_done` exists.
- Verification-only no-change completion is valid only with structured success plus passing postflight; ambiguous reports should not silently complete with no source changes.
- Partial-continue/not-all-done runs preserve existing completion summary semantics but skip final state commit and plan-completion candidates with `not_all_tasks_done` evidence.
