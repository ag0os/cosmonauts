---
id: TASK-507
title: >-
  Extend behavior-conformance checker: citations, pairing, markers, withdrawn,
  advisories
status: Done
priority: high
labels:
  - 'plan:planning-system-hardening'
dependencies: []
createdAt: '2026-07-28T17:21:48.769Z'
updatedAt: '2026-07-28T19:57:10.783Z'
---

<!-- AC:BEGIN -->
- [x] #1 New issue kinds land in lib/artifacts/behavior-conformance.ts: unresolved-decision-citation, undated-supersession, unpaired-behavior-file, duplicate-marker (plan B-011, B-012)
- [x] #2 ArtifactConformanceResult gains a non-blocking advisories array; behavior count beyond guidance is advisory, never an error (B-012)
- [x] #3 Behaviors whose heading matches the *(withdrawn ...)* grammar are excluded from required-field/test checks and reported as withdrawn (B-012)
- [x] #4 cli/plans/commands/check-artifacts.ts renders advisories and withdrawn counts in json, plain, and human formats (B-012)
- [x] #5 The live missions/plans/analysis-capabilities artifacts pass the extended checker with no new blocking issues (B-013)
- [x] #6 Tests named in B-011, B-012, B-013 exist with exact @cosmo-behavior markers; test, lint, and type-check steps pass
<!-- AC:END -->
