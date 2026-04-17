---
title: "Observability: Cost Tracking, Event Streaming, and Pi Lifecycle Skill"
status: active
createdAt: '2026-03-11T00:00:00.000Z'
updatedAt: '2026-03-11T00:00:00.000Z'
---

## Summary

Add observability infrastructure to cosmonauts — cost tracking per chain stage, richer event streaming from spawned agents, compaction for long-running coordinator loops, and a comprehensive Pi skill that teaches agents how to fully leverage Pi's capabilities. Today we use ~30% of Pi's event system; this plan closes the gap on the parts that matter for orchestration.

## Scope

**Included:**

1. Cost tracking: capture `SessionStats` after each spawned session, aggregate across chain stages, report totals.
2. Event streaming: use `session.subscribe()` in the agent spawner for richer progress data (tool execution, turn boundaries, message streaming).
3. Compaction support: trigger `compact()` proactively in long-running chain stages (coordinator loops).
4. Lifecycle hooks: wire up `tool_call`, `agent_end`, `turn_start`/`turn_end`, and `session_shutdown` events in a new `observability` extension.
5. Pi capabilities skill: a comprehensive `SKILL.md` that teaches agents how to use Pi's full API surface — events, tools, extensions, sessions, compaction, cost tracking.

**Excluded:**

- Budget enforcement (stop-at-$X). That's a follow-up that builds on cost tracking.
- `steer()`/`followUp()` mid-stream control. Useful but separate concern.
- `EventBus` cross-extension communication. Low priority; revisit when we have a concrete use case.
- RPC mode integration. Future concern for sandboxed/remote workers.
- UI/dashboard for observability data. This plan is infrastructure only.

**Assumptions:**

- Pi's `SessionStats` is accessible after `session.prompt()` completes (either via session properties or RPC).
- `session.subscribe()` delivers the same events as `pi.on()` but from outside the extension context.
- Auto-compaction works for in-memory sessions. If not, we trigger `compact()` manually based on turn count.

## Approach

### 1. Pi Capabilities Skill (`domains/shared/skills/pi/SKILL.md`)

**Why first:** This skill pays for itself immediately. Every agent that touches Pi code (workers implementing features, planners designing extensions) gets a complete reference. It also serves as the canonical "what Pi can do" document for the project, replacing scattered knowledge in `docs/pi-framework.md` and developer memory.

**Content outline:**

```
- Session creation patterns (createAgentSession options, when to use each)
- Tool registration (pi.registerTool, customTools option, TypeBox schemas)
- Extension authoring (pi.on events, pi.registerCommand, pi.appendEntry, pi.sendMessage)
- Full lifecycle event catalog (all ~25 events with payloads and use cases)
- System prompt composition (systemPromptOverride, before_agent_start chaining)
- Skill system (SKILL.md format, discovery, filtering, skillsOverride)
- Session management (inMemory vs file-based, newSession, fork)
- Compaction (auto vs manual, session_before_compact customization)
- Cost tracking (SessionStats, token counts, per-session aggregation)
- Model control (setModel, cycleModel, scopedModels, model_select event)
- Execution modes (interactive, print, RPC — when to use each)
- Cross-extension communication (pi.events EventBus)
- Tool override patterns (replacing built-in tools)
- AgentSession methods (prompt, steer, followUp, subscribe, abort, dispose)
```

**Format:** Reference-style with code examples. Not a tutorial — a lookup resource agents load when they need to work with Pi APIs. Link to `docs/pi-framework.md` for deeper context.

**Skill access:** Add to all agents that write code (`worker`, `fixer`) and design agents (`planner`, `cosmo`). Read-only agents like `reviewer` don't need it.

### 2. Cost Tracking

**Data model:**

```typescript
interface StageStats {
  stageId: string;        // e.g. "planner", "coordinator"
  iteration: number;      // which iteration of the stage
  agentId: string;        // qualified agent ID
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;           // USD
  durationMs: number;     // wall clock time
  turns: number;          // LLM turns in this session
}

interface ChainStats {
  stages: StageStats[];
  totalCost: number;
  totalTokens: number;
  totalDurationMs: number;
}
```

**Integration points:**

- `agent-spawner.ts`: After `session.prompt()` completes, extract stats from the session before `dispose()`. Return them alongside the existing spawn result.
- `chain-runner.ts`: Accumulate `StageStats` per stage iteration. Emit `stage_stats` and `chain_stats` events. Include `ChainStats` in the `chain_end` event payload.
- CLI output: Print a summary table after chain completion (stage, tokens, cost, duration).

