---
id: TASK-698
title: Join profiles into risk-proportionate portfolio evidence
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-697
createdAt: '2026-09-16T18:36:16.446Z'
updatedAt: '2026-09-18T00:48:58.335Z'
---

## Description

Stage 7a — Portfolio join.

Owned behavior: **B-007** (sole owner).

Join the frozen inventory and complete current profiles at every named boundary/path/caller/defect axis before probe execution. INV-003/INV-004/INV-005 and AC-008/AC-011 are settled ground: missing evidence remains a gap, portfolio conclusions use the exact ratified vocabulary, and local producer/fixture evidence cannot stand in for a required shipped consumer, adapter, persistence, event, alternate path, or composition root. Halt and escalate rather than weakening a critical protection requirement.

<!-- AC:BEGIN -->
- [x] #1 B-007 is proved at current-epoch `behavior-risk-matrix.md` and `gap-register.md` by `tests/scripts/test-health-audit/artifacts.test.ts` > `rejects protected portfolios with a missing risk-required boundary axis or probe`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-007` near the executable test.
- [x] #2 Every frozen inventory entry lists contributing profile IDs by applicable boundary/defect axis, probe references or requirements, explicit gaps/uncertainty, and exactly one ratified conclusion: `protected`, `partially-protected`, `unprotected`, or `unresolved`.
- [x] #3 A critical user-invokable portfolio cannot be `protected` from fixture-injected producer evidence alone when shipped consumer, adapter, persistence, event, alternate-path, caller, or composition-root failure remains possible.
- [x] #4 Path parity, caller enumeration, and distinct defect axes remain explicit; evidence for one path, caller, side, or axis never closes another by inference.
- [x] #5 Missing, blocked, reasoned-only where a probe is required, and otherwise unavailable evidence remains visible in both matrix and gap register and cannot be rendered clean or protected.
<!-- AC:END -->
