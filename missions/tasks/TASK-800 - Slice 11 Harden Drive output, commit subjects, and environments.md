---
id: TASK-800
title: 'Slice 11: Harden Drive output, commit subjects, and environments'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-799
  - TASK-803
createdAt: '2026-09-29T16:47:38.074Z'
updatedAt: '2026-09-29T19:57:22.033Z'
---

## Description

Implementation Order slice 11. Owns B-010 from AC-016 and AC-018 and the remaining non-snapshot clauses of B-011 from AC-015 and AC-017. Design ownership: §8 Driver boundary hygiene. Governed by D-001, D-003, D-012, D-015, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, and `docs/orchestration.md` for safe summaries, project-command environment isolation, visible result paths, and one backend/mode rule.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §8: classify report summaries as usable, absent, or unsafe and send absent/unsafe values through task-title `commitSubject` fallback on both paths; scrub every `COSMONAUTS_DRIVER_*` key only from copied pre/postflight environments after backend resolution has read the parent environment; define one backend/mode sentence reused by schema and both validation errors before backend construction; include labeled workdir and event-log paths in successful print-mode text. Preserve slice 3’s unverified-commit reporting as the remaining B-011 blocked-report clause.

<!-- AC:BEGIN -->
- [ ] #1 B-010 (source AC-016, AC-018) and the remaining B-011 clauses (source AC-015, AC-017) are delivered: successful `run_driver` text exposes labeled workdir and event-log paths; schema and both wrong-mode errors use the same sentence that `cosmonauts-subagent` is inline-only and `codex`/`claude-cli` are detached-only; source-commit subjects use safe prose or task-title fallback, never forbidden report forms; project pre/postflight receives no `COSMONAUTS_DRIVER_*` variables while backend selection still does; and blocked `backend-commits` HEAD movement remains recorded as an unverified range.
- [ ] #2 The slice’s Prove clause is satisfied: safe prose remains a subject; every JSON fence, complete brace-delimited JSON, and report-outcome-line subject candidate falls back to the task title on both paths; backend construction still sees driver variables while project children do not; and schema plus both errors use identical backend/mode wording.
- [ ] #3 The owned Files to Change (`lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, `docs/orchestration.md`) deliver Design §8 across both commit paths, process boundaries, validation, schema, errors, and visible print-mode output; synthetic report prose is never substituted for the title fallback.
- [ ] #4 Ratified ground binds exactly: “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: implementation notes contain separate red/green evidence rows for B-010 and the owned remaining clauses of B-011; for each owned behavior portion, one failing run before the change and one passing run after it are recorded with test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
