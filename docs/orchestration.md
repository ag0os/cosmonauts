# Orchestration

Cosmonauts coordinates agents across a spectrum: from a single agent answering directly, to fully automated chain runs, to Drive-backed task batches, to always-on agents pairing with humans. The public surface now centers on `cosmonauts run`: named chains, Drive task runs, and normalized `status` / `watch` / `list` observation all produce a `runId` when they create durable run state.

## Packaged agents and export

Phase 1 adds a standalone packaged-agent export path. A packaged agent is an external-safe agent bundle designed for a target runtime instead of a normal Pi-backed Cosmonauts session. The initial target is `claude-cli`: `cosmonauts export` compiles a package into a Claude Code CLI-backed binary that can be moved to another project and invoked directly.

The source of truth is an `AgentPackageDefinition` JSON file. A definition declares the package id, optional source-agent provenance, prompt source (`file`, `inline`, or compatible `source-agent`), tool preset, skill selection, omitted project context, and target options such as Claude prompt mode or exact allowed tools. The builder derives an `AgentPackage` from that definition: the compiled artifact contains final system-prompt text, embedded full skill markdown, source metadata, tool policy, and Claude target options. The binary embeds the `AgentPackage`; it does not read package data from the Cosmonauts repo at runtime.

There are two export invocation forms:

```bash
cosmonauts export --definition packages/cosmo-planner/agent-package.json --out bin/cosmo-planner
cosmonauts export coding/explorer --target claude-cli --out bin/explorer-claude
```

Every export flows through an `AgentPackageDefinition`. The `<agent-id>` shorthand generates one from the source agent and is compatibility-gated because raw internal prompts may mention Cosmonauts-only tools, extensions, or subagents. Planner-like packages should use an explicit definition with a reviewed external-safe prompt.

Phase 1 export is intentionally separate from orchestration execution. Existing chain runner behavior is unchanged, and Drive behavior is unchanged; chains do not dispatch stages to packaged-agent binaries, and Drive still uses its existing backends. Exported binaries are standalone runtime artifacts only.

## Chain Runner

Runs agent pipelines using Pi sessions. The DSL is pure topology — it declares which roles run in what order. Loop behavior is intrinsic to each role (coordinator loops until all tasks are Done; others run once).

```
cosmonauts run chain "planner -> task-manager -> coordinator -> integration-verifier -> quality-manager" "design and implement auth"
```

### Bracket groups (parallel at the same stage)

Two or more roles run concurrently:

```
cosmonauts run chain "planner -> [task-manager, reviewer] -> coordinator" "design with parallel review"
```

### Fan-out (N copies of a role)

Spawns N instances of the same role in parallel:

```
cosmonauts run chain "coordinator -> reviewer[3]" "review with multiple reviewers"
```

> **Fan-out note:** `reviewer[3]` sends the **same prompt** to all three instances — it does not shard tasks or assign different work to each instance.

### Safety caps

`maxTotalIterations` (default 50) and `timeoutMs` (default 30 min) are global, not per-stage. `chain_run` also accepts `spawnTimeoutMs` for each stage's child-spawn completion wait (default 300000ms / 5 min). For implementation batches of roughly four or more tasks, prefer Drive: long coordinator loops can spend the shared chain deadline waiting on worker dispatches, while Drive tracks each task as its own driver step.

### Events & stats

