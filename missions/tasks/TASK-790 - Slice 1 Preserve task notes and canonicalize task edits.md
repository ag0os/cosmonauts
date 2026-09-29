---
id: TASK-790
title: 'Slice 1: Preserve task notes and canonicalize task edits'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies: []
createdAt: '2026-09-29T16:43:55.639Z'
updatedAt: '2026-09-29T17:21:09.443Z'
---

## Description

Implementation Order slice 1. Owns B-003 from AC-006 and AC-013. Design ownership: §1 Source-preserving task mutation. Governed by D-001, D-003, D-005, D-012, D-015, D-017, D-018, D-022, D-026, D-027, D-028, D-029, and D-030.

Files to Change owned by this slice: `lib/tasks/task-types.ts`, `lib/tasks/lock.ts`, `lib/tasks/task-note-editor.ts`, `lib/tasks/task-manager.ts`, `domains/shared/extensions/tasks/index.ts`, and `cli/tasks/commands/edit.ts`.

**Standing AC-marking note (D-028):** as each acceptance criterion is verified, call `task_edit` with `checkAc: [index]`; Drive blocks a `success` report while any criterion is unchecked. This note stands until the all-backend completion protocol (slice 5) is live in the host.

## Implementation Plan

Follow Design §1: make replace and append inputs mutually exclusive; put every task update under the task-ID `withEntityFileLock` while preserving the existing episode-lock ordering; use a focused raw-source editor to transplant the complete Implementation Notes span on every non-replacing update and append idempotently in the source line-ending style; expose append mode through `task_edit` and the CLI; normalize titles before persistence and canonical rename. Record the `lib/tasks/task-manager.ts` and `lib/tasks/lock.ts` hand-off for later execution-liveness re-validation without editing that plan.

<!-- AC:BEGIN -->
- [x] #1 B-003 (source AC-006, AC-013): `task_edit` and `cosmonauts task edit --append-notes` preserve every pre-existing raw note byte and append supplied text once, including concurrent cross-process appends; status-only and criterion-only edits leave the raw note section byte-identical; replace mode remains compatible, both modes together are rejected, a `task_edit` title has matching surrounding single, double, or backtick quote pairs stripped repeatedly, is trimmed, and has internal whitespace collapsed before it reaches the task manager, so the stored title and the single canonical task file path both reflect the normalized value; normalized-empty titles are rejected without mutation.
- [x] #2 The slice’s Prove clause is satisfied: CRLF, trailing-space, and blank-line bytes survive status-only, criterion-only, and title-only updates; empty-section append, no-section insertion, duplicate-section refusal, replace compatibility, both-modes rejection, simultaneous separate-process appends, idempotent re-append, normalized-empty rejection, and one canonical path are all demonstrated; a quoted, a nested-quoted, and an irregular-whitespace title each persist normalized with one file path.
- [x] #3 The owned Files to Change (`lib/tasks/task-types.ts`, `lib/tasks/lock.ts`, `lib/tasks/task-note-editor.ts`, `lib/tasks/task-manager.ts`, `domains/shared/extensions/tasks/index.ts`, `cli/tasks/commands/edit.ts`) deliver Design §1, including bounded per-task locking, exact raw-section transplant, mutually exclusive note modes, append routing, and title hygiene; the execution-liveness hand-off required by D-026 (the per-task lock added to `lib/tasks/task-manager.ts` and `lib/tasks/lock.ts`, its lock path and acquisition bound) is recorded in this task's implementation notes for the closeout report, not implemented here.
- [x] #4 Ratified ground binds exactly: “INV-001 - The worker's record survives every Drive outcome. Drive never replaces text a worker wrote into a task; anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt.” “INV-006 - Task state and the worktree change only through validated paths. Worker-supplied task fields are validated before they reach task files, and a worker cannot discard uncommitted work left by a previous attempt.” “Ranking. INV-001 and INV-002 win over throughput: a lost note or a burned retry costs more than the minutes a retry might save.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). Any collision with this ratified ground is stop-and-escalate, not an implementation adjustment.
- [x] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session; because the subagent completion protocol (slice 5) is not live in the host, this task's Description carries the standing AC-marking note, and the coordinator recovers worker notes from the worker transcript after any block.
- [x] #7 D-030: for B-003, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->

## Implementation Notes

B-003 evidence (base commit 4bbe5f402d6dd3fb389dfb6cc9e9c0100992e0d0; uncommitted working tree, Drive owns commit):
| Run | Test name | Commit | Result |
| RED | source-preserving task edits > preserves the complete raw CRLF notes section on status, criterion and title edits | 4bbe5f402d6dd3fb389dfb6cc9e9c0100992e0d0 | FAIL: expected raw CRLF/trailing-space Implementation Notes but serialization replaced them with LF/trimmed notes. |
| GREEN | source-preserving task edits > preserves the complete raw CRLF notes section on status, criterion and title edits | 4bbe5f402d6dd3fb389dfb6cc9e9c0100992e0d0 (working tree; Drive commit pending) | PASS: bun run test (289 files, 3942 tests); targeted 48 passed. Mutation check: temporarily removed raw-section lookup; test failed as expected, restored. |
D-026 hand-off for execution-liveness: lib/tasks/task-manager.ts acquires per-task withEntityFileLock outside the existing episode transition lock; episode capture runs after episode-lock release inside task lock. lib/tasks/lock.ts derives .cosmonauts/task-update-<uppercase ID or SHA256 segment>.lock, with a 10,000 ms acquisition bound; execution-liveness decision 038 should absorb this into withTaskMutation and decision 035 should revalidate lock semantics. No execution-liveness artifacts changed.
Verification: bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all passed. Changed-scope analysis_audit(base=4bbe5f402d6dd3fb389dfb6cc9e9c0100992e0d0) unavailable: unbound, execution-not-consented, provider fallow; not a clean audit.
