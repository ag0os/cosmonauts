# Durable Runtime Phase 1: Run Store And Normalized Events

## Product Goal

Create the first shared durable runtime substrate without changing current
Drive behavior: a generic file-backed run store shape and normalized
orchestration event stream that Drive can write alongside its existing events.

## Source Context

- Master architecture record:
  `missions/architecture/durable-orchestration-runtime.md`
- Phase guidance:
  Plan 1 in the architecture record's "Delivery Plan Breakdown" section.

## Functional Requirements Seed

1. A generic `RunStore` interface exists for creating/loading run records,
   appending normalized events, storing step records, reading status, and
   listing recent runs.
2. The first store implementation is file-backed and inspectable, preserving
   Drive-style debuggability.
3. Normalized orchestration event types exist and can represent current Drive
   lifecycle, task, backend activity, finalization, and terminal outcomes.
4. Drive writes normalized orchestration events alongside its existing event
   stream without changing current `watch_events`, CLI status, or resume
   behavior.
5. Read-only `run_status` and `run_watch` compatibility helpers can summarize
   or page normalized events before the scheduler exists.

## Non-Goals For This Plan

- No graph scheduler.
- No backend adapter migration.
- No durable chain compiler.
- No change to Drive's current CLI/tool behavior.
- No SQLite, daemon, remote coordinator, or distributed execution.

## Planner Notes

The planner should convert this seed into a full behavior-first plan with
`AC-###` and `B-###` IDs, named tests, seams, and exact file ownership. Preserve
Drive compatibility as the central acceptance constraint.
