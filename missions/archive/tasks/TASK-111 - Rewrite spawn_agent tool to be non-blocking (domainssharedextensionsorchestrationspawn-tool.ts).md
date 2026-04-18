---
id: TASK-111
title: >-
  Rewrite spawn_agent tool to be non-blocking
  (domains/shared/extensions/orchestration/spawn-tool.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - 'plan:parallel-agent-spawning'
dependencies:
  - TASK-109
  - TASK-108
createdAt: '2026-03-21T03:55:35.431Z'
updatedAt: '2026-03-21T04:12:41.628Z'
---

## Description

Rewrite the `spawn_agent` tool implementation in the post-refactor `spawn-tool.ts` (~150 lines) to be non-blocking. The tool starts the child session as a background Promise, registers it with the spawn tracker, and returns `{ status: "accepted", spawnId }` immediately instead of awaiting the child's completion.

**File**: `domains/shared/extensions/orchestration/spawn-tool.ts`
**Dependencies**: spawn tracker (TASK-109), types update (TASK-108)

**Key changes**:
- Remove the blocking `await spawner.spawn()` call.
- Call `createAgentSessionFromDefinition()` (from `lib/orchestration/session-factory.ts`) directly to create the child session.
- Register the spawn with `getOrCreateTracker(parentSessionId)` before launching the background Promise.
- Launch the child session's `session.prompt()` as a detached Promise. In `.then()`, call `tracker.complete(spawnId, summary)`. In `.catch()`, call `tracker.fail(spawnId, error)`.
- Return `{ status: "accepted", spawnId: "<uuid>" }` immediately.
- Enforce depth limit via `tracker.canSpawn(currentDepth)` — return a `{ status: "rejected", reason: "depth limit" }` if exceeded.
- Authorization checks (`isSubagentAllowed`) remain unchanged.
- The `spawnId` is a newly generated UUID per call.

<!-- AC:BEGIN -->
- [ ] #1 spawn_agent tool returns { status: 'accepted', spawnId } immediately without awaiting child session completion
- [ ] #2 Child session is launched as a detached background Promise via createAgentSessionFromDefinition()
- [ ] #3 On child completion, tracker.complete() is called with a brief summary of the outcome
- [ ] #4 On child failure, tracker.fail() is called with the error
- [ ] #5 Depth limit is enforced: returns { status: 'rejected', reason } if canSpawn(depth) is false
- [ ] #6 Authorization checks (isSubagentAllowed) are preserved and still block unauthorized spawns
- [ ] #7 Each spawn_agent call generates a unique spawnId
<!-- AC:END -->

## Implementation Notes

Rewrote spawn-tool.ts to be fully non-blocking. Key implementation details:

- Module-level `sessionBuses` and `sessionDepths` maps manage per-session state across calls (buses for spawn tracker, depths for child nesting level computation).
- `ctx.sessionManager.getSessionId()` provides the parent session ID.
- `tracker.register()` acquires the semaphore slot synchronously before the background Promise launches.
- Background Promise runs `createAgentSessionFromDefinition` + `session.prompt()`, calling `tracker.complete/fail` in `.then/.catch`.
- Child session depth is stored in `sessionDepths` so grandchild spawns can compute their own depth correctly.
- `SpawnProgressDetails.status` union extended with `"accepted"` and `"rejected"` variants for UI rendering.
- Tests updated: `createMockPi` now provides `sessionManager`, mocked `createAgentSessionFromDefinition` from session-factory.ts, and spawn_agent tests assert on `{ status: "accepted" }` + background settle.

All 907 tests pass, typecheck clean, lint clean (pre-existing format issue in spawn-limits.test.ts is unrelated).
