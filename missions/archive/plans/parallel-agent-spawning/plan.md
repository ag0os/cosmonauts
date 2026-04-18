---
title: Parallel Agent Spawning
status: completed
createdAt: '2026-03-21T01:24:25.332Z'
updatedAt: '2026-03-26T18:15:37.888Z'
---

## Summary

Add parallel agent spawning to Cosmonauts with a foundation that supports future inter-agent messaging and team coordination. The coordinator spawns workers non-blockingly (each `spawn_agent` returns immediately), children run concurrently, and completion results are delivered back to the parent session as follow-up turns. An in-process message bus provides the communication backbone — initially for spawn completions, later for arbitrary agent-to-agent messaging.

## Reference Analysis

### Source
- **Reference codebase**: `/Users/cosmos/Projects/moltbot` (OpenClaw)
- **Key files examined**:
  - `src/agents/subagent-spawn.ts` — spawn entrypoint, depth checks, maxChildren enforcement
  - `src/agents/subagent-registry.ts` — in-memory run tracking (`Map<runId, SubagentRunRecord>`), lifecycle event listener, completion wait, announce flows
  - `src/agents/subagent-registry.types.ts` — `SubagentRunRecord` type
  - `src/agents/subagent-depth.ts` — spawn depth resolution from session store
  - `src/agents/subagent-capabilities.ts` — role-based capability gating (main/orchestrator/leaf)
  - `src/agents/subagent-announce.ts` — push-based completion delivery to parent sessions
  - `src/agents/subagent-announce-dispatch.ts` — queue/steer/direct dispatch routing
  - `src/agents/subagent-announce-queue.ts` — queued announce delivery
  - `src/agents/subagent-control.ts` — list/kill/steer tools for controlling children
  - `src/agents/tools/subagents-tool.ts` — `subagents` tool (list/kill/steer)
  - `src/config/agent-limits.ts` — defaults: `maxConcurrent=4`, `maxSpawnDepth=1`, `maxChildrenPerAgent=5`

### Architecture
OpenClaw's subagent system is a full multi-process gateway-mediated architecture:
1. **Spawn**: `spawnSubagentDirect()` creates a child session key, patches depth/role/model into the gateway session store, then fires an `agent` RPC call to start the child. Returns immediately with `status: "accepted"`.
2. **Registry**: In-memory `Map<runId, SubagentRunRecord>` tracks all active runs. Persisted to disk for crash recovery. Gateway lifecycle events (`onAgentEvent`) drive state transitions.
3. **Announce**: When a child completes, `runSubagentAnnounceFlow()` captures the child's final output and pushes it back to the parent session as a user message. The parent processes it and synthesizes results. This is push-based — parents never poll.
4. **Limits**: Depth gating (`maxSpawnDepth`, default 1), breadth gating (`maxChildrenPerAgent`, default 5), capability roles (main→orchestrator→leaf).
5. **Control**: `subagents` tool lets parents list, kill, or steer active children.

### Key patterns adopted
1. **Non-blocking spawn with push-based completion**: The core pattern from OpenClaw — spawn returns immediately, results are pushed to the parent. We adopt this pattern but implement it with in-process Promises + multi-turn `session.prompt()` instead of gateway RPC + announce messaging.
2. **Breadth limits** (`maxChildrenPerAgent`): Prevents unbounded concurrent spawns from a single parent. Adapted directly.
3. **Depth limits** (`maxSpawnDepth`): Prevents infinite nesting. Adapted directly.
4. **In-memory run tracking**: Registry of active spawns per parent for limit enforcement and observability. Simplified from OpenClaw's persistent `SubagentRunRecord`.
5. **Completion message delivery to parent**: OpenClaw injects child results into the parent session as user messages, triggering a new agent turn. We do the same using `session.prompt()` in a multi-turn loop.

### Adaptations needed
- **No gateway RPC**: OpenClaw routes through a persistent gateway process. We're in-process — child sessions are `createAgentSession()` calls running as background Promises. Completion delivery is a direct `session.prompt()` call on the parent session.
- **Multi-turn spawner loop**: OpenClaw's gateway keeps sessions alive indefinitely. Our spawner creates ephemeral sessions. We add a multi-turn loop in the spawner: after each turn, check for completed children → inject results → prompt again → repeat until no active children.
- **Message bus instead of announce system**: OpenClaw's 1500-line announce system handles multi-channel delivery (WhatsApp, Discord, etc.). We replace it with a simple in-process `EventEmitter`-based message bus that currently handles spawn completions but is designed to carry arbitrary inter-agent messages later.
- **Module-level spawn tracker registry**: OpenClaw has gateway-level state. We use a module-level `Map<sessionId, SpawnTracker>` to bridge between the spawner (which controls the session lifecycle) and the extension (which registers children from tool calls).

