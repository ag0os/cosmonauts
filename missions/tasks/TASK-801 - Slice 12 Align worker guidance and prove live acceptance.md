---
id: TASK-801
title: 'Slice 12: Align worker guidance and prove live acceptance'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-800
createdAt: '2026-09-29T16:48:39.815Z'
updatedAt: '2026-09-29T16:48:39.815Z'
---

## Description

Implementation Order slice 12. Owns B-015 from AC-002, AC-006, AC-012, and AC-014. Design ownership: §4 authored worker/report alignment and consistency review across §§1–8. B-012 and the coordinator-run closeout (Evidence table, AC-020 audit, live acceptance) are owned by TASK-802 (plan D-031), which is not dispatched through Drive. Governed by D-001, D-003, D-004, D-005, D-011, D-012, D-015, D-019, D-020, D-023, D-025, D-027, D-028, D-029, and D-030.

Files to Change owned by this slice: `bundled/coding/prompts/worker.md`, `lib/driver/prompt-template.ts` for final report-contract alignment, `lib/driver/README.md`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/drive/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`, and `docs/orchestration.md` for cross-surface consistency.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §4 and review the completed mechanisms from §§1–8 before authoring prose: align the worker persona and rendered report contract with append-only durable notes, the terminal blocked meaning, usable execution-probe zero evidence, destructive-Git refusal, and snapshot recovery. Review authored prose semantically rather than asserting its sentences.

<!-- AC:BEGIN -->
- [ ] #1 B-015 (source AC-002, AC-006, AC-012, AC-014): the rendered Drive prompt and coding worker persona tell workers that durable notes go through `task_edit` or CLI append rather than response prose; `outcome: blocked` is a human stop with no postflight or retry; an unreached-site block requires a quoted usable-zero `execution_probe` result; destructive Git is refused and prior work is recoverable from the snapshot ref; and the report contract lists `blocked` with that meaning.
- [ ] #2 The owned Files to Change (`bundled/coding/prompts/worker.md`, `lib/driver/prompt-template.ts`, `lib/driver/README.md`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/drive/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`, `docs/orchestration.md`) are reviewed and aligned with Design §§1–8; authored prose is verified by review against B-015 rather than sentence assertions.
- [ ] #3 The worker records in this task's implementation notes, for the closeout task TASK-802, the exact prompt-template and persona lines that carry each B-015 clause, so the coordinator can verify them by diff; this task creates no throwaway task, launches no Drive run, and does not edit `missions/plans/driver-hardening/plan.md`.
- [ ] #4 The worker persona additionally states the D-023 rule for `backend-commits` workers (do not commit before a `blocked` stop) and names the snapshot ref location `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` as where a previous attempt's work is recoverable.
- [ ] #5 Ratified ground binds exactly: “INV-001 - The worker's record survives every Drive outcome. Drive never replaces text a worker wrote into a task; anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt.” “INV-002 - A blocked report is a question for a human, not a transient failure. When a worker reports `blocked`, Drive runs no postflight, spawns no automatic retry, and records the worker's reason verbatim as the block reason.” “INV-003 - Every re-spawn is announced. Before Drive runs a worker again for the same task inside one run, it emits an event that names the trigger. Nothing re-spawns silently.” “INV-004 - The protocol and the parser agree, for every backend. Every outcome word the rendered prompt allows is parsed, every parsed outcome has one documented Drive consequence, and a rule that governs completion (such as marking acceptance criteria) reaches every backend in a form that backend can act on.” “INV-005 - Analysis results fit their consumer. A capability result honors the requested scope or reports the scope unsupported; it never silently widens. The text a tool returns to the model is bounded in size, with the full provider payload reachable without re-running the provider.” “INV-006 - Task state and the worktree change only through validated paths. Worker-supplied task fields are validated before they reach task files, and a worker cannot discard uncommitted work left by a previous attempt.” “Ranking. INV-001 and INV-002 win over throughput: a lost note or a burned retry costs more than the minutes a retry might save. INV-005 wins over completeness: a bounded, scoped result beats a complete one; the complete inventory stays available through the result's details or a paths-scoped follow-up call. INV-006 wins over worker autonomy: a guard that refuses a destructive git command is preferred to a prompt rule the worker may ignore.” Any collision is stop-and-escalate ground.
- [ ] #6 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). D-028 requires this slice to use a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: for B-015, implementation notes record one failing run before the change (the rendered report contract or persona lacking a clause) and one passing run after it, with test name and commit, a one-line failure on the failing row, and the successful result on the passing row; B-015’s authored wording is additionally verified by reviewed diff, not prose sentence assertions.
<!-- AC:END -->
