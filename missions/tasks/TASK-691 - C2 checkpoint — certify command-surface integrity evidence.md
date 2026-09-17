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
updatedAt: '2026-09-17T15:20:31.237Z'
---

## Description

Stage 3 gate **C2**. Owned behaviors: **none**; B-002 remains solely owned by TASK-688.

This checkpoint enforces the suite-integrity prerequisite before inventory or any conclusion. Missing evidence is never clean. Bound correctness runs before bound artifact-conformance; mutation remains unbound.

<!-- AC:BEGIN -->
- [ ] #1 Quality Contract assertion 3 is satisfied with normal, real initial-watch, coverage, repeat, shuffle, and full-versus-isolation evidence for all three named known-flaky suites.
- [ ] #2 Every raw error, mismatch, unsupported construct, phase-unknown event, skip/todo/filter, conditional assertion candidate, flaky result, and assessment limitation has a visible state and a **recorded disposition** in `<epoch>/dispositions.json` — `accounted-for`, `limitation-accepted`, or `repair-required`, each with the assessing agent's reasoning and provenance (D-031). Writing these dispositions is this checkpoint's own work, not a downstream task's.
- [ ] #3 C2 cannot pass while any required run is missing, while any finding lacks a disposition, or while any **`repair-required-tooling`** disposition is open. A `repair-required-suite` finding — a flaky test, an unestablishable error phase — does not block C2: it is recorded as a remediation-ledger candidate and explicit residual uncertainty, because stage 3 is the stage that discovers such defects and stage 8 is the stage that repairs them. A post-run policy exit is classified only under the D-025 evidence rule as amended.
- [ ] #4 Current-epoch census schema and freshness validation pass, and B-002 artifact-conformance still resolves to its exact referenced test and marker.
- [ ] #5 Every `limitation-accepted` disposition names the source the assessing agent actually opened and states what it found there; restating the collector's own message as the justification is rejected. Regression evidence: run 3 accepted nine `unsupported-syntax` findings as irreducible on the reasoning that they "use a variable parameter set", when eight were literal arrays wrapped in `satisfies`/`as const` and the agent had not opened the files.
<!-- AC:END -->

## Implementation Notes

task failed
