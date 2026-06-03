# Durable Runtime Phase 2: Backend And Step Model

## Product Goal

Make the durable runtime model concrete around Drive task execution by
introducing generic backend adapter contracts, durable step records, and
finalizer-step modeling while Drive still uses its current loop.

## Source Context

- Master architecture record:
  `missions/architecture/durable-orchestration-runtime.md`
- Depends on:
  `missions/plans/durable-run-store-events/plan.md`
- Phase guidance:
  Plan 2 in the architecture record's "Delivery Plan Breakdown" section.

## Functional Requirements Seed

1. An `OrchestrationBackend` contract exists for preparing, starting, resuming,
   and canceling executable steps where supported.
2. Existing Drive backends can be represented through the generic backend
   adapter layer without changing their current invocation behavior.
3. Generic `StepRecord` persistence captures Drive task execution state,
   backend identity, inputs, outputs, status, attempts, and terminal result.
4. Drive finalization phases are represented or prepared as generic finalizer
   step records without weakening current `finalization_failed` recovery.
5. Step results distinguish backend completion, intended work completion,
   artifacts, verification, commits, and scheduler next action.

## Non-Goals For This Plan

- No scheduler-owned execution loop yet.
- No Drive graph compiler yet.
- No chain migration.
- No broad parallelism.
- No worktree merge finalization.

## Planner Notes

The planner should preserve Drive's current backend contracts and report
requirements. External backend output must be treated as evidence, not proof,
and malformed or missing reports must not silently become success.
