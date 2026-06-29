---
id: TASK-424
title: Run final coding-agnostic Wave 1 gates and handoff checks
status: To Do
priority: medium
labels:
  - testing
  - devops
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-412
  - TASK-413
  - TASK-414
  - TASK-416
  - TASK-421
  - TASK-422
  - TASK-423
createdAt: '2026-06-26T15:44:38.876Z'
updatedAt: '2026-06-26T15:44:38.876Z'
---

## Description

Complete the plan-level verification after implementation tasks land. This task does not own a new B-### behavior, but it covers the plan's full-gate and handoff requirements, including AC-006 and final explicit-coding regression evidence.

<!-- AC:BEGIN -->
- [ ] #1 Project-native correctness, typecheck, lint, and static/source-grep gates pass with `coding` still bundled.
- [ ] #2 The final source-grep gate reports zero framework `coding` domain-default matches in `lib/` and `cli/` while preserving documented carve-outs.
- [ ] #3 The post-implementation test-decoupling ledger is regenerated from a fresh coding-reference search and its validation test passes.
- [ ] #4 Explicit `coding/*` agents, chains, dump-prompt, and Drive-related flows have observable regression evidence showing existing coding behavior remains unchanged.
- [ ] #5 No Wave-2 physical-extraction scope leaks into the completed work, including no production catalog-source flip, `bundled/` removal, package-files change, or import-rewrite work.
<!-- AC:END -->
