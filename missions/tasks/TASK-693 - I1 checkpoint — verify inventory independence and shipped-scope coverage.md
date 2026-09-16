---
id: TASK-693
title: I1 checkpoint — verify inventory independence and shipped-scope coverage
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-692
createdAt: '2026-09-16T18:35:17.205Z'
updatedAt: '2026-09-16T18:35:17.205Z'
---

## Description

Stage 4 gate **I1**. Owned behaviors: **none**; TASK-692 is the sole B-006 owner.

This checkpoint independently verifies derivation provenance before calibration or profile joining. It applies bound correctness before bound artifact-conformance and does not treat missing map evidence as a clean result.

<!-- AC:BEGIN -->
- [ ] #1 I1 independently confirms that every inventory entry traces to cited non-test authority and that no test, behavior marker, coverage artifact, or census identity defined an entry.
- [ ] #2 Every enumerated shipped surface and authority group has a positive coverage statement or explicit unavailable/blocked evidence; missing architecture-map shards remain visible rather than clean.
- [ ] #3 Every entry has verifiable authority, consequence-based criticality, applicable boundary set, and path/caller/defect axes, and every judgment carries agent-assessed provenance (agent id, model identifier and version, consulted authorities).
- [ ] #4 The current epoch’s inventory and source-log digests are frozen and pass schema/freshness plus B-006 artifact-conformance checks.
<!-- AC:END -->
