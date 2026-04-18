---
source: archive
plan: parallel-agent-spawning
distilledAt: 2026-04-17T00:00:00.000Z
---

# Parallel Agent Spawning

## What Was Built

Moved `spawn_agent` from blocking RPC semantics to non-blocking fire-and-forget. Children now run as background Promises; the tool returns `{ status: "accepted", spawnId }` immediately. A message bus (`lib/orchestration/message-bus.ts`), semaphore (`semaphore.ts`), spawn limits (`spawn-limits.ts`), and spawn tracker (`spawn-tracker.ts`) provide the concurrency infrastructure. A multi-turn completion loop in `agent-spawner.ts` keeps the parent coordinator alive and feeds completion results back as follow-up `session.prompt()` turns. Coordinator and spawning capability docs were rewritten to teach the new model.

## Key Decisions

- **Non-blocking over blocking**: Blocking spawn serializes all child work — one `spawn_agent` call would block until the child finishes before the next could start. Non-blocking lets the coordinator dispatch a full wave in a single turn, with all children running concurrently. OpenClaw's `sessions_spawn` validated that LLMs handle `"accepted"` returns correctly when the prompt contract is explicit.

- **session.prompt() loop over pi.sendUserMessage()**: Completion results are delivered by the spawner calling `session.prompt()` directly, not by injecting messages from inside the extension via `pi.sendUserMessage({ deliverAs: 'followUp' })`. The latter requires a Pi event loop running after `session.prompt()` resolves — timing is unreliable. The spawner-controlled loop gives a predictable lifecycle: prompt → wait → prompt → wait → dispose.

- **Module-level spawn tracker as spawner↔extension bridge**: The spawner and the spawn tool are separate modules that need shared per-session state. A module-level `Map<sessionId, SpawnTracker>` (managed by `getOrCreateTracker` / `removeTracker`) bridges them without coupling. The spawner creates the tracker before `session.prompt()`; the tool writes into it during tool calls.

## Patterns Established

- **Wave-and-wait coordinator loop**: Spawn all ready tasks (non-blocking) → summarize in response → spawner injects completions as follow-up `session.prompt()` turns → coordinator processes each completion (verify done status, handle failures) → spawn next wave if tasks are now unblocked → repeat until `activeCount() == 0`.

- **Completion message protocol**: `"[spawn_completion] spawnId=<id> role=<role> outcome=<success|failed> summary=<brief text>"` — used verbatim by `formatCompletionMessage()` in `agent-spawner.ts`, `coordinator.md`, and `spawning.md`. Change in one place requires updating all three.

- **Semaphore FIFO queuing**: `acquire()` pushes a resolve callback onto a queue when all slots are taken; `release()` shifts the next waiter and calls it directly (slot stays consumed, no extra tick). This pattern is in `semaphore.ts` and should be reused for any future rate-limiting primitive.

## Files Changed

- `lib/orchestration/message-bus.ts` *(new)* — Typed EventEmitter with `publish()`, `subscribe()`, `waitFor()`, `unsubscribe()`. Foundation for all inter-agent events; initial types are spawn lifecycle events.
- `lib/orchestration/semaphore.ts` *(new)* — Counting semaphore with FIFO queuing. Used by spawn tracker to cap concurrent child sessions.
- `lib/orchestration/spawn-limits.ts` *(new)* — Default constants (`DEFAULT_MAX_CONCURRENT_SPAWNS=5`, `DEFAULT_MAX_SPAWN_DEPTH=2`) and resolver functions.
- `lib/orchestration/spawn-tracker.ts` *(new)* — Per-session child registry. Enforces breadth/depth limits, exposes `nextCompletion()` / `drainCompleted()`, and holds the module-level `Map<sessionId, SpawnTracker>` registry.
- `lib/orchestration/agent-spawner.ts` — Added `PiSpawnerOptions` (with optional `bus`), `awaitNextCompletion()` with timeout, `formatCompletionMessage()`, and the multi-turn while loop after `session.prompt()`.
- `lib/orchestration/types.ts` — Added `SpawnHandle`, optional `spawnDepth`/`parentSessionId` on `SpawnConfig`, `spawn_completion` variant on `ChainEvent`.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — Rewrote `spawn_agent` handler: background Promise, tracker registration, returns `"accepted"` immediately. Added `sessionBuses` and `sessionDepths` module-level maps.
- `domains/coding/prompts/coordinator.md` — Rewrote delegation section: parallel spawn wave, completion turn processing, file conflict avoidance.
- `domains/shared/capabilities/spawning.md` — Added non-blocking return contract, completion message format, and parallel usage pattern example.

## Gotchas & Lessons

- **LLMs default to blocking semantics**: Without explicit prompt instructions, a coordinator treats `{ status: "accepted" }` as the child's outcome and doesn't wait for completions. `coordinator.md` and `spawning.md` are the guardrails — keep the non-blocking contract language intact when editing these files.

- **Parent must outlive all children**: The multi-turn loop must run until `activeCount() == 0`. If the coordinator session exits early (exception, early return), all running background children become orphaned — their completions fire into the bus but no one reads them. `removeTracker()` must be in a `finally` block, but it does not cancel running children.

- **A single hung child blocks the parent forever** without per-spawn timeouts. On timeout, `runningSpawns()` enumerates all still-active spawns, `tracker.fail()` is called for each, and failure messages are delivered as a batch. The dangling `nextCompletion()` waiter resolves benignly on the first `fail()` call.

- **Parallel workers with overlapping file scope cause data loss**: There is no file locking or sandboxing. Task design is the only guardrail — the coordinator must assign workers to non-overlapping file sets. This is an accepted limitation; conflict resolution is deferred.

- **`getOrCreateTracker` must be called before `session.prompt()`**: If the tracker is created after the session starts, tool calls that fire during the first prompt turn may register children into a tracker that the spawner loop never checks. Always set up the tracker first.
