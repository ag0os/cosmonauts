---
id: TASK-422
title: Produce shared/main leakage scan findings artifact
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-26T15:44:21.759Z'
updatedAt: '2026-06-29T18:23:17.665Z'
---

## Description

Run the planned scan-only shared/main leakage analysis and gate it with a test. This task owns B-019. Planned-behavior tests must include marker `@cosmo-behavior plan:coding-agnostic-framework#B-019` near the executable artifact validation test.

<!-- AC:BEGIN -->
- [x] #1 B-019 `leakage-findings.md` records the scan commands/patterns used over `domains/shared/**` for cosmo/main/coding-specific strings and agent refs.
- [x] #2 B-019 every leakage finding has path or pattern evidence, why it may leak, an allowed disposition, and an owner wave; zero findings are represented explicitly if applicable.
- [x] #3 B-019 artifact validation fails when any finding lacks a disposition.
- [x] #4 The scan remains report-only except for Wave-1 dependencies already covered by other behavior tasks.
<!-- AC:END -->