**How to get stats from session:** Check if `AgentSession` exposes stats directly (likely via `session.agent` or a stats getter). If not, use `session.subscribe()` to accumulate token usage from `turn_end` events which should include usage data.

### 3. Event Streaming from Spawned Agents

**Current state:** The spawner calls `session.prompt()` and waits. Progress comes only from `onUpdate` in tool execution.

**Target state:** Use `session.subscribe()` to capture a richer event stream:

| Event | What we do with it |
|-------|-------------------|
| `turn_start` / `turn_end` | Track turn count, accumulate token usage |
| `tool_execution_start` / `tool_execution_end` | Report which tools are being used, catch slow tools |
| `message_update` | Stream assistant text for real-time progress |
| `agent_end` | Capture final messages for handoff to next stage |

**Implementation:**

- In `createPiSpawner`, after creating the session, call `session.subscribe()` before `session.prompt()`.
- The subscriber collects events into a structured log.
- Forward selected events through the existing `onEvent` callback in chain-runner (new event types: `agent_turn`, `agent_tool_use`, `agent_message`).
- The unsubscribe function is called before `dispose()`.

### 4. Compaction for Long-Running Stages

**Problem:** The coordinator loops until all tasks are done. With many tasks, this can exceed context limits. Currently no compaction — the session just fails.

**Solution:**

- Track token usage via `turn_end` events in the spawner's subscriber.
- When cumulative tokens approach a threshold (e.g., 80% of model context window), call `session.compact()` before the next prompt.
- Alternative: rely on Pi's auto-compaction if it works for in-memory sessions. Test this first — if auto-compaction handles it, we just need to ensure `SettingsManager` is configured with appropriate `keepRecentTokens`.

**Configuration:** Add `compaction` settings to chain config:

```typescript
interface CompactionConfig {
  enabled: boolean;           // default: true
  keepRecentTokens?: number;  // default: Pi's default (20k)
  triggerThreshold?: number;  // percentage of context window (default: 0.8)
}
```

### 5. Observability Extension (`domains/shared/extensions/observability/`)

A lightweight extension that wires up lifecycle events for logging and diagnostics. Loaded by orchestration-heavy agents (coordinator, cosmo).

**Events to handle:**

```typescript
export default function observability(pi: ExtensionAPI) {
  // Track turns for progress reporting
  pi.on("turn_start", async (event) => { /* log turn index, timestamp */ });
  pi.on("turn_end", async (event) => { /* log turn index, token usage */ });

  // Log tool usage patterns
  pi.on("tool_call", async (event) => { /* log tool name, can block if needed */ });
  pi.on("tool_execution_end", async (event) => { /* log duration, errors */ });

  // Capture completion state
  pi.on("agent_end", async (event) => { /* log final message count */ });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => { /* flush any buffered state */ });
}
```

**Output:** For now, structured log entries via `pi.appendEntry("observability", ...)`. Future: expose via events for the CLI to render.

## Task Breakdown (rough ordering)

1. **Pi capabilities skill** — Write `domains/shared/skills/pi/SKILL.md`. Update agent definitions to include it in skill access lists. No code changes, high value. Do first.
2. **Cost tracking data model** — Define `StageStats`/`ChainStats` types in `lib/orchestration/types.ts`. Add stats extraction to `agent-spawner.ts`.
3. **Cost tracking in chain runner** — Accumulate stats, emit events, print summary.
4. **Event streaming subscriber** — Add `session.subscribe()` to spawner, forward events through chain runner.
5. **Compaction support** — Test auto-compaction behavior with in-memory sessions. Add manual trigger if needed. Add config.
6. **Observability extension** — Create extension, wire up events, add to relevant agent definitions.
7. **Update `docs/pi-framework.md`** — Reflect new patterns and the full event catalog from deepwiki research.

## Risks

- **SessionStats API uncertainty.** We haven't confirmed the exact method to extract stats from `AgentSession`. Need to inspect Pi's source or test empirically. Mitigation: accumulate from `turn_end` events as fallback.
- **Auto-compaction with in-memory sessions.** May not work — compaction stores entries in the session manager, and in-memory may not support the full flow. Mitigation: test early; manual trigger is straightforward.
- **Event payload changes.** Pi is pre-1.0 and evolving. Event types may change between versions. Mitigation: pin Pi version (already done), wrap event handling in typed helpers.

## Open Questions

1. Does `AgentSession` expose a `stats` or `getStats()` method, or do we need to accumulate from events?
2. Does auto-compaction work with `SessionManager.inMemory()`?
3. Should the Pi skill be a single large file or split into sub-files with references (like the TypeScript skill)?
4. Should cost data be persisted to disk (e.g., `missions/stats/`) or kept ephemeral?
