---
id: TASK-705
title: Evaluate baseline eligibility without self-ratification
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-704
createdAt: '2026-09-16T18:37:50.755Z'
updatedAt: '2026-09-16T18:37:50.755Z'
---

## Description

Stage 10 — Eligibility.

Owned behavior: **B-011** (sole owner).

Implement the eight-row baseline state machine over the committed candidate epoch. INV-007, AC-013, D-004/D-010/D-013/D-021 are settled stop-and-escalate ground: automation emits only `not established` or `eligible-for-ratification`; only the project owner can append the exact ratification block that permits `established`; every unresolved confirmed weakness must already have a human ruling. No score or overall-health field participates.

<!-- AC:BEGIN -->
- [ ] #1 B-011 is proved at current-epoch `baseline.md`, `scripts/test-health-audit/schema.ts`, and `artifacts.ts` by `tests/scripts/test-health-audit/artifacts.test.ts` > `accepts established only for eight met conditions and a non-circular exact owner ratification`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-011` near the executable test.
- [ ] #2 The state machine evaluates the spec’s exact eight conditions: complete census; dispositions for skips/todos/conditionals/quarantines/limitations; no counted test-local/misaligned/surviving-defect guardrail; protected critical portfolios; all weaknesses fixed/replaced/removed/excluded; required probes red then restored green; bounded documented noncritical uncertainty; and project-owner ratification.
- [ ] #3 Any failed/blocked row, critical unprotected/unresolved portfolio, unresolved confirmed weakness without ruling, changed material input, stale digest, or missing owner block yields `not established` with failing rows.
- [ ] #4 Conditions 1–7 met with current evidence and no owner block yield only `eligible-for-ratification`; automation cannot write `established`, accepted uncertainties, or an owner decision.
- [ ] #5 `established` validates only for a later project-owner block naming the already-committed evaluated revision, exact recomputed candidate digest, and exact accepted residual-uncertainty IDs; the excluded later block does not make the digest self-referential.
- [ ] #6 Quality Contract assertion 9 is enforced without a score, overall-health field, or implicit green-suite assent, and any material change opens a new epoch and makes the prior decision stale.
<!-- AC:END -->
