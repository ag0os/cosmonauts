---
id: TASK-527
title: Honor requested complexity metrics end to end
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.783Z'
updatedAt: '2026-07-29T20:17:43.150Z'
---

## Description

Remediate merged findings UR-001, I-001, and F-003. The adapter currently ignores the requested metric, returns all complexity findings, and can fail cyclomatic from CRAP-only evidence.

<!-- AC:BEGIN -->
- [x] #1 Cyclomatic, cognitive, and CRAP requests normalize only findings applicable to the requested metric and derive verdict from that metric-specific set.
- [x] #2 The completed result exposes the requested metric while preserving the complete unfiltered native provider payload.
- [x] #3 Mixed-envelope tests prove one metric cannot be failed by violations exclusive to another metric.
- [x] #4 Unsupported metrics still degrade before provider invocation.
<!-- AC:END -->
