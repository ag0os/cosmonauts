---
id: TASK-571
title: Measure complete architecture I/O and regenerate D-025 evidence
status: Done
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - performance
  - testing
  - 'plan:knowledge-surface'
dependencies: []
createdAt: '2026-08-20T18:15:55.005Z'
updatedAt: '2026-08-20T21:51:18.811Z'
---

## Description

Remediate merged findings F-002/PRF-002 and F-003/PRF-001 from quality round 1. Architecture retrieval currently reports output-record counts instead of actual recurring config/freshness/map I/O, and the Stage-6 artifact measures a custom knowledge-only coding/worker composition rather than the production-authorized worker. Implement test-first and preserve the ratified disk-authoritative O(N) design: caching, embeddings, and broader refactors are out of scope.

<!-- AC:BEGIN -->
- [x] #1 B-007 scan details account for actual recurring architecture config, freshness/source-tree, and map-file work rather than deriving disk statistics from returned records.
- [x] #2 Real-store regression tests prove architecture and combined-context statistics cover index, missing/unknown-module, and multi-file freshness cases without counting synthetic rendered bytes as disk bytes.
- [x] #3 D-025 evidence is regenerated from 20 turns assembled through production `buildSessionParams` for the shipped worker, including its architecture authorization and complete combined-handler I/O.
- [x] #4 The regenerated artifact records raw rows, eligible corpus inputs, thresholds, and a truthful pass/amend verdict; a threshold breach remains blocking.
- [x] #5 Changes are the narrowest correction for the flagged telemetry/evidence locations and do not add caching, embeddings, or excluded behavior.
<!-- AC:END -->
