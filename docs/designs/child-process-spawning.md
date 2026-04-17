# Child-Process Sub-Agent Spawning

**Status:** Investigation / proposal. No code changes yet.
**Branch:** `claude/investigate-parallel-agents-EUBM5`

## Problem

Cosmonauts advertises "parallel agents" through three mechanisms — bracket
groups (`[task-manager, reviewer]`), fan-out (`reviewer[3]`), and the
`spawn_agent` tool — but every one of them runs inside a **single Bun process
on a single event loop**. The current dispatch path
(`domains/shared/extensions/orchestration/spawn-tool.ts:326`) is a fire-and-forget
Promise:

```ts
void createAgentSessionFromDefinition(targetDef, spawnConfig, ...)
  .then(async ({ session }) => { await session.prompt(params.prompt); ... });
```

That gives us **async concurrency**, which is real for I/O-bound work (LLM API
calls, file I/O) but has structural costs:

| Limitation | Consequence |
|---|---|
| Shared V8 isolate | A worker that OOMs or hits an uncaught exception can take down the coordinator and every sibling worker. |
| Single event loop | Two workers doing CPU-bound work (large diffs, JSON parsing, prompt building) block each other. No real parallelism on multi-core hardware. |
| Shared cwd / env / process state | Workers can't trivially operate in separate git worktrees or isolated environments. |
| Interleaved stdio | Live observability of N workers in a single terminal stream is hard to follow; debugging requires trawling Pi's per-session JSONL after the fact. |
| Coupled lifecycle | A long-running plan-and-build can't survive parent disconnect; there is no detach/reattach story. |

The user-visible question that motivated this investigation —
*"Can the coordinator spawn two agents that work independently in parallel?"* —
has the answer **"yes, for I/O, but only cooperatively."** The architectural
ceiling is the single-process design, not the spawn protocol.

## Goals

1. **Crash containment.** A failing worker must not affect siblings or the parent.
2. **True OS-level parallelism.** Workers should be schedulable across cores.
3. **Per-agent environment.** Each worker can have its own cwd (e.g., a git
   worktree), env, and resource footprint.
4. **Live observability.** Operators should be able to attach to any running
   worker and see its transcript in real time.
5. **Backwards compatible.** No regression for existing in-process behavior;
   the migration must be feature-flagged and reversible.

## Non-Goals

