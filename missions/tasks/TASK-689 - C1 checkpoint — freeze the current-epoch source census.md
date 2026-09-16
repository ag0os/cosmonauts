---
id: TASK-689
title: C1 checkpoint — freeze the current-epoch source census
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-688
createdAt: '2026-09-16T18:34:36.682Z'
updatedAt: '2026-09-16T18:34:36.682Z'
---

## Description

Stage 2 gate **C1**. Owned behaviors: **none**; TASK-688 is the sole B-002 owner.

This checkpoint materializes the source side of the current epoch before any health conclusion. It applies bound correctness before bound artifact-conformance; mutation remains unbound. The census is re-derived for each epoch and is never treated as a once-pinned universe.

<!-- AC:BEGIN -->
- [ ] #1 C1 records a current-epoch source census covering all current `tests/**/*.test.ts` declarations, parameterized case expectations, source spans, and explicit unsupported/dynamic-registration limitations, without issuing a health or clean conclusion.
- [ ] #2 The current epoch index/immutable manifest and raw source evidence are valid at the explicit audit root, and a missing or stale census digest prevents unit preparation.
- [ ] #3 `docs/test-health-audit.md` v1 is available to stage-4-and-later reviewers with the explicit-root interface, assessment rubric, consent boundary, and rerun rules, while `package.json` remains unchanged.
- [ ] #4 Bound correctness and B-002 artifact-conformance evidence pass at this revision; the mutation rung remains explicitly unbound and not generically enforced.
<!-- AC:END -->
