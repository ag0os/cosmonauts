---
id: TASK-793
title: 'Slice 4: Announce retries and keep their projection nonterminal'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-792
createdAt: '2026-09-29T16:45:01.872Z'
updatedAt: '2026-09-29T16:45:01.872Z'
---

## Description

Implementation Order slice 4. Owns B-002 from AC-005. Design ownership: §3 Retry event and durable projection. Governed by D-001, D-003, D-006, D-012, D-015, D-021, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/types.ts` for `task_retry`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/durable-events.ts`, `lib/driver/durable-steps.ts`, `lib/driver/event-stream.ts`, `lib/driver/shell-command-finalizer.ts`, `lib/driver/README.md` for retry visibility, and `docs/orchestration.md` for retry-event semantics.

## Implementation Plan

Follow Design §3: pass one-based in-memory attempt state through the existing contradicted-path loop; persist attempt 1’s note without changing status; emit `task_retry` activity with trigger, path, and next attempt immediately before the second `spawn_started`; normalize contradicted failure/block evidence and the retry as activity with no terminal durable step; bridge the event live; use `attempt unknown` rather than fabricate state after resume.

<!-- AC:BEGIN -->
- [ ] #1 B-002 (source AC-005): every contradicted-path re-spawn emits exactly one `task_retry` carrying trigger, path, and next attempt before the second `spawn_started`; attempt 1’s contradicted blocked/failed evidence and the retry normalize as activity without a terminal step, one running durable step spans both attempts, and a task that is not re-spawned emits no retry.
- [ ] #2 The slice’s Prove clause is satisfied: attempt 1’s note precedes `task_retry`; `task_retry` precedes the second `spawn_started`; no retry event exists without a re-spawn; the durable record remains one running step; and a resumed finalizer writes `attempt unknown` with a diagnostic rather than fabricating attempt 1.
- [ ] #3 The owned Files to Change (`lib/driver/types.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/durable-events.ts`, `lib/driver/durable-steps.ts`, `lib/driver/event-stream.ts`, `lib/driver/shell-command-finalizer.ts`, `lib/driver/README.md`, `docs/orchestration.md`) deliver Design §3 across legacy JSONL, normalized activity, durable projection, live subscribers, and finalizers.
- [ ] #4 Ratified ground binds exactly: “INV-001 - The worker's record survives every Drive outcome. Drive never replaces text a worker wrote into a task; anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt.” “INV-003 - Every re-spawn is announced. Before Drive runs a worker again for the same task inside one run, it emits an event that names the trigger. Nothing re-spawns silently.” Any collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). If execution-liveness first-terminal work has landed, B-002 is re-validated against it without editing that plan or changing scheduler semantics.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session. Checkpoint (D-028): restart the cosmo host, confirm no stale `bin/cosmonauts-drive-step`. The restart and stale-binary confirmation occur after this slice’s Drive commit and before slice 5 begins.
- [ ] #7 D-030: for B-002, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
