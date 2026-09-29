---
id: TASK-792
title: 'Slice 3: Terminate blocked reports before postflight'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-791
createdAt: '2026-09-29T16:44:38.624Z'
updatedAt: '2026-09-29T16:44:38.624Z'
---

## Description

Implementation Order slice 3. Owns B-013 from AC-002 and AC-003. Design ownership: §2 blocked-report row and early terminal branch plus §4 report-contract composition for the blocked outcome. Governed by D-001, D-003, D-004, D-012, D-015, D-022, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/types.ts` for blocked/unverified-commit contracts, `lib/driver/report-parser.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/durable-steps.ts`, `lib/driver/prompt-template.ts` for the machine-interpreted report contract, and `lib/driver/README.md` for blocked parsing and consequences.

**Standing AC-marking note (D-028):** as each acceptance criterion is verified, call `task_edit` with `checkAc: [index]`; Drive blocks a `success` report while any criterion is unchecked. This note stands until the all-backend completion protocol (slice 5) is live in the host.

## Implementation Plan

Follow Design §§2 and 4: retain raw stdout in a distinct blocked report variant; choose non-empty worker notes or raw stdout verbatim as the reason; branch immediately after `spawn_completed` in both paths before postflight, commit, inference, or contradiction logic; project the existing blocked StepResult and terminal event consistently; capture HEAD and record unverified commits for `backend-commits` or dirty paths otherwise; preserve existing `partialMode` behavior.

<!-- AC:BEGIN -->
- [ ] #1 B-013 (source AC-002, AC-003): fenced-JSON and outcome-line `blocked` reports parse under the rendered contract, retain raw output, and end both Drive paths without postflight, commit, acceptance inference, or contradicted-path retry; the task and `task_blocked` carry the worker’s non-empty notes or raw report verbatim, existing `partialMode` handling remains, and moved HEAD under `backend-commits` is identified as unverified commits.
- [ ] #2 The slice’s Prove clause is satisfied: both blocked forms are demonstrated; no postflight, commit, acceptance inference, or retry occurs; legacy and normalized terminal evidence agree; `partialMode` is unchanged; and a moved HEAD is recorded, with dirty paths recorded under `driver-commits` and `no-commit`.
- [ ] #3 The owned Files to Change (`lib/driver/types.ts`, `lib/driver/report-parser.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/durable-steps.ts`, `lib/driver/prompt-template.ts`, `lib/driver/README.md`) deliver Design §§2 and 4 and D-023 across parser, graph, legacy, durable, finalization, prompt-contract, and documentation consumers.
- [ ] #4 Ratified ground binds exactly: “INV-001 - The worker's record survives every Drive outcome. Drive never replaces text a worker wrote into a task; anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt.” “INV-002 - A blocked report is a question for a human, not a transient failure. When a worker reports `blocked`, Drive runs no postflight, spawns no automatic retry, and records the worker's reason verbatim as the block reason.” “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” “Ranking. INV-001 and INV-002 win over throughput: a lost note or a burned retry costs more than the minutes a retry might save.” Any collision is stop-and-escalate ground.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). Graph/legacy parity must be preserved without scheduler attempt, lease, or cancellation changes.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session; because the subagent completion protocol (slice 5) is not live in the host, this task's Description carries the standing AC-marking note, and the coordinator recovers worker notes from the worker transcript after any block.
- [ ] #7 D-030: for B-013, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
- [ ] #8 The rendered report contract no longer forbids `outcome: blocked`; it lists `blocked` as a human stop with no postflight or retry, and for `backend-commits` it tells the worker not to commit before a blocked stop (D-023); a rendered-prompt test shows the `blocked` entry for every backend name and the no-commit-before-blocked line under `backend-commits`, and fails on the pre-change template.
- [ ] #9 The blocked reason is appended once, by the task step only, under the `### Drive — outcome blocked — attempt <n> — run <runId>` heading with every pre-existing note byte unchanged on both paths; the graph blocked finalizer changes status only (D-022); prior-note byte preservation and exactly one blocked record per attempt on both paths are demonstrated.
<!-- AC:END -->
