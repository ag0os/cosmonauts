---
id: TASK-509
title: >-
  Harden planner prompt: consistency pass, state-space rule, size checkpoint,
  provability rule, trust line
status: Done
priority: high
labels:
  - 'plan:planning-system-hardening'
dependencies:
  - TASK-508
createdAt: '2026-07-28T17:21:48.776Z'
updatedAt: '2026-07-28T20:05:34.711Z'
---

<!-- AC:BEGIN -->
- [x] #1 planner.md gains a closing consistency pass over decisions vs design/behaviors and stage ordering (plan B-001)
- [x] #2 planner.md requires state-space enumeration with no implementer-decided cells for state/binding designs (B-002)
- [x] #3 planner.md enforces the size checkpoint: slice boundaries or recorded justification past guidance; prose acknowledgement named insufficient (B-003)
- [x] #4 planner.md requires Expected clauses provable by the named test; content-test behaviors state text obligations (B-004)
- [x] #5 planner.md design checklist names trust boundary and consent gate for project-controlled execution (B-005)
- [x] #6 Content tests named in B-001..B-005 exist with exact markers; additions follow D-004 (additive, stack-agnostic)
<!-- AC:END -->
