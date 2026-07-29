---
id: TASK-508
title: Version review rounds in planner and plan-reviewer prompts
status: Done
priority: high
labels:
  - 'plan:planning-system-hardening'
dependencies: []
createdAt: '2026-07-28T17:21:48.774Z'
updatedAt: '2026-07-28T20:00:31.854Z'
---

<!-- AC:BEGIN -->
- [x] #1 plan-reviewer.md instructs writing findings to the lowest unused review-<n>.md, treating legacy review.md as round 1 when allocating, and forbids overwriting any existing round (plan B-009, decision D-002)
- [x] #2 planner.md revision pass reads every round, treats the latest as the revision driver, and cites findings round-qualified in decision entries (B-010)
- [x] #3 Content tests named in B-009 and B-010 exist with exact markers; prompt text stays stack-agnostic
<!-- AC:END -->
