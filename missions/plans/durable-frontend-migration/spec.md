# Durable Runtime Phase 4: Frontend Migration

## Product Goal

Move user-facing orchestration surfaces onto the durable runtime incrementally:
compile Drive specs into graph runs, route `cosmonauts drive` and `run_driver`
through the scheduler, and add the first simple durable chain compiler.

## Source Context

- Master architecture record:
  `missions/architecture/durable-orchestration-runtime.md`
- Depends on:
  `missions/plans/durable-run-store-events/plan.md`,
  `missions/plans/durable-backend-step-model/plan.md`, and
  `missions/plans/durable-graph-scheduler/plan.md`
- Phase guidance:
  Plan 4 in the architecture record's "Delivery Plan Breakdown" section.

## Functional Requirements Seed

1. Drive specs compile into durable graph runs with one step per selected task
   and finalizer steps where needed.
2. `cosmonauts drive` and `run_driver` can route through the graph runtime while
   preserving current CLI/tool compatibility.
3. A simple durable chain compiler supports sequential chains, bracket groups,
   and fan-out.
4. Legacy inline chain behavior remains available for debugging or unsupported
   chain semantics.
5. Coordinator loops, full nested-run lifecycle policy, per-step worktrees, and
   merge finalization remain outside this first migration wave.

## Acceptance Criteria

- [ ] AC-001 - Drive run specs compile into durable graphs with one task step per originally selected task, exact selected order, and policy-gated finalizer steps for source commits, task status, and final state commit.
- [ ] AC-002 - Existing Drive CLI/tool compatibility is preserved: `cosmonauts drive`, `run_driver`, `watch_events`, completion files, finalization-failed reporting, status, and list keep their current user-visible shapes while graph runs also expose read-only durable status/watch.
- [ ] AC-003 - Loop-free chain expressions compile and execute durably for the three supported shapes: sequential stages, bracket-parallel groups, and fan-out, with prompt/model/thinking inputs preserved.
- [ ] AC-004 - Unsupported chain semantics, including loop stages, completion checks, and completion labels, stay on the legacy inline runner with no durable graph written.
- [ ] AC-005 - Detached Drive preserves the frozen run-level `cosmonauts-drive-step` runner: the host prepares and observes the run, while the scheduler executes inside the frozen child so self-modifying runs do not load mutable host orchestration code mid-flight.
- [ ] AC-006 - Graph-backed Drive resumes from persisted graph, step, attempt, heartbeat, original task-selection, and pending-finalization evidence after host/session death without duplicating completed work or losing finalizer/all-task accounting.
- [ ] AC-007 - The migration introduces no regression to existing Drive or chain user-visible outcomes, CLI flags, tool parameters, event rendering, status/list classification, or detached unsupported-backend behavior.
- [ ] AC-008 - Durable step result handling preserves the D-006 unknown-vs-success distinction and maps retryable Drive finalizer failures to today’s `finalization_failed` contract instead of task success, task failure, or silent retry exhaustion.

## Non-Goals For This Plan

- No full durable coordinator loop migration.
- No full nested cancellation/pause/resume policy.
- No default concurrent mutable work.
- No daemon, SQLite, or remote coordinator.

## Planner Notes

This plan should be conservative. The goal is production routing for the known
safe frontends, not a complete replacement of every chain behavior.
