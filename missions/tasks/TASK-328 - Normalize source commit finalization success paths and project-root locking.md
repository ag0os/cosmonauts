---
id: TASK-328
title: Normalize source commit finalization success paths and project-root locking
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-326
createdAt: '2026-05-22T19:57:27.454Z'
updatedAt: '2026-05-26T15:17:59.199Z'
---

## Description

Make successful driver-owned source commit finalization explicit, safe, and consistently locked across CLI and `run_driver` paths. Owns B-001, B-012, B-016, and B-017 from source AC-001, AC-009, AC-010, AC-013, AC-014, AC-018. Seams: `lib/driver/run-one-task.ts`, `lib/driver/driver.ts`, `lib/driver/lock.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, `domains/shared/extensions/orchestration/watch-events-tool.ts`. Named tests: `tests/driver/run-one-task.test.ts` > `emits commit and task-status finalization phase events on successful driver commit`; `driver commit exclusion uses repo lock excludes missions and memory and emits sha`; `uses task title as driver commit subject when report summary is generic`; `emits explicit no-change commit finalization evidence for verification-only tasks`; and `tests/extensions/orchestration-driver-tool.test.ts` > `run_driver uses the project root for repository commit locking`. Tests must carry markers for B-001, B-012, B-016, and B-017.

<!-- AC:BEGIN -->
- [x] #1 B-001: Successful driver-owned source commit or explicit no-change source finalization emits additive commit and task-status `finalize` phase events while preserving existing success events.
- [x] #2 B-012: CLI and `run_driver` source commit paths acquire the repository commit lock from `spec.projectRoot`, and regression coverage proves `.cosmonauts/*.lock`, `missions/**`, and `memory/**` remain outside source commit scope.
- [x] #3 B-016: Driver-owned source commit subjects fall back to the task title when backend output is missing, generic, or would produce `TASK-###: driver task update`.
- [x] #4 B-017: Verification-only structured-success tasks with no source changes emit explicit no-change source-commit finalization evidence, do not emit `commit_made`, and can still complete task-status finalization normally.
- [x] #5 Existing source commit behavior remains unchanged except for additive phase events, safer locking, title fallback, and explicit no-change evidence.
<!-- AC:END -->

## Implementation Notes

Prior implementation verified/finalized. Confirmed commit 783a809 contains source commit finalization events, project-root repo locking, task-title subject fallback, and explicit no-change evidence with exact behavior markers for B-001, B-012, B-016, and B-017. Verification run: targeted Vitest tests for the named TASK-328 cases passed; full `bun run test`, `bun run lint`, and `bun run typecheck` passed.
