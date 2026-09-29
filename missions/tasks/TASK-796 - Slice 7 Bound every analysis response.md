---
id: TASK-796
title: 'Slice 7: Bound every analysis response'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-795
createdAt: '2026-09-29T16:45:54.644Z'
updatedAt: '2026-09-29T16:45:54.644Z'
---

## Description

Implementation Order slice 7. Owns B-014 from AC-009. Design ownership: §5 shared bounded analysis presentation and metric promotion. Governed by D-001, D-003, D-008, D-012, D-015, D-016, D-024, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/analysis/types.ts` for finding metric values, `domains/shared/extensions/project-tools/analysis-provider-error.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, and `docs/fallow.md` for the bounded-text contract.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §5: promote cyclomatic/cognitive/CRAP values into provider-neutral findings; route findings, trace, fix-preview, status, non-ready, and provider-error responses through one 32,768-byte UTF-8 renderer; place the fixed never-truncated capability/provider/scope/verdict/coverage/metric header before compact variant rows and deterministic omission text; preserve complete typed/native details without rerunning the provider. Update only pinned text-equals-details expectations that represent the AC-009 defect, citing AC-009 and D-024.

<!-- AC:BEGIN -->
- [ ] #1 B-014 (source AC-009): every `analysis_*` response, including provider failures, exposes model-facing text of at most 32,768 UTF-8 bytes with a never-truncated capability/provider/scope/verdict/coverage/metric header, compact variant-appropriate rows, no native payload, and deterministic omission or truncation text, while complete typed and native data remain in details without another provider run.
- [ ] #2 The slice’s Prove clause is satisfied: the header is always present; required finding columns and equivalent trace/fix-preview/status/non-ready rows appear; native text is absent; details stay complete; oversized rows and provider errors remain bounded; no code point is split; omission output is deterministic; and a paths-scoped `analysis_duplication` residue result is rendered within the bound and still names every surviving owned group or states none.
- [ ] #3 The owned Files to Change (`lib/analysis/types.ts`, `domains/shared/extensions/project-tools/analysis-provider-error.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`) deliver Design §5’s metric-neutral complete details and one shared bounded renderer.
- [ ] #4 Ratified ground binds exactly: “INV-005 - Analysis results fit their consumer. A capability result honors the requested scope or reports the scope unsupported; it never silently widens. The text a tool returns to the model is bounded in size, with the full provider payload reachable without re-running the provider.” “Ranking. INV-005 wins over completeness: a bounded, scoped result beats a complete one; the complete inventory stays available through the result's details or a paths-scoped follow-up call.” A collision is stop-and-escalate ground under the deviation protocol.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding. Under AC-020 and D-024, no test expectation changes except text-equals-details expectations that pinned the AC-009 defect, and each such change cites AC-009.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: for B-014, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
