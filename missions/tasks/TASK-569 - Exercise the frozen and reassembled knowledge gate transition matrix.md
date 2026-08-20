---
id: TASK-569
title: Exercise the frozen and reassembled knowledge gate transition matrix
status: To Do
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - testing
  - 'plan:knowledge-surface'
dependencies: []
createdAt: '2026-08-20T18:15:54.973Z'
updatedAt: '2026-08-20T18:15:54.973Z'
---

## Description

Remediate merged findings F-006/I-002 from quality round 1. Existing B-008 evidence asserts fixture labels or retains an already-built params object rather than driving the real reload/plain-new/restart/agent-switch seams. Add behavior-focused regression coverage without changing the ratified D-017 frozen-session policy.

<!-- AC:BEGIN -->
- [ ] #1 B-008 tests execute real resource reload and plain-new seams for OFF→ON and ON→OFF edits and prove the existing session keeps its frozen factory selection.
- [ ] #2 B-008 tests execute restart/reassembly and `/agent` switch seams for both directions and prove the edited literal-true gate is adopted.
- [ ] #3 Assertions cover observable tool registration, context/provider effects, and knowledge-store construction or absence rather than transition labels alone.
- [ ] #4 Existing OFF baselines and the D-009 correction allowlist remain intact, and tests carry the existing B-008 behavior marker.
<!-- AC:END -->
