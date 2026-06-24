---
id: TASK-402
title: 'Drive run status must reflect terminal events, not a stale record'
status: To Do
priority: high
labels:
  - orchestration
  - drive
  - bug
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.311Z'
updatedAt: '2026-06-24T17:31:44.114Z'
---

## Description

PROBLEM (observed): a Drive run that had aborted continued to report
`status: "running"` from `cosmonauts run status <runId>` and `run list` for
hours. The run record's `updatedAt` was frozen at launch while the run's
`events.jsonl` already ended with `run_aborted`. The record-derived status and
the event-derived truth diverged, making `run status`/`run list` untrustworthy
and forcing consumers to parse `events.jsonl` directly. This was the single most
confusing failure in the session.

WHERE:
- `cli/drive/subcommand.ts` — `reportDriveStatus`, `listDriveRuns`,
  `RunStatusRecord`, `RunStatus` (the status reporting path).
- `lib/driver/run-state.ts` and the normalized run store in
  `lib/durable-runtime/` — where run state/status is persisted.
- the per-run event log `missions/sessions/<plan>/runs/<id>/events.jsonl` —
  the authoritative terminal events (`run_completed`, `run_aborted`,
  `run_failed`, finalization states).

WHAT TO DO:
Make `run status` and `run list` authoritative. Prefer writing the terminal
status into the run record at the moment a terminal event is emitted, so both
record-derived and event-derived consumers agree. Additionally, when the run
record still says `running` but the driving process is no longer alive
(use the existing `isProcessAlive`/pid checks) and the event log contains a
terminal event, reconcile the reported status from that terminal event. A run
that is not alive and whose last event is terminal must never report `running`.

CONSTRAINTS: keep the change minimal and additive to the existing status
machinery; do not break inline/detached/resume status semantics. This file may
be loaded by a running driver, so never leave the build broken between commits.

<!-- AC:BEGIN -->
- [ ] #1 `cosmonauts run status <runId>` returns the terminal status (completed/aborted/failed) once the run event log contains the matching terminal event, even if the run record was never updated.
- [ ] #2 A run whose driving process is not alive and whose last event is `run_aborted` never reports `running` from `run status` or `run list`.
- [ ] #3 `run list` and `run status` report the same reconciled status for the same run.
- [ ] #4 A regression test reproduces a record stuck at `running` with a terminal event in the log and asserts the reconciled terminal status.
- [ ] #5 typecheck, lint, and the full test suite pass.
<!-- AC:END -->
