---
id: TASK-687
title: M1 checkpoint — certify schema and behavior-spine evidence
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-686
createdAt: '2026-09-16T18:34:14.556Z'
updatedAt: '2026-09-16T18:34:14.556Z'
---

## Description

Stage 1 gate **M1**. Owned behaviors: **none**; TASK-686 is the sole owner of B-001 and B-005.

This is a real dependency checkpoint, not an implementation owner. Apply the Quality Contract in order: bound `correctness`, then bound `artifact-conformance`; the generic `mutation` rung remains bindable/unbound and is not silently passed. If a ratified vocabulary, invariant, acceptance criterion, or marker contract collides with implementation reality, halt and escalate rather than weakening it.

<!-- AC:BEGIN -->
- [ ] #1 M1 records passing project-native correctness evidence for the schema tests and pure-validator boundary.
- [ ] #2 M1 records passing artifact-conformance for B-001 and B-005: each planned seam/test reference is root-relative and each exact `@cosmo-behavior plan:test-health-audit#B-00N` marker is present in its referenced executable test file.
- [ ] #3 Quality Contract assertion 1 is satisfied: fixtures reject collapsed or missing dimensions, invalid vocabulary, scores, unsupported SUT kinds, collector-defaulted reasoned judgment, and absent field provenance.
- [ ] #4 The `mutation` gate is recorded as bindable/unbound rather than passed or enforced generically; later targeted probes remain the plan-specific evidence path.
<!-- AC:END -->
