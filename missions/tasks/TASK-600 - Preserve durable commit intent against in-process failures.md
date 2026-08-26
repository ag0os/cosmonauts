---
id: TASK-600
title: Preserve durable commit intent against in-process failures
status: Done
priority: high
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:27:19.734Z'
updatedAt: '2026-08-26T13:38:16.086Z'
---

## Description

Codex review finding 2 (High). In lib/harness-adapters/sync.ts the transaction body persists `phase: "commit-ready"` and then `phase: "committed"`, but the enclosing `catch` is unconditional: any exception thrown AFTER those phases are durable rewrites the journal to `rolling-back` and rolls back. Fresh-process recovery does the opposite, converging `commit-ready` and `committed` FORWARD to new. The same durable phase therefore maps to commit after a crash and rollback after an in-process exception. Worse, a cleanup failure occurring after some backups were already removed can leave a `rolling-back` journal without the backups needed to restore old state. Design section 7 rows 9/10/12/13 define commit-ready and committed as forward-converging; only pre-commit phases roll back. Ratified ground: B-007, INV-002, INV-003, Design section 7, and the plan risk that forbids any crash window mapping to two actions.

<!-- AC:BEGIN -->
- [x] #1 Once `commit-ready` or `committed` is durably persisted, no in-process failure path rewrites the journal to `rolling-back`.
- [x] #2 A failure after durable commit intent preserves the persisted phase and returns a nonzero recovery-required or ambiguous outcome, so fresh-process recovery converges forward exactly as it would after a crash.
- [x] #3 In-process failure and hard-crash recovery produce the SAME final state for every phase, asserted by a test that exercises both for commit-ready and committed.
- [x] #4 Rollback remains the behavior for pre-commit phases (prepared, installing), and a rolling-back journal is never written when required backups have already been cleaned.
- [x] #5 Existing B-007 tests pass under their existing title and marker; no new behavior marker is added.
<!-- AC:END -->

## Implementation Notes

Quality Manager accepted as blocking transaction-semantics finding QM-600. Process after TASK-595 so the phase-vector model is fixed first.
