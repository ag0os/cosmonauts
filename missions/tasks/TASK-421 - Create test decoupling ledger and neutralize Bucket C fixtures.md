---
id: TASK-421
title: Create test decoupling ledger and neutralize Bucket C fixtures
status: Done
priority: medium
labels:
  - testing
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-418
  - TASK-419
  - TASK-420
createdAt: '2026-06-26T15:44:16.727Z'
updatedAt: '2026-06-29T18:18:39.058Z'
---

## Description

Generate the test-decoupling ledger from fresh coding-reference searches, rename Bucket C placeholder domain ids to neutral ids, and complete final ledger validation for B-017 and B-024. This task owns B-018 and the ledger-validation portions of B-017 and B-024. Planned-behavior tests must include markers near executable ledger tests for `@cosmo-behavior plan:coding-agnostic-framework#B-017`, `#B-018`, and `#B-024` where each behavior is proved.

<!-- AC:BEGIN -->
- [x] #1 B-018 Bucket C tests use neutral placeholder ids such as `alpha`, `beta`, or `test-domain` instead of `coding`.
- [x] #2 B-017/B-018/B-024 every remaining `coding` test/helper reference, including Bucket B and package/catalog references, is covered by `test-decoupling-ledger.md` with an allowed disposition or keep rationale.
- [x] #3 Ledger validation fails on unclassified `coding` references, including this wave's newly added tests/helpers.
- [x] #4 Ledger validation asserts Bucket A files still reference real `bundled/coding` so accidental Wave-1 repoints are caught.
- [x] #5 Post-rename targeted type/lint/test surfaces pass for renamed fixtures and do not leave unused or inconsistent fixture ids.
<!-- AC:END -->
