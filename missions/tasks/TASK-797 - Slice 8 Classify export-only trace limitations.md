---
id: TASK-797
title: 'Slice 8: Classify export-only trace limitations'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-796
createdAt: '2026-09-29T16:46:11.118Z'
updatedAt: '2026-09-29T16:46:11.118Z'
---

## Description

Implementation Order slice 8. Owns B-006 from AC-010. Design ownership: §5 pre-execution provider classification for trace targets. Governed by D-001, D-003, D-009, D-012, D-015, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/analysis/types.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, and `docs/fallow.md` for provider-constraint classification and export-only guidance.

## Implementation Plan

Follow Design §5: add the provider-constraint unsupported-target resolution with a file suggestion; keep `execute` result-only and expose private `classifyRequest`; call classification after generic readiness and before provider execution; use the TypeScript compiler AST to confirm absence while recognizing direct, aliased, default, and supported CommonJS exports; let re-exports, unreadable sources, non-JS/TS files, and uncertainty continue through the normal provider path. Review authored skill/docs wording against the behavior rather than pinning prose sentences in tests.

<!-- AC:BEGIN -->
- [ ] #1 B-006 (source AC-010): `analysis_trace` returns a provider-constraint unsupported-target result before any Fallow run only when the adapter confirms a symbol is not exported, states that Fallow traces exports only, and suggests the file target; direct, aliased, default, and supported CommonJS exports, plus re-exported, unreadable, non-JS/TS, or indeterminate cases, proceed through the normal provider path; analysis guidance states the limitation.
- [ ] #2 The slice’s Prove clause is satisfied: direct, aliased, default, and CommonJS exports proceed; confirmed internals are unsupported without a provider spawn; and re-export, unreadable, other-language, and indeterminate cases proceed rather than receiving false certainty.
- [ ] #3 The owned Files to Change (`lib/analysis/types.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`) deliver Design §5’s discriminated provider constraint, private pre-execution classification seam, conservative AST check, and documented limit.
- [ ] #4 Ratified ground binds exactly: “INV-005 - Analysis results fit their consumer. A capability result honors the requested scope or reports the scope unsupported; it never silently widens. The text a tool returns to the model is bounded in size, with the full provider payload reachable without re-running the provider.” A collision is stop-and-escalate ground under the deviation protocol; classification pivots narrower rather than asserting unsupported on uncertainty.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020).
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: for B-006, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
