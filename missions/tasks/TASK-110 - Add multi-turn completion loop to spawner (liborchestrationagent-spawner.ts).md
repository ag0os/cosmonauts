---
id: TASK-110
title: Add multi-turn completion loop to spawner (lib/orchestration/agent-spawner.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies:
  - TASK-109
  - TASK-108
createdAt: '2026-03-21T03:55:23.727Z'
updatedAt: '2026-03-21T04:18:41.991Z'
---

## Description

Extend the post-refactor `createPiSpawner()` in `lib/orchestration/agent-spawner.ts` (~80 lines) with a multi-turn completion loop. After the initial `session.prompt()` call resolves, the spawner checks the spawn tracker for active children. While children are active, it waits for the next completion via the tracker, formats the result as a user message, and calls `session.prompt()` again. Repeats until no active children remain, then disposes the tracker and session.

**File**: `lib/orchestration/agent-spawner.ts`
**Dependencies**: spawn tracker (TASK-109), types update (TASK-108)

The loop is gated — it only activates when the tracker has registered children. Sessions without any spawns behave identically to today (no-op loop).

**Key details**:
- `getOrCreateTracker(sessionId)` is called before `session.prompt()` to ensure the tracker exists before any tool calls register children.
- Completion messages should be concise: `"[spawn_completion] spawnId=<id> role=<role> outcome=<success|failed> summary=<brief text>"`.
- Per-spawn timeout (configurable, default e.g. 5 minutes) — on timeout, mark the spawn as failed and deliver a failure completion message.
- `removeTracker(sessionId)` is called in a `finally` block to prevent registry leaks.

<!-- AC:BEGIN -->
- [ ] #1 After session.prompt() resolves, the spawner enters a loop that continues while activeCount() > 0
- [ ] #2 Each iteration waits for nextCompletion() and calls session.prompt() with a formatted completion message
- [ ] #3 The loop does not activate (no extra prompts) when no children were spawned in a session
- [ ] #4 removeTracker() is called in a finally block, ensuring cleanup even if prompt() throws
- [ ] #5 Per-spawn timeout causes a failed completion to be delivered rather than hanging indefinitely
- [ ] #6 Existing spawner behavior (non-parallel sessions) is unchanged and existing tests pass
<!-- AC:END -->

## Implementation Notes

Implemented in two files:

- `lib/orchestration/spawn-tracker.ts`: Added `spawnRole(spawnId)` and `runningSpawns()` methods needed by the spawner for formatting completion messages and failing all running spawns on timeout.

- `lib/orchestration/agent-spawner.ts`: Added `PiSpawnerOptions` interface (exported), `awaitNextCompletion()` helper with timeout logic, `formatCompletionMessage()` helper, and the multi-turn while loop in `spawn()`. The bus defaults to a new `MessageBus()` if not provided — existing callers (chain-runner, tests) are unaffected. `removeTracker()` is in the finally block alongside session.dispose().

- `tests/orchestration/agent-spawner.completion-loop.test.ts`: 8 new tests covering all ACs including timeout (spawnTimeoutMs: 50ms) and finally-cleanup via a fresh tracker check.

Timeout behavior: on timeout, `runningSpawns()` is called, `tracker.fail()` is called for each, and all failure messages are returned as a batch. The while loop then sees activeCount() == 0 and exits. The dangling `nextCompletion()` waiter is resolved benignly by the first `fail()` call.

The spawn tool integration (how tool extensions access the bus) is out of scope — presumably a later task will pass the bus via extension options or a shared registry.