### Skipped
- **Announce queue, dispatch routing, delivery retry** (`subagent-announce.ts`, `subagent-announce-dispatch.ts`, `subagent-announce-queue.ts`): 2000+ lines of multi-channel delivery infrastructure. Replaced by direct in-process completion delivery.
- **Session store persistence**: Gateway-mediated crash recovery. Not needed for ephemeral in-process spawns.
- **Steer/kill for active runs**: OpenClaw's `subagents` tool lets parents send mid-run messages to children or kill them. Valuable but deferred — the message bus provides the foundation to add this later.
- **Orphan recovery**: Crash recovery for interrupted runs. Not needed for ephemeral spawns.
- **Wake-after-descendants**: Re-invoking a parent when descendant subagents settle. Not needed — our multi-turn loop handles this naturally.
- **Thread bindings**: Channel-specific session persistence. Not applicable.

## Scope

### Included
- **Non-blocking `spawn_agent`**: Returns immediately with a spawn handle. Child runs in background.
- **In-process message bus**: Typed `EventEmitter` for spawn completions. Designed to carry arbitrary inter-agent messages in the future.
- **Multi-turn spawner loop**: Parent session stays alive, receiving completion results as follow-up prompts until all children finish.
- **Spawn tracker**: Per-session registry of active children. Enforces breadth/depth limits. Bridges spawner ↔ extension.
- **Configurable limits**: `maxConcurrentSpawns` (default 5), `maxSpawnDepth` (default 2).
- **Semaphore-based concurrency**: Caps simultaneous API calls to avoid rate limiting.
- **Updated coordinator prompt**: Teaches parallel worker dispatch and completion processing.

### Excluded
- **Chain DSL parallel syntax** (e.g. `worker[3]`): Deferred. Within-stage parallelism is handled by non-blocking spawns from the coordinator. DSL syntax is a separate, smaller follow-up.
- **Kill/steer for active spawns**: Future enhancement. The message bus provides the foundation.
- **Inter-agent chat**: Future enhancement. The message bus provides the backbone — agents publish/subscribe to topics. This plan focuses on spawn completions as the first message type.
- **Crash recovery / persistence**: Spawns are ephemeral.

### Assumptions
- Pi's `createAgentSession` and `session.prompt()` are safe to call concurrently across independent sessions (each session is self-contained).
- Pi's `session.prompt()` can be called multiple times on the same session for multi-turn interactions.
- Filesystem conflicts from parallel workers are an inherent limitation. The coordinator prompt guides workers toward independent files. Proper conflict resolution is out of scope.

## Approach

### Core architecture: Non-blocking spawn + multi-turn completion loop

The fundamental pattern, adapted from OpenClaw's announce system for in-process use:

1. **Coordinator calls `spawn_agent` N times** — each returns immediately with `{ status: "accepted", spawnId: "..." }`. Children start as background Promises.
2. **Coordinator's turn ends** — it sends a response like "Spawned 3 workers, waiting for results."
3. **Spawner multi-turn loop kicks in** — checks the spawn tracker for active children. Waits for the next completion via the message bus.
4. **Child completes → spawner calls `session.prompt(completionMessage)`** — this triggers a new turn where the coordinator processes the result (verifies task, updates status).
5. **Repeat** until no active children remain. Spawner disposes the session and returns.

This is the same conceptual pattern as OpenClaw (spawn → background execution → push result to parent → parent processes), but implemented with simple Promises and `session.prompt()` instead of gateway RPC and announce queues.

### Why this scales to the broader vision

**Parallel tasks for the same goal**: Works directly — coordinator spawns N workers for N tasks, processes completions as they arrive.

**Independent parallel agents**: The message bus is agent-agnostic. Any agent can publish messages to any topic. The multi-turn loop can process messages from any source, not just spawn completions.

**Inter-agent messaging/chat**: The message bus supports `agent:message` events (future). Agent A publishes a message addressed to Agent B. Agent B's session receives it via the multi-turn loop. This is how agents "talk" to each other. The same infrastructure that delivers spawn completions delivers arbitrary messages.

**Team coordination replacing file-based tasks**: Once agents can message each other, a coordinator can send work assignments directly instead of writing task files. Workers report back via messages instead of editing task files. The file-based system becomes optional persistence, not the communication mechanism.

### Design decisions

1. **Non-blocking `spawn_agent` over batch `spawn_agents`**: Non-blocking spawn is more flexible — the coordinator calls it N times and all children run concurrently. No special batch tool needed. This also matches OpenClaw's `sessions_spawn` pattern where agents spawn individually and results auto-announce.

