---
id: TASK-252
title: 'Plan 1: EventSink, JSONL audit log, and bus bridge'
status: To Do
priority: high
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:32:49.706Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Implement `lib/driver/event-stream.ts` and `tests/driver/event-stream.test.ts`.

See **Implementation Order step 4**, **D-P1-9**, **D-P1-10**, **Bus event mapping**, **D-P1-13**, **Files to Change** in `missions/plans/driver-primitives/plan.md`.

Cross-plan invariants encoded here:
- EventSink MUST write JSONL first (awaited `appendFile`) then publish to bus — order is contractual.
- `driver_activity` bus type is DISTINCT from `"spawn_activity"`. The existing subscriber at `domains/shared/extensions/orchestration/index.ts:105-126` expects `SpawnActivityEvent` shape (`spawnId`, `role`). Driver events use `type: "driver_activity"` and `type: "driver_event"` — do NOT use `"spawn_activity"`.
- `appendFile` failure throws `EventLogWriteError`; caller (`runRunLoop`) catches it and aborts.

<!-- AC:BEGIN -->
- [ ] #1 createEventSink({ logPath, runId, parentSessionId, activityBus }): EventSink is exported; returned function awaits appendFile (JSONL write) before calling activityBus.publish.
- [ ] #2 appendFile failure throws EventLogWriteError (custom error class exported from this module).
- [ ] #3 shouldBridge whitelist covers: driver_activity, preflight:failed, task_done, task_blocked, commit_made, lock_warning, run_completed, run_aborted. Non-whitelisted events go to JSONL only.
- [ ] #4 toBusEvent maps DriverEvent{type:'driver_activity'} → bus event {type:'driver_activity'}; all other bridged events → {type:'driver_event'}. Neither ever emits 'spawn_activity'.
- [ ] #5 tailEvents(path, since): Promise<{events, cursor}> skips malformed JSON lines (logs to stderr, advances cursor); returns empty events with same cursor when cursor is beyond EOF.
- [ ] #6 tests/driver/event-stream.test.ts verifies JSONL write precedes bus publish, distinct bus types (no spawn_activity), tailEvents cursor, malformed-line skip, and EOF handling; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
