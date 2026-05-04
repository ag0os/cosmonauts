---
id: TASK-259
title: 'Plan 1: End-to-end driver integration test'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-258
createdAt: '2026-05-04T17:34:20.943Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Write the integration test suite that exercises the full driver pipeline end-to-end with a mock backend.

See **Implementation Order step 11**, `tests/extensions/orchestration-driver-tool.test.ts` in **Files to Change**, QC-002, QC-003, QC-004, QC-005 in `missions/plans/driver-primitives/plan.md`.

Use a stub/mock backend (not a real spawner) to drive a 2-task fixture plan through the full call path: `run_driver` → `runInline` → `runRunLoop` → `runOneTask` × 2.

<!-- AC:BEGIN -->
- [ ] #1 Happy-path 2-task run: both tasks marked 'Done', JSONL event log contains run_started, two task_done events, and run_completed; tailEvents reads the log correctly.
- [ ] #2 Pre-flight failure path: run_aborted emitted; no TaskManager status changes recorded.
- [ ] #3 Branch-mismatch abort path: structured preflight(failed) event emitted before any status transition.
- [ ] #4 Post-verify failure path: task marked 'Blocked' with implementationNotes; task_blocked + run_aborted emitted; no commit made.
- [ ] #5 tests/extensions/orchestration-driver-tool.test.ts passes under bun run test --grep 'driver e2e'.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
