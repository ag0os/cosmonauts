---
id: TASK-695
title: K1 checkpoint — require every calibration control to pass
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-694
createdAt: '2026-09-16T18:35:38.086Z'
updatedAt: '2026-09-16T18:35:38.086Z'
---

## Description

Stage 5 gate **K1**. Owned behaviors: **none**; TASK-694 is the sole B-003 owner.

K1 is a hard stop before corpus profiling. Bound correctness and artifact-conformance must pass; generic mutation remains unbound, with only the plan’s later targeted probes eligible as evidence.

<!-- AC:BEGIN -->
- [ ] #1 K1 records every required N/X/P calibration ID as `pass` only when reviewed actual conclusions, bases, reasons, and portfolio effects match all predeclared obligations.
- [ ] #2 No missing row, counterexample, mismatch, stale method digest, or merely reviewed miss is accepted; any such result returns to stage 5 after an on-record amendment where allowed.
- [ ] #3 The passing calibration belongs to the current immutable-manifest epoch and B-003 artifact-conformance resolves to its exact test and marker.
- [ ] #4 The gate record keeps the mutation rung bindable/unbound and does not introduce generic CI mutation enforcement.
<!-- AC:END -->