`runChain()` emits `ChainEvent`s via the `onEvent` callback in `ChainConfig` (these are Cosmonauts-level events, distinct from Pi's lifecycle events). The authoritative union is `ChainEvent` in `lib/orchestration/types.ts`; the families are:

- **Chain**: `chain_start` (`steps`), `chain_end` (`result`, includes `result.stats?: ChainStats`)
- **Stage**: `stage_start`, `stage_end`, `stage_iteration` (per loop iteration), `stage_stats` (per successful spawn — carries a `SpawnStats`)
- **Parallel groups**: `parallel_start`, `parallel_end`
- **Agent**: `agent_spawned`, `agent_completed`, `spawn_completion`; `agent_turn` and `agent_tool_use` forward a Pi `SpawnEvent` (turn boundaries, compaction, `tool_execution_*`) annotated with `role`/`sessionId` — useful for cross-agent progress monitoring without subscribing to each session
- **`error`**: `message`, optional `stage`

Cost/usage data is ephemeral (shown in CLI output and on events; not persisted to disk):

```typescript
interface SpawnStats { tokens: TokenStats; cost: number; durationMs: number; turns: number; toolCalls: number }
interface StageStats { stageName: string; iterations: number; stats: SpawnStats }
interface ChainStats { stages: StageStats[]; totalCost: number; totalTokens: number; totalDurationMs: number }
```

## Named Chains

The primary CLI interface for multi-agent pipelines is `cosmonauts run chain`. Built-in defaults live in `bundled/coding/chains.ts` and are inherited automatically. Add a `chains` block to `.cosmonauts/config.json` only to override a chain by name or define a new one; project entries take precedence over domain entries on name collision.

| Name | Chain | Purpose |
|------|-------|---------|
| `plan-and-build` | `planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Full pipeline with adversarial plan review |
| `implement` | `task-manager → coordinator → integration-verifier → quality-manager` | From an existing approved plan |
| `verify` | `quality-manager` | Review + remediation on existing changes |
| `spec-and-build` | `spec-writer → planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Interactive spec capture then reviewed build |
| `adapt` | `planner → task-manager → coordinator → integration-verifier → quality-manager` | Planner studies a reference codebase path and adapts patterns |

Test-first is the `planner`'s baseline: every plan it produces is behavior-driven and implemented test-first, so `plan-and-build` and `spec-and-build` cover what used to be a separate TDD workflow. Adaptation is likewise a `planner` mode — point it at a reference codebase path and the `adapt` named chain handles it.

Every design-driven default includes `plan-reviewer` as a mandatory adversarial step before task creation. For code-time review, `quality-manager` internally triages which specialist lenses (security, performance, UX) apply to the diff and spawns the applicable ones in parallel alongside the generalist `reviewer`.

Run `cosmonauts run chain list` for the live list, including any project-level overrides.

## Drive

`cosmonauts run drive` is the CLI verb for driver runs: inline mode runs inside the host assistant session, while detached mode writes a frozen run directory and continues independently. A detached launcher returning is not the run completing; use the printed `runId` with `cosmonauts run status <runId>` to poll. When mode is omitted, both the CLI and `run_driver` default to detached for 4 or more tasks and inline for smaller task sets. The driver tools (`run_driver`, `run_status`, `run_watch`, and deprecated `watch_events` compatibility) are exposed via the `drive` capability, loaded by `main/cosmo` and `coding/cody`. The detailed run knowledge (backends, modes, commit policy, resume) lives in `/skill:drive`.

Run state lives under `missions/sessions/<scope>/runs/<runId>/`. For Drive, the scope is the plan slug; for graph-backed chains, the scope is `chain`. Use `cosmonauts run status`, `cosmonauts run watch`, and `cosmonauts run list` for normalized observation; use `watch_events` only when a caller needs legacy Drive cursor compatibility.

Each Drive task has a per-backend invocation timeout. The default is 1800000ms (30 minutes); use `--task-timeout` / `taskTimeoutMs` for unusually long cold-cache gates or slow external backends that need more headroom.

## CLI Surface

```
cosmonauts                                   # Interactive REPL with main/cosmo
cosmonauts -d coding                          # Interactive REPL with coding/cody
cosmonauts "design an auth system"           # Initial prompt to main/cosmo
cosmonauts -d coding "implement this task"    # Initial prompt to coding/cody
cosmonauts --print "create tasks and go"     # Non-interactive (fire-and-forget)
cosmonauts run chain plan-and-build "auth"    # Named chain
cosmonauts run chain "planner -> coordinator" # Raw chain DSL
cosmonauts run drive --plan auth-system       # Driver task runs
cosmonauts run status run-abc --scope chain   # Normalized run status
cosmonauts export --definition agent-package.json --out bin/agent
cosmonauts export coding/explorer --target claude-cli --out bin/explorer
```

Key flags:

- `-a, --agent <id>` — choose agent (use `--list-agents` to see available)
- `-d, --domain <id>` — set domain context for unqualified IDs
- `--print` — non-interactive mode
- `--model <provider/model-id>` — override default model
- `--thinking [level]` — set thinking level
- `--list-domains`, `--list-agents`
- `--dump-prompt -a <id>` — print the composed system prompt for an agent

Run `cosmonauts --help` for the full list.

## Tools the agents use

Two key orchestration tools live in the `spawning` capability (`domains/shared/capabilities/spawning.md`), available to any agent that lists it:

- **`spawn_agent`** — agent-only, non-blocking delegation; returns a spawn ID immediately, child runs inline to the parent session's orchestration context, completion arrives as a follow-up turn. It is not a public `cosmonauts run` subcommand and does not expose a nested run ID.
- **`chain_run`** — runs a chain expression as a single tool call.

See `domains/shared/capabilities/spawning.md` for usage patterns and the parallel-spawning protocol.
