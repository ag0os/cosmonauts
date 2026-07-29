---
id: TASK-523
title: Bound provider concurrency and peak copies without losing evidence
status: To Do
priority: high
labels:
  - backend
  - performance
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.665Z'
updatedAt: '2026-07-29T18:36:32.665Z'
---

## Description

Remediate the non-conflicting portion of PR-003. Preserve ratified complete native evidence while preventing parallel full-project scans from multiplying without bound. Do not impose truncation or an output byte ceiling; SR-006's colliding output-limit proposal is decision-needed and excluded from this task.

<!-- AC:BEGIN -->
- [ ] #1 One session/provider has an explicit finite bound on concurrent analysis subprocesses.
- [ ] #2 Large successful payloads remain byte-for-byte complete in native evidence and stderr.
- [ ] #3 Peak duplicate representations are reduced with a non-lossy strategy, or resource inability becomes explicit failed-to-run rather than truncation/clean success.
- [ ] #4 Concurrency, cancellation, and queue cleanup have regression coverage.
<!-- AC:END -->
