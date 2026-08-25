---
id: TASK-579
title: Checkpoint A2 strict discovery and runtime composition as no-write data
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-578
createdAt: '2026-08-25T23:03:14.959Z'
updatedAt: '2026-08-25T23:03:14.959Z'
---

## Description

Implementation Order Checkpoint A2; dependency barrier with no B-### ownership. Verify B-011 support after A1 and before any sync mechanism work. This checkpoint verifies strict health/collision data and dependency direction only; it does not own D-016/D-017 or AC-006 and must not write owner roots, manifests, generated content, migration evidence, or live commands.

<!-- AC:BEGIN -->
- [ ] #1 Tolerant effective discovery and strict candidate discovery pass their plan-named tests without sharing deletion authority.
- [ ] #2 Strict source-health failures and all output/reserved-name collisions are observable data before any write-capable seam exists.
- [ ] #3 Nested/flat flattening and the one-bundle/five-reserved-name contract are verified without fragmenting the external bundle.
- [ ] #4 Runtime inventory composition remains outside `lib/harness-adapters/`, and inward dependency-direction checks find no runtime/CLI/skills/package/git edge in the core.
- [ ] #5 The checkpoint performs no sync/content migration and leaves project, personal, and live command targets byte-intact.
<!-- AC:END -->
