---
id: TASK-351
title: Run durable backend step model quality gates
status: To Do
priority: medium
labels:
  - testing
  - devops
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-350
createdAt: '2026-06-04T02:51:14.911Z'
updatedAt: '2026-06-04T02:51:14.911Z'
---

## Description

Implementation Order step 8 for durable-backend-step-model. Execute the plan's Quality Contract after all behavior implementation tasks are complete. This task owns verification that every planned behavior test has its required `@cosmo-behavior plan:durable-backend-step-model#B-###` marker and that no Plan-2 scope boundary is violated.

<!-- AC:BEGIN -->
- [ ] #1 B-001 through B-003 named tests pass with exact behavior markers: `tests/durable-runtime/backend-contracts.test.ts` > `defines generic backend and attempt contracts without Drive dependencies`, `tests/driver/backends/orchestration-adapter.test.ts` > `starts wrapped Drive backends with unchanged invocations and pinned capabilities`, and `tests/durable-runtime/file-store.test.ts` > `persists step attempts and results without erasing previous attempts`.
- [ ] #2 B-004 through B-006 named tests pass with exact behavior markers: `tests/driver/driver-durable-steps.test.ts` > `writes Drive task step records with configured backend identity and resume-safe dependencies`, `tests/driver/durable-steps.test.ts` > `appends a new attempt when Drive retries a task`, and `tests/driver/driver-durable-steps.test.ts` > `records malformed reports as completed unknown in step records and normalized events`.
- [ ] #3 B-007 through B-009 named tests pass with exact behavior markers: `tests/driver/durable-finalizers.test.ts` > `projects Drive finalization phases into generic finalizer step records`, `tests/driver/durable-finalizers.test.ts` > `records finalization_failed as a retryable finalizer step without failing the task step`, and `tests/cli/drive/run.test.ts` > `resume records source task-status and state-commit finalizer retry failures as attempts`.
- [ ] #4 B-010 and B-011 named tests pass with exact behavior markers: `tests/driver/driver-durable-steps.test.ts` > `continues Drive run when durable step persistence fails` and `tests/driver/driver-durable-steps.test.ts` > `keeps legacy observation outputs unchanged when step records exist`.
- [ ] #5 The repository correctness gates identified in the plan pass for the completed implementation: targeted behavior tests first, then the configured project test, lint, and typecheck checks.
- [ ] #6 Boundary and scope conformance for Plan 2 is verified: `lib/durable-runtime/*` remains Drive/CLI/domain/task/prompt/backend-implementation free, backend identity types live only in `lib/durable-runtime/types.ts`, Drive adapters/projectors stay under `lib/driver/*`, and no scheduler loop, graph compiler, chain migration, broad parallelism, worktree merge finalizer, mutating runtime control, or CLI output-field expansion is introduced.
<!-- AC:END -->
