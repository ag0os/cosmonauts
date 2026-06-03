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

## Non-Goals For This Plan

- No full durable coordinator loop migration.
- No full nested cancellation/pause/resume policy.
- No default concurrent mutable work.
- No daemon, SQLite, or remote coordinator.

## Planner Notes

This plan should be conservative. The goal is production routing for the known
safe frontends, not a complete replacement of every chain behavior.
