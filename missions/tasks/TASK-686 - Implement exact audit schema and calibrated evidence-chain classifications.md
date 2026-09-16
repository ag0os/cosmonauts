---
id: TASK-686
title: Implement exact audit schema and calibrated evidence-chain classifications
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies: []
createdAt: '2026-09-16T18:34:03.359Z'
updatedAt: '2026-09-16T18:34:03.359Z'
---

## Description

Stage 1 — Schema/provenance.

Owned behaviors: **B-001** and **B-005** (and no others).

Implement the pure schema/provenance boundary at `scripts/test-health-audit/schema.ts` with executable proof in `tests/scripts/test-health-audit/schema.test.ts`. The spec’s INV-001/INV-002/INV-006, AC-001/AC-005/AC-006/AC-007/AC-009/AC-014, and ratified vocabulary/authority constraints are settled stop-and-escalate ground under the deviation protocol; they are not worker-adjustable. Keep IO, Vitest runtime integration, and production imports out of the schema module.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is proved at seam `scripts/test-health-audit/schema.ts` by `tests/scripts/test-health-audit/schema.test.ts` > `preserves seven dimensions all grounding forms and field-level assessment provenance without a score`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-001` near the executable test.
- [ ] #2 B-005 is proved across `scripts/test-health-audit/schema.ts` and profile classification fixtures by `tests/scripts/test-health-audit/schema.test.ts` > `classifies false-confidence chains without automatically demoting mocks mediation or focused units`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-005` near the executable test.
- [ ] #3 Validators accept only the spec’s exact seven dimension vocabularies, common evidence bases, reason classes, portfolio conclusions, dispositions, and legitimate SUT kinds; they reject collapsed/missing dimensions, scores, overall-health fields, universal per-test verdicts, invalid vocabulary, and unsupported SUT kinds.
- [ ] #4 Grounding and Realism remain independent and non-ranked, while every assessed value has field-level objective-observation or human-reviewed-judgment provenance; collectors cannot default human judgments and heuristic findings cannot become CI failures.
- [ ] #5 Absent or conflicting contract authority validates only as `unresolved`; no current implementation or test expectation becomes authority by default.
- [ ] #6 `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` are represented as audit evidence excluded from runtime guardrail claims with an `observational-memory-adoption` pointer, and neither is remediated by this work.
- [ ] #7 The pure schema module imports no IO, Vitest, census, artifact, probe, CLI, or production modules, and project-native correctness checks for its focused tests pass.
<!-- AC:END -->
