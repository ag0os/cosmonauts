---
id: TASK-691
title: C2 checkpoint — certify command-surface integrity evidence
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-690
createdAt: '2026-09-16T18:34:54.960Z'
updatedAt: '2026-09-16T18:34:54.960Z'
---

## Description

Stage 3 gate **C2**. Owned behaviors: **none**; B-002 remains solely owned by TASK-688.

This checkpoint enforces the suite-integrity prerequisite before inventory or any conclusion. Missing evidence is never clean. Bound correctness runs before bound artifact-conformance; mutation remains unbound.

<!-- AC:BEGIN -->
- [ ] #1 Quality Contract assertion 3 is satisfied with normal, real initial-watch, coverage, repeat, shuffle, and full-versus-isolation evidence for all three named known-flaky suites.
- [ ] #2 Every raw error, mismatch, unsupported construct, phase-unknown event, skip/todo/filter, conditional assertion candidate, flaky result, and assessment limitation has a visible state and a **recorded disposition** in `<epoch>/dispositions.json` — `accounted-for`, `limitation-accepted`, or `repair-required`, each with the assessing agent's reasoning and provenance (D-031). Writing these dispositions is this checkpoint's own work, not a downstream task's.
- [ ] #3 C2 cannot pass while any required run is missing, while any finding lacks a disposition, or while any `repair-required` disposition is open; a census that reaches `complete` because every finding is dispositioned is a valid pass, and a post-run policy exit is classified only under the D-025 evidence rule as amended.
- [ ] #4 Current-epoch census schema and freshness validation pass, and B-002 artifact-conformance still resolves to its exact referenced test and marker.
<!-- AC:END -->
