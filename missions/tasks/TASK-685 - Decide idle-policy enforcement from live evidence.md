---
id: TASK-685
title: Decide idle-policy enforcement from live evidence
status: To Do
priority: high
assignee: human
labels:
  - manual
  - review
  - 'plan:execution-liveness'
dependencies:
  - TASK-681
createdAt: '2026-09-13T04:02:33.646Z'
updatedAt: '2026-09-13T04:02:33.646Z'
---

## Description

Human enablement checkpoint after the Quality Manager proof. Review live post-instrumentation shadow evidence by backend population, then explicitly enable, revise, or defer idle enforcement. This governance task is not Drive-able and does not silently change runtime defaults.

<!-- AC:BEGIN -->
- [ ] #1 Live post-B-009 evidence covers each backend population proposed for enforcement and distinguishes useful activity from corpus gaps that could only over-count idleness.
- [ ] #2 The human records an enable, revise, or defer decision with per-backend idle values, exclusions, rationale, and rollback criteria.
- [ ] #3 Any approved enforcement change is applied through declared policy and documented; absent approval, shadow remains the default.
<!-- AC:END -->
