---
id: TASK-704
title: E1 checkpoint — certify complete current candidate evidence
status: To Do
priority: high
labels:
  - testing
  - devops
  - 'plan:test-health-audit'
dependencies:
  - TASK-703
createdAt: '2026-09-16T18:37:37.685Z'
updatedAt: '2026-09-16T18:37:37.685Z'
---

## Description

Stage 9 gate **E1**. Owned behaviors: **none**; TASK-703 is the sole B-010 owner.

E1 is the final evidence-package gate before eligibility. It runs the ordered Quality Contract: bound correctness, bound artifact-conformance, then explicit unbound mutation status with plan-recorded targeted evidence. Staleness, incomplete census, heuristic CI activation, or scope expansion is blocking.

<!-- AC:BEGIN -->
- [ ] #1 Bound correctness passes for project-native checks plus explicit-root schema, identity-set, freshness, ten-bundle, and canonical-digest validation on the final candidate epoch.
- [ ] #2 Bound artifact-conformance passes for the B-001…B-010 behavior entries implemented through stage 9: each root-relative referenced test exists and contains its exact `@cosmo-behavior plan:test-health-audit#B-0NN` marker.
- [ ] #3 The mutation row remains bindable/unbound with no generic enforcement; every required targeted probe instead has copied-graph expected-red/restored-green evidence or a visible uncounted limitation.
- [ ] #4 The candidate has a complete current census and profile set, all ten bundles, current material-input digests, bounded residual uncertainty, and no stale or duplicate evidence.
- [ ] #5 No recommendation activates heuristic CI enforcement, and no excluded provider expansion, static-health/coverage campaign, roadmap-feature implementation, or `project-health-audit` scope is present.
- [ ] #6 Project lint, type checking, and test correctness are clean with the full audit epoch written, without formatting or mutating immutable generated evidence.
<!-- AC:END -->
