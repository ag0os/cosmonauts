---
id: TASK-791
title: 'Slice 2: Persist structured Drive attempt records'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-790
createdAt: '2026-09-29T16:44:16.567Z'
updatedAt: '2026-09-29T16:44:16.567Z'
---

## Description

Implementation Order slice 2. Owns B-001 from AC-001 and AC-004. Design ownership: §1 Drive append format, §2 report/note transition matrix for failure, partial, unknown, and spawn failure, and §3 in-memory attempt evidence as it applies to note ordering. Governed by D-001, D-003, D-006, D-012, D-014, D-015, D-016, D-018, D-021, D-022, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, and `lib/driver/shell-command-finalizer.ts`.

**Standing AC-marking note (D-028):** as each acceptance criterion is verified, call `task_edit` with `checkAc: [index]`; Drive blocks a `success` report while any criterion is unchecked. This note stands until the all-backend completion protocol (slice 5) is live in the host.

## Implementation Plan

Follow Design §§1–3: format level-three Drive records with outcome, in-memory attempt number, and run ID; make each legacy or graph task step the sole per-attempt note writer; append unknown raw output before inference; separate note persistence from retry-candidate status transition; capture HEAD before spawn; make finalizers status-only except for one idempotent finalization-failure record, using `attempt unknown` with a diagnostic when local attempt state is unavailable.

<!-- AC:BEGIN -->
- [ ] #1 B-001 (source AC-001, AC-004): through both shipped Drive paths, failure, partial, unknown, and spawn-failure attempts preserve all pre-existing implementation-note bytes and append exactly one Drive record naming outcome, attempt, and run; unknown raw output is durable before inference and never duplicated, retry-candidate status stays In Progress, and graph `partialMode: continue` and retried finalizers produce one record per attempt.
- [ ] #2 The slice’s Prove clause is satisfied: prior bytes remain intact on both paths; inferred-unknown success keeps one record; final unknown failure retains the raw record; graph `continue` yields one record per attempt; finalizer retry does not duplicate; attempt 1 precedes attempt 2; and finalization failure writes once.
- [ ] #3 The owned Files to Change (`lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/shell-command-finalizer.ts`) deliver Design §§1–3 for Drive headings, sole-writer behavior, unknown-before-inference, status-only finalization, HEAD capture, and honest `attempt unknown` diagnostics while maintaining graph/legacy parity.
- [ ] #4 Ratified ground binds exactly: “INV-001 - The worker's record survives every Drive outcome. Drive never replaces text a worker wrote into a task; anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt.” “Ranking. INV-001 and INV-002 win over throughput: a lost note or a burned retry costs more than the minutes a retry might save.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). Unknown inference aborts if its append fails, and duplicate writers or records are treated as defects rather than normalized away.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session; because the subagent completion protocol (slice 5) is not live in the host, this task's Description carries the standing AC-marking note, and the coordinator recovers worker notes from the worker transcript after any block.
- [ ] #7 D-030: for B-001, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
