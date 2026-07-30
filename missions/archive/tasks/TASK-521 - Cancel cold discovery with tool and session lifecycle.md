---
id: TASK-521
title: Cancel cold discovery with tool and session lifecycle
status: Done
priority: high
labels:
  - backend
  - performance
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.609Z'
updatedAt: '2026-07-29T19:03:23.130Z'
---

## Description

Remediate PR-002. First-use tools currently await uncancellable version/config discovery, and session shutdown only drops the promise. Add explicit ownership/cancellation for in-flight discovery while preserving shared snapshot semantics.

<!-- AC:BEGIN -->
- [x] #1 Cancelling a first-use tool while version or config introspection runs terminates that subprocess within the bounded grace period.
- [x] #2 Session reset/shutdown cancels obsolete discovery without leaving a child, timer, or stale snapshot completion.
- [x] #3 Concurrent callers still share one valid discovery execution, and one caller's cancellation does not abort discovery still required by another active caller.
- [x] #4 Aborted discovery is surfaced as failure/withheld as appropriate and never as a clean result.
<!-- AC:END -->
