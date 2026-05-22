# Mini Brief: Drive Resilience and State Model

Status: brief for future planning, not an approved implementation plan
Origin: observations from `artifact-format-redesign` Drive runs
Related notes:

- `missions/reviews/drive-improvement-observations-artifact-format-redesign.md`
- `missions/archive/plans/artifact-format-redesign/plan.md`
- `memory/artifact-format-redesign.md`

## Problem

Drive currently collapses implementation failures and driver-infrastructure failures into similar task/run outcomes. In `run-017e5ba0-745f-443e-836b-0e906421a5f7`, `TASK-305` was implemented successfully and passed `bun run test`, `bun run lint`, and `bun run typecheck`, but Drive marked it `Blocked` and aborted because the driver-owned commit failed on an ignored lock file: `.cosmonauts/driver-commit.lock`.

That made the behavioral state ambiguous: the task implementation was verified, but finalization failed.

## Goal

Make Drive resilient to post-implementation infrastructure failures by representing task progress more accurately and supporting focused recovery paths.

A coordinator should be able to tell whether a task needs code remediation, verification rerun, commit retry, task-status repair, or run-level infrastructure repair.

## Desired Outcomes

- Drive distinguishes backend/task failure from driver finalization failure.
- A task whose backend succeeded and postflight passed is not reported as behaviorally blocked just because commit/status finalization failed.
- Operators can resume or finalize without rerunning implementation when work is already verified.
- Event summaries clearly show phase outcomes: backend, postflight, commit, task-status update, run finalization.
- Transient lock files cannot interfere with driver-owned commits.
- Source commits and mission/task/archive/memory state persistence have explicit policies rather than implicit dirty-worktree leftovers.

## Candidate Behaviors

### B-001 — Verified implementation with commit failure has a distinct state

- Context: backend returns success and all postflight commands pass
- Action: driver-owned commit fails
- Expected: Drive records a distinct state such as `verified_commit_failed` or `driver_infra_blocked`, including the commit error, without implying the implementation itself failed

### B-002 — Commit/finalization can be retried without re-running implementation

- Context: a task is in the verified-but-not-finalized state
- Action: the operator resumes or retries finalization
- Expected: Drive retries only commit/status finalization or accepts an already-created commit, rather than re-spawning the backend

### B-003 — Event stream reports phase-specific failure

- Context: a detached run hits an infrastructure failure after postflight
- Action: user watches events
- Expected: compact event summaries include enough phase detail to route action correctly, e.g. `backend success`, `postflight passed`, `commit failed`

### B-004 — Lock files never enter commit scope

- Context: Drive uses repo-level commit locks
- Action: driver-owned commit stages changes
- Expected: ignored transient locks are outside commit scope or excluded by robust glob rules

### B-005 — Mission/task state persistence is explicit

- Context: source commits intentionally exclude `missions/` and `memory/`
- Action: Drive updates task status or archive/memory state
- Expected: state persistence follows an explicit policy such as `none`, `final-state-commit`, or `per-task-state-commit`

## Candidate Scope

Included:

- Review and possibly revise Drive task outcome/state vocabulary.
- Add phase-specific events and clearer `watch_events` summaries.
- Add commit/finalization retry semantics for verified work.
- Harden lock-file location or exclusion behavior.
- Design source-vs-state commit policy boundaries.
- Add tests around commit failure after successful postflight.

Excluded unless the planner argues otherwise:

- Parallel execution/worktree isolation.
- Full rewrite of Drive event storage.
- Changing backend prompt contracts.
- Artifact-conformance enforcement.
- Pushing or PR automation.

## Open Design Questions

1. Should verified-but-uncommitted work be a task status, a run state, or both?
2. Should Drive ever mark a task `Done` before the driver-owned commit succeeds?
3. How should task status updates in `missions/tasks` be committed or preserved when source commits exclude `missions/`?
4. Should lock files live under `.cosmonauts/`, the run workdir, `.git/`, or another location?
5. What should resume do when source changes are present but no commit was created?
6. How much of this should be CLI-visible versus only tool/API-visible?

## Planner Instructions

When turning this brief into a plan:

- Load `/skill:drive` and inspect current Drive implementation before proposing state names.
- Preserve existing successful detached and inline flows.
- Treat commit/status failures as driver infrastructure unless backend or postflight failed.
- Include acceptance tests that would have caught the `TASK-305` lock-file abort.
- Keep the plan narrowly focused on resilience/state recovery; do not mix in artifact-format enforcement.