- Sandboxing / security isolation (still same user, same FS — that's containers, not child processes).
- Removing the upstream Anthropic API rate-limit ceiling.
- Changing the `spawn_agent` tool contract (`{ status: "accepted", spawnId }` stays).
- Cross-machine distribution.

## Current Architecture (touch points)

| File | Role | What changes |
|---|---|---|
| `domains/shared/extensions/orchestration/spawn-tool.ts:326` | Fire-and-forget Promise dispatch + Pi event subscription (lines 332–505). | Replace with `Bun.spawn([...])`; subscription becomes a stdout JSONL reader. |
| `lib/orchestration/spawn-tracker.ts:137` | In-memory tracker + semaphore (default 5 concurrent). | Stays in parent. Stores `ChildProcess` handles instead of Promise handles; release driven by child exit / `completion` event. |
| `lib/orchestration/agent-spawner.ts:166-171` | Multi-turn completion loop (`awaitNextCompletion`). | **Unchanged.** Only the event source changes. |
| `lib/orchestration/chain-runner.ts:319` | Constructs the spawner for chain stages. | Phase 2 only — chain stages stay in-process initially. |
| `cli/main.ts:492` | CLI subcommand registry. | Add `cosmonauts agent run` — the natural child-process entrypoint. None of `--print`, `--workflow`, `--chain` emit machine-readable events today. |

## Proposed Design

### IPC: stdout JSONL framing

One JSON object per stdout line; stderr reserved for human logs. Chosen over
sockets / FIFOs / shared files because:

- The parent already translates Pi events into structured `SpawnActivityEvent`s
  (`spawn-tool.ts:349-386`); these map 1:1 to JSONL lines.
- Cross-platform, no OS-specific plumbing.
- Easy to tee for debugging or pipe through tmux for live viewing.

Event shape (versioned):

```jsonc
{"v":1,"type":"started","spawnId":"...","sessionId":"...","sessionFilePath":"..."}
{"v":1,"type":"tool_start","toolName":"Read","summary":"..."}
{"v":1,"type":"tool_end","toolName":"Read","isError":false}
{"v":1,"type":"turn_start"} | {"v":1,"type":"turn_end"}
{"v":1,"type":"child_spawn_request","role":"reviewer","prompt":"...","spawnId":"..."}
{"v":1,"type":"child_spawn_response","spawnId":"...","decision":"accepted|rejected"}
{"v":1,"type":"completion","outcome":"success","summary":"...","fullText":"...","stats":{...},"sessionRecord":{...}}
{"v":1,"type":"failure","error":"..."}
```

Grandchild requests round-trip through the parent so the **root
`SpawnTracker` semaphore stays authoritative** — preserves the existing
global concurrency budget.

### CLI entrypoint

New subcommand alongside `task`, `plan`, `scaffold` in `cli/main.ts`:

```
cosmonauts agent run \
  --role worker \
  --prompt-file /tmp/prompt.txt \
  --parent-session-id <id> \
  --spawn-id <id> \
  --spawn-depth 1 \
  --plan-slug <slug> \
  --session-file <path> \
  --domain coding \
  --model anthropic/claude-sonnet-4-6 \
  --ipc jsonl
```

Wires directly into `createAgentSessionFromDefinition`; emits JSONL on stdout
and exits when the session completes.

### Spawner abstraction

Introduce a boundary inside `spawn-tool.ts`:

```ts
interface ChildSpawner {
  launch(def: AgentDefinition, config: SpawnConfig): Promise<{
    spawnId: string;
    events: AsyncIterable<ChildEvent>;
  }>;
}
```

Two implementations:

- `InProcessSpawner` — wraps current `createAgentSessionFromDefinition` + `.then` path.
- `ChildProcessSpawner` — `Bun.spawn(["cosmonauts","agent","run", ...])`, parses stdout JSONL into `ChildEvent`s.

Selection via `COSMONAUTS_SPAWN_MODE=in-process|child-process` env var.
Default: `in-process` until parity is proven.

### Session persistence

Pi writes per-session JSONL to unique paths
(`session-factory.ts:93`: `${role}-${uuid}.jsonl`). Children own their own
files exclusively — no locking needed.

The one shared file is the **per-plan lineage manifest**. To avoid concurrent
appenders the child emits its `SessionRecord` in the `completion` event, and
the **parent stays the sole writer**.

## Migration Plan

### Phase 0 — Standalone CLI entrypoint (smallest viable step)

- Add `cosmonauts agent run` subcommand.
- Implement JSONL emission.
- Verify parity: the JSONL stream from `agent run` matches the in-process
  `SpawnActivityEvent` stream byte-for-byte for representative roles.
- **No change to `spawn-tool.ts`.** This is dog-fooding only.

Acceptance:
- `cosmonauts agent run --role worker --prompt-file X --ipc jsonl` runs a
  worker end-to-end and produces a valid Pi session file.
- Replay test: in-process and subprocess transcripts for the same prompt
  produce equivalent event streams (allowing for non-deterministic timestamps
  / IDs).

### Phase 1 — Opt-in `ChildProcessSpawner`

- Introduce `ChildSpawner` interface and both implementations.
- `spawn-tool.ts:326` branches on `runtime.spawnMode`.
- Implement parent-side IPC reader that re-publishes child JSONL into the
  existing `activityBus` — keeps TUI subscribers untouched.
- Wire grandchild request/response through IPC against the root semaphore.
- Default `COSMONAUTS_SPAWN_MODE=in-process`; opt-in via env or
  `.cosmonauts/config.json`.

Acceptance:
- All existing tests pass with `COSMONAUTS_SPAWN_MODE=in-process`.
- Targeted integration tests pass with `COSMONAUTS_SPAWN_MODE=child-process`.
- A worker that calls `process.exit(1)` mid-run no longer kills the
  coordinator; the parent surfaces a `failure` event.

### Phase 2 — Chain-stage subprocesses (optional)

- Migrate `agent-spawner.ts` chain stages to subprocesses.
- Optional: integrate tmux pane-per-agent for live observability.
- Optional: persistent worker-pool process to amortize Bun + Pi bootstrap
  cost (~hundreds of ms per spawn).

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| **Orphan processes if parent dies.** Bun on Linux can't use `PR_SET_PDEATHSIG`. | Child watches its stdin; when parent dies, stdin closes, child exits. Single most important reliability hook. |
| **Grandchild concurrency semantics.** Per-level vs. global budget. | Round-trip grandchild requests through parent IPC against the root semaphore. Preserves current global behavior. |
| **Stats aggregation.** `chain-runner.ts:655` aggregates `ChainStats` from in-process session objects. | Stats included in `completion` event. Every consumer must handle "stats missing" if child crashes before `completion`. |
| **Startup cost.** Each child pays Bun + Pi bootstrap (~hundreds of ms). | Acceptable for multi-second agent runs. Worker-pool optimization deferred to Phase 2. |
| **`activityBus` is process-global** (`activity-bus.ts:4`). UI subscribers depend on it. | Parent IPC reader re-publishes child events to the local `activityBus`. UI code untouched. |
| **Env / API key propagation.** | Child inherits parent env by default; whitelist sensitive vars rather than blindly exporting. |
| **Depth tracking.** `sessionDepths` map (`spawn-tool.ts:41`) resolves parent depth from in-process sessionId. | Pass `--spawn-depth` explicitly on launch. |
| **Concurrent appenders to lineage manifest.** | Child emits `SessionRecord` in `completion`; parent stays sole writer. |

## Recommendation

Ship **Phase 0 first**: a standalone `cosmonauts agent run` subcommand that
emits JSONL events. It introduces zero risk to the existing spawn path,
makes the child entrypoint testable in isolation, and lets us validate
stream parity before touching `spawn-tool.ts`. If parity holds, Phase 1
becomes a small, contained change behind a feature flag.
