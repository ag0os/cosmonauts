---
id: TASK-526
title: Guarantee native provider process evidence and complete-tree termination
status: To Do
priority: high
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.754Z'
updatedAt: '2026-07-29T18:36:32.754Z'
---

## Description

Remediate merged findings F-001, PR-001, SR-005. The package-manager shim and direct-child-only termination can normalize native analyzer signal death to code 0 and orphan descendants. Resolve the installed analyzer without PATH/global/npx, preserve native exit/signal evidence, and guarantee bounded process-tree cleanup cross-platform.

<!-- AC:BEGIN -->
- [ ] #1 Project-local Fallow execution targets a shell-free process boundary whose native signal cannot be reported as completed code 0.
- [ ] #2 Abort and timeout terminate the provider and all descendants within a fixed bound while preserving the initiating reason and output captured before termination.
- [ ] #3 Installed-provider tests cover crash, abort, timeout, descendant cleanup, and supported POSIX/Windows resolution without PATH, global binaries, or mutable fetch.
- [ ] #4 INV-3 failure classification and the existing successful real-engine flows remain intact.
<!-- AC:END -->
