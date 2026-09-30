---
id: TASK-800
title: 'Slice 11: Harden Drive output, commit subjects, and environments'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-799
  - TASK-803
createdAt: '2026-09-29T16:47:38.074Z'
updatedAt: '2026-09-29T20:37:45.165Z'
---

## Description

Implementation Order slice 11. Owns B-010 from AC-016 and AC-018 and the remaining non-snapshot clauses of B-011 from AC-015 and AC-017. Design ownership: §8 Driver boundary hygiene. Governed by D-001, D-003, D-012, D-015, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, and `docs/orchestration.md` for safe summaries, project-command environment isolation, visible result paths, and one backend/mode rule.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §8: classify report summaries as usable, absent, or unsafe and send absent/unsafe values through task-title `commitSubject` fallback on both paths; scrub every `COSMONAUTS_DRIVER_*` key only from copied pre/postflight environments after backend resolution has read the parent environment; define one backend/mode sentence reused by schema and both validation errors before backend construction; include labeled workdir and event-log paths in successful print-mode text. Preserve slice 3’s unverified-commit reporting as the remaining B-011 blocked-report clause.

<!-- AC:BEGIN -->
- [x] #1 B-010 (source AC-016, AC-018) and the remaining B-011 clauses (source AC-015, AC-017) are delivered: successful `run_driver` text exposes labeled workdir and event-log paths; schema and both wrong-mode errors use the same sentence that `cosmonauts-subagent` is inline-only and `codex`/`claude-cli` are detached-only; source-commit subjects use safe prose or task-title fallback, never forbidden report forms; project pre/postflight receives no `COSMONAUTS_DRIVER_*` variables while backend selection still does; and blocked `backend-commits` HEAD movement remains recorded as an unverified range.
- [x] #2 The slice’s Prove clause is satisfied: safe prose remains a subject; every JSON fence, complete brace-delimited JSON, and report-outcome-line subject candidate falls back to the task title on both paths; backend construction still sees driver variables while project children do not; and schema plus both errors use identical backend/mode wording.
- [x] #3 The owned Files to Change (`lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, `docs/orchestration.md`) deliver Design §8 across both commit paths, process boundaries, validation, schema, errors, and visible print-mode output; synthetic report prose is never substituted for the title fallback.
- [x] #4 Ratified ground binds exactly: “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [x] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [x] #7 D-030: implementation notes contain separate red/green evidence rows for B-010 and the owned remaining clauses of B-011; for each owned behavior portion, one failing run before the change and one passing run after it are recorded with test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->

## Implementation Notes

D-030 B-010 red: `bun run test -- tests/extensions/orchestration-driver-detached.test.ts` at 17d6fb410ff242466bd2218e0f0c25c34808afbf, `preserves tool registration shape while accepting detached-capable parameters` lacked unified guidance; `routes detached codex runs to startDetached and returns handle details` lacked labeled workdir/eventLogPath. Green: `bun run test -- tests/extensions/orchestration-driver-detached.test.ts tests/extensions/orchestration-driver-tool.test.ts` at 17d6fb410ff242466bd2218e0f0c25c34808afbf, 25 tests passed (including both named cases and inline/detached wrong-mode checks).

D-030 B-011 owned clauses red: `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts` at 17d6fb410ff242466bd2218e0f0c25c34808afbf: 9 failures including `uses safe prose or task title for legacy/graph commit subject` (JSON fences, brace JSON, outcome markers, inferred prose became subjects) and `keeps driver metadata in backend but not legacy/graph project commands` (project commands saw COSMONAUTS_DRIVER_*). Green: same command at 17d6fb410ff242466bd2218e0f0c25c34808afbf: 65 passed; `bun run test -- tests/extensions/orchestration-driver-detached.test.ts`: 10 passed, backend binary override observed during backend construction. Existing `records a backend commit as unverified when its report blocks` (legacy) and `records moved HEAD as unverified on a graph blocked stop` (graph) passed in both runs.

Changed-scope audit against literal task-start SHA 17d6fb410ff242466bd2218e0f0c25c34808afbf: unbound (provider fallow, reason execution-not-consented); evidence unavailable, not a clean audit. B-010/B-011 rows above refer to pre-Drive-commit HEAD; Drive owns the commit after this run.

AC #1 verified: successful run_driver text exposes both paths; same backend/mode guidance across schema and validation; shared summary classifier and project-shell env scrub reach legacy and graph paths; existing blocked HEAD-range tests pass.

AC #2 verified: legacy and graph subject matrices cover safe prose, JSON fences, complete brace JSON, outcome marker; backend binary override test confirms backend construction retains driver metadata; project pre/postflight tests prove absence on both paths; mode text equality covered by schema and both mode-error tests.

AC #3 verified through shared runtime-helpers reportSummary/runShellCommand and drive-finalization commitSubject reached from both run-one-task and drive-scheduler-backend; no edits needed to those call sites because they already call shared helpers. Schema/validation/print output changed at extension; docs updated. Synthetic inferred report prose falls back to task title (existing legacy test expectation adjusted under AC-015).

AC #4 verified: no parser/report outcome change; INV-004 remains intact, including blocked handling and backend worker completion instructions. Mode rejection occurs before backend construction.

AC #5 verified via git diff/status: only owned source/docs, selected behavior tests, and task state; no durable-runtime, other-plan, suppression, baseline, threshold, ignore, config changes. Existing expectations changed only to remove AC-015 inferred-subject and AC-018 wrong-mode/visible output defects.

AC #6 verified from this one Drive run's envelope: backend cosmonauts-subagent, inline mode, print-mode cosmo session as supplied by run context; no second Drive run or external backend used.

AC #7 verified: separate D-030 B-010 and B-011 red/green rows above name commands, tests, literal precommit HEAD, one-line failure and passing counts. Final required gates: bun run test (292 files, 4082 tests), bun run lint, bun run typecheck, bun run check:reachability (214/214), bun run check:suppressions -- --base main all pass. Changed-scope analysis_audit unbound (execution-not-consented), recorded above.

Implementation complete; Drive owns source and task-state commits per driver-commits/final-state-commit run policy, so no git add/commit was run by the worker.