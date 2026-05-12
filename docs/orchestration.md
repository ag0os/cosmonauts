# Orchestration

Cosmonauts coordinates agents across a spectrum: from a single agent answering directly, to fully automated chain runs, to always-on agents pairing with humans. Drive and chains will merge into a unified surface; for now they're complementary.

## Packaged agents and export

Phase 1 adds a standalone packaged-agent export path. A packaged agent is an external-safe agent bundle designed for a target runtime instead of a normal Pi-backed Cosmonauts session. The initial target is `claude-cli`: `cosmonauts export` compiles a package into a Claude Code CLI-backed binary that can be moved to another project and invoked directly.

The source of truth is an `AgentPackageDefinition` JSON file. A definition declares the package id, optional source-agent provenance, prompt source (`file`, `inline`, or compatible `source-agent`), tool preset, skill selection, omitted project context, and target options such as Claude prompt mode or exact allowed tools. The builder derives an `AgentPackage` from that definition: the compiled artifact contains final system-prompt text, embedded full skill markdown, source metadata, tool policy, and Claude target options. The binary embeds the `AgentPackage`; it does not read package data from the Cosmonauts repo at runtime.

There are two export invocation forms:

```bash
cosmonauts export --definition packages/cosmo-planner/package.json --out bin/cosmo-planner
cosmonauts export coding/explorer --target claude-cli --out bin/explorer-claude
```

Every export flows through an `AgentPackageDefinition`. The `<agent-id>` shorthand generates one from the source agent and is compatibility-gated because raw internal prompts may mention Cosmonauts-only tools, extensions, or subagents. Planner-like packages should use an explicit definition with a reviewed external-safe prompt.

Phase 1 export is intentionally separate from orchestration execution. Existing chain runner behavior is unchanged, and Drive behavior is unchanged; chains do not dispatch stages to packaged-agent binaries, and Drive still uses its existing backends. Exported binaries are standalone runtime artifacts only.

## Chain Runner

Runs agent pipelines using Pi sessions. The DSL is pure topology — it declares which roles run in what order. Loop behavior is intrinsic to each role (coordinator loops until all tasks are Done; others run once).

```
cosmonauts --chain "planner -> task-manager -> coordinator -> integration-verifier -> quality-manager" "design and implement auth"
```

### Bracket groups (parallel at the same stage)

Two or more roles run concurrently:

```
cosmonauts --chain "planner -> [task-manager, reviewer] -> coordinator" "design with parallel review"
```

### Fan-out (N copies of a role)

Spawns N instances of the same role in parallel:

```
cosmonauts --chain "coordinator -> reviewer[3]" "review with multiple reviewers"
```

> **Fan-out note:** `reviewer[3]` sends the **same prompt** to all three instances — it does not shard tasks or assign different work to each instance.

### Safety caps

`maxTotalIterations` (default 50) and `timeoutMs` (default 30 min) are global, not per-stage.

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

## Named Workflows

The primary user interface for multi-agent pipelines. Built-in defaults live in `bundled/coding/coding/workflows.ts` (mirrored in `lib/config/defaults.ts`) and can be overridden or extended via `.cosmonauts/config.json`.

| Name | Chain | Purpose |
|------|-------|---------|
| `plan-and-build` | `planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Full pipeline with adversarial plan review |
| `implement` | `task-manager → coordinator → integration-verifier → quality-manager` | From an existing approved plan |
| `verify` | `quality-manager` | Review + remediation on existing changes |
| `spec-and-build` | `spec-writer → planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Interactive spec capture then reviewed build |
| `adapt` | `planner → task-manager → coordinator → integration-verifier → quality-manager` | Planner studies a reference codebase path and adapts patterns |

Test-first is the `planner`'s baseline: every plan it produces is behavior-driven and implemented test-first, so `plan-and-build` and `spec-and-build` cover what used to be a separate TDD workflow. Adaptation is likewise a `planner` mode — point it at a reference codebase path and the `adapt` workflow handles it.

Every design-driven default includes `plan-reviewer` as a mandatory adversarial step before task creation. For code-time review, `quality-manager` internally triages which specialist lenses (security, performance, UX) apply to the diff and spawns the applicable ones in parallel alongside the generalist `reviewer`.

Run `cosmonauts --list-workflows` for the live list, including any project-level overrides.

## Drive

`cosmonauts drive` is the CLI verb for driver runs: inline mode runs inside the host assistant session, while detached mode writes a frozen run directory and continues independently. The driver tools (`run_driver`, `watch_events`) are exposed via the `drive` capability, loaded by `main/cosmo` and `coding/cody`. The detailed run knowledge (backends, modes, commit policy, resume) lives in `/skill:drive`.

> Drive and chains will eventually merge into one orchestration surface. For now they overlap: chains are the established, well-exercised path; Drive is newer and adds detached execution and external backends (`codex`, `claude-cli`). Agents that can do both follow what the user asks for and default to a chain when unspecified.

## CLI Surface

```
cosmonauts                                   # Interactive REPL with main/cosmo
cosmonauts -d coding                          # Interactive REPL with coding/cody
cosmonauts "design an auth system"           # Initial prompt to main/cosmo
cosmonauts -d coding "implement this task"    # Initial prompt to coding/cody
cosmonauts --print "create tasks and go"     # Non-interactive (fire-and-forget)
cosmonauts --workflow plan-and-build "auth"   # Named workflow
cosmonauts --chain "planner -> coordinator"  # Raw chain DSL
cosmonauts drive                              # Driver task runs
cosmonauts export --definition package.json --out bin/agent
cosmonauts export coding/explorer --target claude-cli --out bin/explorer
```

Key flags:

- `-a, --agent <id>` — choose agent (use `--list-agents` to see available)
- `-d, --domain <id>` — set domain context for unqualified IDs
- `--workflow <name|expression>` — named workflow or raw chain
- `--chain <expression>` — raw chain DSL
- `--print` — non-interactive mode
- `--model <provider/model-id>` — override default model
- `--thinking [level]` — set thinking level
- `--list-domains`, `--list-workflows`, `--list-agents`
- `--dump-prompt -a <id>` — print the composed system prompt for an agent

Run `cosmonauts --help` for the full list.

## Tools the agents use

Two key orchestration tools live in the `spawning` capability (`domains/shared/capabilities/spawning.md`), available to any agent that lists it:

- **`spawn_agent`** — non-blocking; returns a spawn ID immediately, child runs detached, completion arrives as a follow-up turn.
- **`chain_run`** — runs a chain expression as a single tool call.

See `domains/shared/capabilities/spawning.md` for usage patterns and the parallel-spawning protocol.
