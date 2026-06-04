---
id: TASK-344
title: Update durable runtime backend and attempt contracts
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies: []
createdAt: '2026-06-04T02:50:11.661Z'
updatedAt: '2026-06-04T02:57:51.327Z'
---

## Description

Implementation Order step 1 for durable-backend-step-model. Update the generic durable runtime contracts and file-backed attempt persistence before any Drive-specific adapter/projector work. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-001` and `@cosmo-behavior plan:durable-backend-step-model#B-003` near the executable tests named in the plan.

<!-- AC:BEGIN -->
- [x] #1 B-001 is satisfied by `tests/durable-runtime/backend-contracts.test.ts` > `defines generic backend and attempt contracts without Drive dependencies`, including runtime-owned backend/attempt contracts, public exports, Drive-free runtime imports, extended StepRecord fields, RunStore attempt methods, known wave-1 backend names, and `unknown` as compatibility-only policy value.
- [x] #2 B-003 is satisfied by `tests/durable-runtime/file-store.test.ts` > `persists step attempts and results without erasing previous attempts`, including stable multiple-attempt storage under step-owned attempt directories, readable ordered attempts, terminal result evidence, optional output evidence, and unsafe attempt ID rejection.
- [x] #3 Existing durable-runtime store tests and fixtures remain compatible with the extended generic StepRecord shape while preserving the Plan-1 file-backed run/event behavior.
<!-- AC:END -->
