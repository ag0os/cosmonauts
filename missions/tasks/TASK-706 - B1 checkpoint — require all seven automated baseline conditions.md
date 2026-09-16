---
id: TASK-706
title: B1 checkpoint — require all seven automated baseline conditions
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-705
createdAt: '2026-09-16T18:37:59.779Z'
updatedAt: '2026-09-16T18:37:59.779Z'
---

## Description

Stage 10 gate **B1**. Owned behaviors: **none**; TASK-705 is the sole B-011 owner.

B1 is the automation boundary. It may certify only eligibility for human ratification, never establishment. Every failed row returns to its owning stage; unresolved confirmed weaknesses have no accepted-uncertainty bypass.

<!-- AC:BEGIN -->
- [ ] #1 Baseline conditions 1–7 are each `met` against the committed, current candidate epoch; any `not-met` or `blocked` row returns to its owning stage rather than being waived.
- [ ] #2 Every confirmed weakness is fixed, replaced, removed, or excluded after required human authority rulings, and every critical portfolio is `protected` with required probe evidence counted correctly.
- [ ] #3 Remaining uncertainty is demonstrably noncritical, bounded, documented, and listed for owner review; it does not include an unresolved confirmed weakness.
- [ ] #4 The candidate revision and canonical digest recompute exactly, and full-spine artifact-conformance for B-001…B-011 passes (including B-011 correctness) while generic mutation remains unbound.
- [ ] #5 B1 emits `eligible-for-ratification` and still records `not established`; no automation-created owner block, accepted-uncertainty decision, score, or overall-health verdict exists.
<!-- AC:END -->
