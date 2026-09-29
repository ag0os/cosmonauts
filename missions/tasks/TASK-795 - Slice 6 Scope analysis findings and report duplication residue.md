---
id: TASK-795
title: 'Slice 6: Scope analysis findings and report duplication residue'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-794
createdAt: '2026-09-29T16:45:36.693Z'
updatedAt: '2026-09-29T16:45:36.693Z'
---

## Description

Implementation Order slice 6. Owns B-005 from AC-008 and B-007 from AC-011. Design ownership: §5 Analysis scoping and the duplication-residue reuse contract. Governed by D-001, D-003, D-007, D-010, D-012, D-015, D-016, D-027, D-028, and D-030.

Files to Change owned by this slice: `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/drive/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, and `docs/fallow.md` for path scoping and residue guidance.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §5: advertise `paths` for complexity and duplication; run Fallow once at project scope; validate and reconcile the complete result before canonicalizing requested paths and filtering exact/descendant locations; exclude locationless rows, recompute only the scoped verdict, preserve coverage and the untouched native envelope, and bypass filtering for project scope. Reuse `analysis_duplication({ paths })` as the residue check and make authored skill guidance require a quotable surviving-group or empty result.

<!-- AC:BEGIN -->
- [ ] #1 B-005 (source AC-008) and B-007 (source AC-011) are both delivered: complexity and duplication advertise `paths`, return only exact or descendant located findings after one full project run, exclude locationless scoped findings, recompute the subset verdict while preserving coverage and native details, leave project scope unchanged, and provide duplication residue naming every owned surviving group or stating none, in a stable quotable form (the text bound for that output is delivered and proved by TASK-796, B-014); Drive and analysis skill guidance requires that residue for clone-extraction verdicts.
- [ ] #2 The slice’s Prove clause is satisfied for exact-file matches, directory descendants, non-matches, locationless exclusion, clone groups with one owned side, separator and dot-segment normalization, unchanged full-project results, and advertised `paths`; provider integrity is reconciled before scoped verdict recomputation and an unknown run is never labeled clean.
- [ ] #3 The owned Files to Change (`domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/skills/analysis/SKILL.md`, `domains/shared/skills/drive/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`) deliver Design §5’s scope filtering and D-010 residue reuse; no second duplication tool is introduced.
- [ ] #4 Ratified ground binds exactly: “INV-005 - Analysis results fit their consumer. A capability result honors the requested scope or reports the scope unsupported; it never silently widens. The text a tool returns to the model is bounded in size, with the full provider payload reachable without re-running the provider.” “Ranking. INV-005 wins over completeness: a bounded, scoped result beats a complete one; the complete inventory stays available through the result's details or a paths-scoped follow-up call.” A collision is stop-and-escalate ground under the deviation protocol.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: implementation notes contain separate red/green evidence rows for B-005 and B-007; for each behavior, one failing run before the change and one passing run after it are recorded with test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
