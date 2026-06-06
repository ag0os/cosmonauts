# Durable Runtime Phase 3: Durable Graph Scheduler

## Product Goal

Implement the smallest useful local durable graph scheduler: dependency
scheduling, leases, heartbeats, stale detection, retry/block transitions,
terminal run state, and bounded parallelism.

## Source Context

- Master architecture record:
  `missions/architecture/durable-orchestration-runtime.md`
- Depends on:
  `missions/plans/durable-run-store-events/plan.md`
  and `missions/plans/durable-backend-step-model/plan.md`
- Phase guidance:
  Plan 3 in the architecture record's "Delivery Plan Breakdown" section.

## Functional Requirements Seed

1. A scheduler can load a graph, mark dependency-satisfied steps ready, lease
   steps, start backend adapters, persist status, and finalize terminal runs.
2. Running steps emit or record heartbeats so stale leases can be detected.
3. Policy controls retry limits, stale handling, blocking, hard timeout, idle
   timeout, and bounded parallelism where implemented.
4. Scheduler restart or crash recovery does not duplicate completed step
   evidence or erase old attempts.
5. The first scheduler remains local, file-backed, single-host, and
   sequential-first.

## Non-Goals For This Plan

- No distributed scheduler.
- No daemon requirement.
- No production default for concurrent mutable implementation steps.
- No chain loop migration.
- No merge finalizer workflow.

## Planner Notes

This is the highest-risk plan. The planner should bias toward a small,
testable scheduler core and explicit policy behavior rather than broad
parallel orchestration.
