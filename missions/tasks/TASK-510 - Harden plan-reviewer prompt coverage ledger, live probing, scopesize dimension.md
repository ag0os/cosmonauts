---
id: TASK-510
title: >-
  Harden plan-reviewer prompt: coverage ledger, live probing, scope/size
  dimension
status: Done
priority: high
labels:
  - 'plan:planning-system-hardening'
dependencies:
  - TASK-508
createdAt: '2026-07-28T17:21:48.778Z'
updatedAt: '2026-07-28T20:09:13.120Z'
---

<!-- AC:BEGIN -->
- [x] #1 plan-reviewer.md findings format requires a coverage ledger: every dimension with what was checked and findings or explicit none; unchecked dimensions declared unchecked (plan B-006)
- [x] #2 plan-reviewer.md instructs live read-only probing of wrapped external tools instead of trusting documentation (B-007)
- [x] #3 A scope/size review dimension applies the project's plan-size guidance and requires proposing split seams when exceeded (B-008)
- [x] #4 Content tests named in B-006..B-008 exist with exact markers; additions follow D-004 (additive, stack-agnostic, existing dimensions unrenamed)
<!-- AC:END -->
