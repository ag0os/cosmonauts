---
id: TASK-794
title: 'Slice 5: Render completion instructions for every backend'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-793
createdAt: '2026-09-29T16:45:17.494Z'
updatedAt: '2026-09-29T16:45:17.494Z'
---

## Description

Implementation Order slice 5. Owns B-004 from AC-007. Design ownership: §4 Prompt composition, limited to the machine-routed per-backend completion protocol. Governed by D-001, D-003, D-012, D-015, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/driver/prompt-template.ts` for all-backend criterion-marking instructions.

## Implementation Plan

Follow Design §4: render a completion section whenever a task has acceptance criteria; route in-process workers to `task_edit` with `checkAc` and external `codex`/`claude-cli` workers to the task CLI; preserve the existing post-report check that blocks success while criteria remain unchecked. Test prompt routing as a contract while leaving authored persona wording to slice 12 review.

<!-- AC:BEGIN -->
- [ ] #1 B-004 (source AC-007): a task with acceptance criteria renders an actionable completion section for every supported backend, using `task_edit`/`checkAc` for `cosmonauts-subagent` and the task CLI for `codex` and `claude-cli`; a success report with unchecked criteria remains blocked.
- [ ] #2 The slice’s Prove clause is satisfied: rendered prompts for `cosmonauts-subagent`, `codex`, and `claude-cli` each contain the correct mechanism-specific instruction, the pre-change `cosmonauts-subagent` case is shown failing, and unchecked-success blocking still holds.
- [ ] #3 The owned Files to Change entry `lib/driver/prompt-template.ts` delivers Design §4’s per-backend completion-protocol routing without taking ownership of slice 12’s authored persona prose.
- [ ] #4 Ratified ground binds exactly: “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” A collision is stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from the fresh print-mode cosmo session established by slice 4’s checkpoint.
- [ ] #7 D-030: for B-004, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