2. **Multi-turn spawner loop over `pi.sendUserMessage()`**: We could use Pi's `pi.sendUserMessage({ deliverAs: "followUp" })` to inject completions from the extension. But this requires the session to have an active event loop after `session.prompt()` resolves. Cleaner to keep the spawner in control: it calls `session.prompt()` directly for each completion batch, maintaining a clear lifecycle.

3. **Module-level spawn tracker registry**: The spawner and the extension need to share state (active children, completions). A module-level `Map<sessionId, SpawnTracker>` bridges them without coupling. The extension registers children via the tracker; the spawner reads completions from it. Keyed by session ID for multi-session safety.

4. **Message bus as a typed EventEmitter**: Simple, proven pattern. `SpawnCompletionEvent` is the first event type. Future types: `AgentMessageEvent`, `TaskUpdateEvent`, etc. The bus is the foundation layer; spawn tracking and completion delivery are built on top.

5. **Semaphore for API concurrency**: Even with non-blocking spawn, we limit simultaneous active sessions (default 5) to avoid overwhelming API rate limits. The semaphore lives in the spawn tracker and gates new spawn registrations.

## Files to Change

### New files
- `lib/orchestration/message-bus.ts` — In-process typed EventEmitter. Initial event types: `SpawnRegisteredEvent`, `SpawnCompletedEvent`, `SpawnFailedEvent`. Designed for extensibility with future event types (`AgentMessageEvent`, etc.). Exports `MessageBus` class with `publish()`, `subscribe()`, `waitFor()` (returns Promise for next matching event). (Adapted from the conceptual pattern in OpenClaw's `subagent-registry.ts` lifecycle event listener, but implemented as a generic bus rather than agent-specific.)
- `lib/orchestration/spawn-tracker.ts` — Per-session spawn registry. Tracks active children, enforces breadth/depth limits, provides `nextCompletion()` (Promise that resolves when any child completes) and `drainCompleted()` (returns all available results). Uses the message bus internally. Module-level registry `Map<sessionId, SpawnTracker>` for spawner↔extension bridging. (Adapted from OpenClaw's `subagent-registry.ts` — simplified: no persistence, no announce, no orphan recovery. Core patterns: `registerSubagentRun()` → `register()`, `countActiveRunsForSession()` → `activeCount()`, depth/breadth checks from `spawnSubagentDirect()`.)
- `lib/orchestration/spawn-limits.ts` — Default limits and resolution functions. `DEFAULT_MAX_CONCURRENT_SPAWNS` (5), `DEFAULT_MAX_SPAWN_DEPTH` (2), `resolveMaxConcurrentSpawns()`, `resolveMaxSpawnDepth()`. (Adapted from OpenClaw's `config/agent-limits.ts`: `DEFAULT_AGENT_MAX_CONCURRENT=4`, `DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH=1`.)
- `lib/orchestration/semaphore.ts` — Simple counting semaphore for concurrency control. `acquire()` returns a Promise that resolves when a slot is available. `release()` frees a slot. Used by spawn tracker to cap concurrent child sessions.
- `tests/orchestration/message-bus.test.ts` — Unit tests for message bus (publish, subscribe, waitFor, type filtering).
- `tests/orchestration/spawn-tracker.test.ts` — Unit tests for spawn tracker (registration, limits, completion waiting, draining, cleanup).
- `tests/orchestration/spawn-limits.test.ts` — Unit tests for limit resolution.
- `tests/orchestration/semaphore.test.ts` — Unit tests for semaphore (acquire, release, queuing, concurrent limit).

### Modified files
- `lib/orchestration/types.ts` — Add `SpawnHandle` type (spawn ID, role, status). Add optional `spawnDepth` and `parentSessionId` fields to `SpawnConfig`. Add `spawn_completion` event variant to `ChainEvent` union.
- `lib/orchestration/agent-spawner.ts` — Add multi-turn completion loop to `createPiSpawner`. After `session.prompt()`, check spawn tracker for active children. While active: wait for next completion → format as user message → call `session.prompt()` again. Clean up tracker on session dispose. The spawner remains generic — the loop activates only when the tracker has registered children.
- `domains/shared/extensions/orchestration/index.ts` — Rewrite `spawn_agent` tool to be non-blocking: start child as background Promise, register with spawn tracker, return `{ status: "accepted", spawnId }` immediately. On child completion, publish to message bus. Keep authorization checks (caller role, subagent allowlist). Remove the current blocking `await spawner.spawn()` call. Add depth enforcement using spawn tracker.
- `domains/coding/prompts/coordinator.md` — Rewrite delegation section: spawn all ready tasks via individual `spawn_agent` calls (non-blocking), then explain that completion results arrive as follow-up messages. Add guidance on processing completions: verify task status, handle partial failures, batch verification. Add file conflict avoidance guidance.
- `domains/shared/capabilities/spawning.md` — Document non-blocking `spawn_agent` behavior (returns immediately with handle), completion message delivery, and usage patterns for parallel spawning.

### Unchanged (but relevant)
- `lib/orchestration/chain-runner.ts` — No changes needed. The multi-turn loop lives in the spawner, not the chain runner. Chain stages remain sequential; parallelism happens within coordinator invocations.
- `lib/orchestration/chain-parser.ts` — No DSL changes.
- `domains/coding/agents/coordinator.ts` — Agent definition unchanged (already has `loop: true`, `subagents: ["worker"]`).
- `domains/coding/agents/worker.ts` — Worker definition unchanged. Workers don't know they're running in parallel.

## Risks

1. **Filesystem conflicts**: Multiple workers editing the same files simultaneously will cause data loss or merge conflicts. Mitigation: coordinator prompt guides workers to independent files; task design should ensure non-overlapping file changes. This is an inherent limitation — no technical guardrail can fully prevent it without sandboxing or file locking.

2. **API rate limiting**: Spawning 5 concurrent agents means 5 concurrent API calls. Mitigation: semaphore-based concurrency limit (default 5). The `model-failover` roadmap item will add proper backoff/retry later.

3. **Context window pressure**: The coordinator processes completion results as individual turns. Each turn adds to the context. With many completions, the coordinator's context may grow large. Mitigation: completion messages are concise summaries (task ID + status + brief outcome), not full transcripts. Compaction settings protect against overflow.

4. **Pi session concurrency**: We assume `createAgentSession` and `session.prompt()` are safe to call concurrently across independent sessions. This is very likely true (each session is self-contained) but should be verified with a concurrency test.

5. **Multi-turn loop complexity**: The spawner's completion loop adds lifecycle management complexity. A child that hangs indefinitely would block the parent. Mitigation: per-spawn timeout (configurable, with a sensible default). On timeout, the spawn is marked as failed and the completion is delivered with an error.

6. **Module-level registry leaks**: If sessions aren't properly cleaned up, the spawn tracker registry could leak entries. Mitigation: cleanup in a `finally` block in the spawner, keyed by session ID.

7. **LLM behavior with non-blocking tools**: The coordinator must understand that `spawn_agent` returns "accepted" (not a result) and that results arrive later as follow-up messages. This is a prompt engineering challenge. Mitigation: clear prompt instructions, tested with real coordinator runs. OpenClaw has proven this pattern works with LLMs — their `sessions_spawn` returns "accepted" and the LLM handles it well.

## Implementation Order

1. **Message bus** (`lib/orchestration/message-bus.ts` + tests) — Standalone module, no dependencies. Typed EventEmitter with `publish()`, `subscribe()`, `waitFor()`. First event types: `SpawnRegisteredEvent`, `SpawnCompletedEvent`, `SpawnFailedEvent`. This is the foundation layer everything else builds on.

2. **Semaphore** (`lib/orchestration/semaphore.ts` + tests) — Standalone concurrency primitive. `acquire()`, `release()`, configurable max concurrency. Used by spawn tracker.

3. **Spawn limits** (`lib/orchestration/spawn-limits.ts` + tests) — Default constants and resolution functions. Standalone.

4. **Spawn tracker** (`lib/orchestration/spawn-tracker.ts` + tests) — Depends on message-bus, semaphore, spawn-limits. Per-session registry with `register()`, `complete()`, `fail()`, `activeCount()`, `canSpawn()`, `nextCompletion()`, `drainCompleted()`. Module-level `Map<sessionId, SpawnTracker>` for spawner↔extension bridging.

5. **Types update** (`lib/orchestration/types.ts`) — Add `SpawnHandle`, depth/parent fields to `SpawnConfig`, completion event to `ChainEvent`.

6. **Spawner multi-turn loop** (`lib/orchestration/agent-spawner.ts`) — After `session.prompt()`, enter completion loop: while tracker has active children → wait for next completion → format message → `session.prompt()` again. Clean up tracker on dispose.

7. **Orchestration extension update** (`domains/shared/extensions/orchestration/index.ts`) — Rewrite `spawn_agent` to be non-blocking. Start child as background Promise. Register with tracker. Return "accepted" immediately. Publish to message bus on completion. Add depth enforcement.

8. **Prompt updates** (`coordinator.md`, `spawning.md`) — Teach coordinator non-blocking spawn pattern: spawn all ready tasks → receive completions as follow-up messages → verify each → exit when done. Document the new behavior in spawning capability.
