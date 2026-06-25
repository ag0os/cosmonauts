---
id: TASK-403
title: Emit a structured diagnostic reason when the Drive scheduler drains or aborts
status: Done
priority: high
labels:
  - orchestration
  - drive
  - diagnostics
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.314Z'
updatedAt: '2026-06-24T17:42:28.658Z'
---

## Description

PROBLEM (observed): a Drive run aborted with `run_aborted` whose only reason was
the opaque string `scheduler drained`, with NO preceding error event, even
though pending tasks were still dispatchable. It was impossible to tell why from
the event stream; the real cause (broken driver tooling path) had to be
reverse-engineered. A clean "all tasks done" drain and an error/abort drain were
indistinguishable.

WHERE:
- the scheduler that emits the terminal `run_aborted` — `lib/driver/driver.ts`
  and/or the graph scheduler and `lib/driver/run-one-task.ts`.
- `lib/driver/types.ts` — the `DriverEvent`/`run_aborted` event shapes.
- `lib/driver/event-stream.ts` — event emission.

WHAT TO DO:
When the scheduler ends with tasks still pending/not-done, enrich the terminal
event with a STRUCTURED reason: the number of pending tasks and the cause —
unmet dependencies (with the blocking task IDs), a backend/setup failure, or a
caught exception (with its message and the offending phase/task). If the drain
is caused by an exception, emit a diagnostic/error event carrying the message
BEFORE marking the run aborted. Make a clean completion (all tasks done)
clearly distinguishable from an abort, both in the event stream and in the
status surfaced by `run status`.

CONSTRAINTS: additive to existing event types; do not regress normal completion.
Never leave the build broken between commits.

<!-- AC:BEGIN -->
- [x] #1 When the scheduler stops with pending non-done tasks, the terminal event carries a structured reason: pending count plus cause (unmet-dependencies with blocking IDs, backend/setup error, or exception message).
- [x] #2 A scheduler-ending exception emits a diagnostic/error event with the message before the run is marked aborted.
- [x] #3 A clean all-tasks-done completion is distinguishable from an abort in the event stream and in `run status`.
- [x] #4 Regression tests cover the pending-with-unmet-dependencies case and the exception-drain case.
- [x] #5 typecheck, lint, and the full test suite pass.
<!-- AC:END -->
