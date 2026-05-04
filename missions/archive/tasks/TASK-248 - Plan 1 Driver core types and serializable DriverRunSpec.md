---
id: TASK-248
title: 'Plan 1: Driver core types and serializable DriverRunSpec'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies: []
createdAt: '2026-05-04T17:30:43.196Z'
updatedAt: '2026-05-04T17:41:01.164Z'
---

## Description

Create `lib/driver/types.ts` and `lib/driver/backends/types.ts` with the full type contracts. These files are the foundation for every other Plan 1 module.

See **Implementation Order step 1**, **Design > Key contracts**, **D-P1-1**, **D-P1-15**, **D-P1-16** in `missions/plans/driver-primitives/plan.md`.

Cross-plan invariants embedded here:
- `DriverRunSpec` must be **serializable** (no Backend instance; `backendName` string literal union) and MUST include `runId`, `parentSessionId`, `projectRoot` — Plan 3's binary deserializes this exact shape from `spec.json`.
- `DriverEvent.driver_activity` uses `type: "driver_activity"` (NOT `"spawn_activity"`) — distinct from existing `SpawnActivityEvent`.
- `verify` event status includes `"started"` (not just `"passed"|"failed"`).
- `spawn_completed.report` types as `ParsedReport` (not `Report`) to admit the `{ outcome: "unknown"; raw }` path.
- `lock_warning` event variant must exist in the union.
- `BackendInvocation` includes `runId: string` (required for backends to tag emitted events with `DriverEventBase.runId`).

<!-- AC:BEGIN -->
- [x] #1 lib/driver/types.ts exports DriverRunSpec with fields: runId, parentSessionId, projectRoot, planSlug, taskIds, backendName (string literal union, no Backend instance), promptTemplate, preflightCommands, postflightCommands, branch?, commitPolicy, partialMode?, workdir, eventLogPath, taskTimeoutMs?.
- [x] #2 DriverEvent union includes all variants from the plan: run_started, task_started, preflight (status 'started'|'passed'|'failed'), spawn_started, driver_activity (type: 'driver_activity' NOT 'spawn_activity'), spawn_completed (report: ParsedReport), spawn_failed, verify (status: 'started'|'passed'|'failed'), commit_made, task_done, task_blocked, lock_warning, run_completed, run_aborted.
- [x] #3 DriverEventBase interface requires runId: string, parentSessionId: string, timestamp: string on every event variant.
- [x] #4 lib/driver/backends/types.ts exports Backend, BackendCapabilities, BackendInvocation (with runId: string), BackendRunResult.
- [x] #5 EventSink, DriverHandle, DriverResult, TaskOutcome, PromptLayers, SpawnActivity, ParsedReport, LockHandle are all exported from lib/driver/types.ts or lib/driver/lock.ts as appropriate.
- [x] #6 bun run typecheck passes after these files are created.
<!-- AC:END -->

## Implementation Notes

Added serializable driver core contracts in lib/driver/types.ts and backend contracts in lib/driver/backends/types.ts. Verified bun run test, bun run lint, and bun run typecheck pass.
