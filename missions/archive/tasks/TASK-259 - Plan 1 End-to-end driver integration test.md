---
id: TASK-259
title: 'Plan 1: End-to-end driver integration test'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-258
createdAt: '2026-05-04T17:34:20.943Z'
updatedAt: '2026-05-04T20:06:08.961Z'
---

## Description

Write the integration test suite that exercises the full driver pipeline end-to-end with a mock backend.

See **Implementation Order step 11**, `tests/extensions/orchestration-driver-tool.test.ts` in **Files to Change**, QC-002, QC-003, QC-004, QC-005 in `missions/plans/driver-primitives/plan.md`.

Use a stub/mock backend (not a real spawner) to drive a 2-task fixture plan through the full call path: `run_driver` → `runInline` → `runRunLoop` → `runOneTask` × 2.

<!-- AC:BEGIN -->
- [x] #1 Happy-path 2-task run: both tasks marked 'Done', JSONL event log contains run_started, two task_done events, and run_completed; tailEvents reads the log correctly.
- [x] #2 Pre-flight failure path: run_aborted emitted; no TaskManager status changes recorded.
- [x] #3 Branch-mismatch abort path: structured preflight(failed) event emitted before any status transition.
- [x] #4 Post-verify failure path: task marked 'Blocked' with implementationNotes; task_blocked + run_aborted emitted; no commit made.
- [x] #5 tests/extensions/orchestration-driver-tool.test.ts passes under bun run test --grep 'driver e2e'.
<!-- AC:END -->

## Implementation Notes

Attempt 1 failed (2026-05-04): worker reported success but tests/extensions/orchestration-driver-tool.test.ts was MISSING on disk. No file written. Re-spawn required.

Attempt 2 complete (2026-05-04): committed tests/extensions/orchestration-driver-tool.test.ts in e383904. Verified bun run test --grep "driver e2e", bun run typecheck, and bun run lint pass.
