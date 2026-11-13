# Orchestration

Cosmonauts coordinates agents across a spectrum: from a single agent answering directly, to fully automated chain runs, to Drive-backed task batches, to always-on agents pairing with humans. The public surface now centers on `cosmonauts run`: named chains, Drive task runs, and normalized `status` / `watch` / `list` observation all produce a `runId` when they create durable run state.

## Drive retries

Drive announces each in-run contradicted-path re-spawn in legacy
`events.jsonl` with `task_retry` before the next `spawn_started`. Its
`trigger: "contradicted-path"`, `contradicted.path` (verified on disk), and
one-based `attemptNumber` identify why and which invocation follows. Live
subscribers receive the retry event; normalized activity retains it and the
first attempt's failure/block evidence without marking the durable task step
terminal. The task remains running across the two attempts. No re-spawn means
no retry event. A finalizer resumed without the local attempt number records
`attempt unknown`, not an inferred attempt 1.

## Packaged agents and export

The CLI provides a standalone packaged-agent export path. A packaged agent is an external-safe agent bundle designed for a target runtime instead of a normal Pi-backed Cosmonauts session. Supported targets are `claude-cli` (the default) and `codex`: `cosmonauts export` compiles a package into a binary backed by the target's CLI (Claude Code or Codex) that can be moved to another project and invoked directly.

The source of truth is an `AgentPackageDefinition` JSON file. A definition declares the package id, optional source-agent provenance, prompt source (`file`, `inline`, or compatible `source-agent`), tool preset, skill selection, omitted project context, and one canonical registry target block (`targets.claude` or `targets.codex`) with options such as Claude prompt mode or exact allowed tools. The serialized CLI/package labels remain `claude-cli, codex` for compatibility. The builder derives an `AgentPackage` from that definition: the compiled artifact contains final system-prompt text, embedded full skill markdown, source metadata, tool policy, and Claude target options. The binary embeds the `AgentPackage`; it does not read package data from the Cosmonauts repo at runtime.

There are two export invocation forms:

```bash
cosmonauts export --definition packages/my-agent/agent-package.json --out bin/my-agent
cosmonauts export <domain>/<agent> --target claude-cli --out bin/agent-claude
```

Every export flows through an `AgentPackageDefinition`. The `<agent-id>` shorthand generates one from the source agent and is compatibility-gated because raw internal prompts may mention Cosmonauts-only tools, extensions, or subagents. Planner-like packages should use an explicit definition with a reviewed external-safe prompt.

Export is separate from orchestration execution; chains do not dispatch stages to packaged-agent binaries, and Drive still uses its existing backends. Exported binaries are standalone runtime artifacts only.

## Chain Runner

The role names below are examples supplied by a consumer. Cosmonauts declares none of them.

Runs agent pipelines using Pi sessions. The DSL is pure topology - it declares which roles run in what order. Loop behavior comes from declarations and explicit completion policies; a loop needs a state evaluator. No role name implies a task-completion check.

```
cosmonauts run chain "planner -> task-manager -> coordinator" "design and implement auth"
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

> **Fan-out note:** `reviewer[3]` sends the **same prompt** to all three instances - it does not shard tasks or assign different work to each instance.

### Safety caps

`maxTotalIterations` (default 50) and `timeoutMs` (default 30 min) are global, not per-stage. Both the inline and the durable runner enforce the deadline between steps: once it passes, no new step starts, a step already running (or a parallel group already started) finishes, the result has `success: false`, and `errors` names the timeout. A durable run that times out is recorded as failed. An abort takes precedence and adds no timeout error. `chain_run` also accepts `spawnTimeoutMs` for each stage's child-spawn completion wait (default 300000ms / 5 min). For implementation batches of roughly four or more tasks, prefer Drive: long coordinator loops can spend the shared chain deadline waiting on worker dispatches, while Drive tracks each task as its own driver step.

### Events & stats

`runChain()` emits `ChainEvent`s via the `onEvent` callback in `ChainConfig` (these are Cosmonauts-level events, distinct from Pi's lifecycle events). The authoritative union is `ChainEvent` in `lib/orchestration/types.ts`; the families are:

- **Chain**: `chain_start` (`steps`), `chain_end` (`result`, includes `result.stats?: ChainStats`)
- **Stage**: `stage_start`, `stage_end`, `stage_iteration` (per loop iteration), `stage_stats` (per successful spawn - carries a `SpawnStats`)
- **Parallel groups**: `parallel_start`, `parallel_end`
- **Agent**: `agent_spawned`, `agent_completed`, `spawn_completion`; `agent_turn` and `agent_tool_use` forward a Pi `SpawnEvent` (turn boundaries, compaction, `tool_execution_*`) annotated with `role`/`sessionId` - useful for cross-agent progress monitoring without subscribing to each session
- **`error`**: `message`, optional `stage`

Cost/usage data rides on the events and the returned `ChainResult`:

```typescript
interface SpawnStats { tokens: TokenStats; cost: number; durationMs: number; turns: number; toolCalls: number }
interface StageStats { stageName: string; iterations: number; stats: SpawnStats }
interface ChainStats { stages: StageStats[]; totalCost: number; totalTokens: number; totalDurationMs: number }
```

Both chain paths report it the same way. `runChain` (inline) emits `stage_stats` from each spawn. `runDurableChain` appends each successful spawn's `SpawnStats` to the run's event log as a `step_tool_activity` whose `details` are `{ source: "chain", kind: "chain_stage_stats", role, stats }` (`missions/sessions/chain/runs/<runId>/events.jsonl`). It replays them as `stage_stats`, sets each stage result's `stats`, and takes the stage's `durationMs` from its `step_started` → terminal step timestamps. The CLI prints every `stage_stats` with agent ms (`agent=`), cost, the input/output/cacheRead/cacheWrite/total token breakdown, turns, and tool calls, and prints the `ChainStats` totals on `chain_end`. `--profile` also writes each `stage_stats` as an instant (`ph: "I"`) stage entry carrying the full `SpawnStats`, and adds a `Stage Stats` section to the summary. Without `--profile`, an inline chain persists nothing.

`SpawnStats.durationMs` is agent time: it runs from the prompt to completion and leaves out session creation, spawner cleanup, and the durable runner's post-spawn work. `ChainStats.totalDurationMs` (printed as `agent time=` on `chain_end`) sums those agent times; on the inline path a parallel group contributes its group wall-clock instead. A stage's true wall time is the `durationMs` on its `stage_end` (and, on the durable path, the gap between its step timestamps). Stages without successful spawn statistics emit no `stage_stats` and add nothing to those totals.

`SpawnStats` come from Pi's `session.getSessionStats()`, so they include Pi's prompt-cache warming (default `cacheWarming: "streaming"` in the pinned Pi 1.0.3): while a session waits in a long tool call (a parent blocked on `spawn_agent`, a chain, `run_driver`, or a slow test run), Pi may send small cache-refresh requests when it estimates they save more than they cost. They add tokens and cost to that session's stats (and use subscription quota), not model context. Cosmonauts keeps Pi's default. It is a global Pi setting (`cacheWarming: off | streaming | idle` in `~/.pi/agent/settings.json` by default); spawns built with in-memory settings (compaction config) do not read that file and always use the default.

## Named Chains

The primary CLI interface for multi-agent pipelines is `cosmonauts run chain`. Named chains come from installed or supplied domains. Add a `chains` block to `.cosmonauts/config.json` only to override a chain by name or define a new one; project entries take precedence over domain entries on name collision.

Run `cosmonauts run chain list` for the live list, including any project-level overrides.

### Plan-review revision and halt contract

Review and revision purposes are explicit stage metadata or supplied by a consumer chain adapter. Core does not infer purpose from a role spelling. `purpose` names producer `targetStageIds`; `reviewTarget` names eligible `producerStageIds`, and `requiresPlanReviewTarget` opts a stage into the pre-spawn gate.

For a participating plan-review cycle, the reviewer writes its review artifact
and must finish with exactly one report as its last nonblank line:

```text
COSMO_PLAN_REVIEW: {"planSlug":"<slug>","reviewRound":<positive integer>}
```

The report binds the run to one active plan and its safe latest assessable review
round. If the chain already supplies an expected plan slug, the report must name
that slug. The revising stage receives that bound slug and round, addresses every
high- and medium-severity finding with an exact round-qualified reference in a
parseable Decision Log entry that has a `Decision:` field, and must finish with
exactly one of these reports as its last nonblank line:

```text
COSMO_REVIEW_REVISION: {"planSlug":"<same slug>","reviewRound":<same positive integer>,"status":"addressed"}
COSMO_REVIEW_REVISION: {"planSlug":"<same slug>","reviewRound":<same positive integer>,"status":"unaddressed","reason":"<nonempty reason>"}
```

A guarded stage (`requiresPlanReviewTarget`) fails closed. Immediately before it can spawn, the runtime rechecks the bound plan and requires matching addressed
evidence produced at a strictly lower top-level topology index. Missing,
mismatched, stale, unreadable, or same-index evidence emits the typed
`unaddressed_review_round` event, makes the step and chain unsuccessful, and
does not spawn the guarded stage.

The reviser must finish at a strictly earlier top-level topology index than the guarded stage. Siblings in the same bracket group have no declared order, so same-index evidence cannot satisfy the gate. After a halt, correct the artifact or references and rerun. There is no automatic continuation from an inline halt.

## Drive

Drive protects previous attempts' dirty tracked and non-ignored untracked work by writing a commit through a temporary Git index immediately before each spawn on either Drive path, for all backends. It excludes Drive's own `missions/sessions/` run artifacts (normally gitignored) and never applies stash state. The `spawn_started.worktreeSnapshot` event names `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>`; non-success attempt records include it under the Drive outcome-and-attempt heading in task notes, while success attempts leave no note. Blocked, partial, and aborted tasks retain these refs, while Done task refs are removed. Inspect with `git diff HEAD <ref>` or `git show <ref>:<path>` and restore only the needed files (`git restore --source=<ref> -- <tracked-path>`, or write the `git show` output for a previously untracked path). Snapshots do not restore automatically and do not capture ignored files or changes made after the snapshot.

Only Drive Pi workers block destructive executable-position Git in Bash `tool_call`, with a safety explanation, the latest task snapshot ref when present, and a non-destructive alternative. Non-Drive sessions, read-only Git, and add/commit remain unchanged. External backends rely on the snapshot, not Pi interception. Command substitution, aliases, and redirect-overwrite remain classifier residuals; a snapshot mitigates their loss risk but does not make these commands safe.

Drive accepts `success` (also `completed`), `failure`, `partial`, and `blocked` backend reports; unparseable output becomes `unknown`. Workers append durable task notes via `task_edit` or CLI `--append-notes`, not final-response prose; Drive preserves them across status transitions and adds its own attempt records under Drive outcome-and-attempt headings. An explicit `outcome: blocked` reports a human stop: Drive records the reason verbatim, runs no postflight, and never retries the attempt, even for a contradicted path. A worker who claims a source site is unreached must quote a usable-zero `execution_probe` result (exit 0, verified restoration, no other tracked-file side effects). Under `backend-commits`, a blocked worker must not commit before stopping; if HEAD moved, Drive reports the range as unverified.

`cosmonauts run drive` is the CLI verb for driver runs: inline mode runs inside the host assistant session, while detached mode writes a frozen run directory and continues independently. A detached launcher returning is not the run completing; use the printed `runId` with `cosmonauts run status <runId>` to poll. When mode is omitted, both the CLI and `run_driver` default to detached for 4 or more tasks and inline for smaller task sets. The orchestration extension registers `run_driver`, `run_status`, `run_watch`, and deprecated `watch_events` compatibility. Consumer prompt text alone does not expose tools. `cosmonauts-subagent` is inline-only; `codex` and `claude-cli` are detached-only. A successful `run_driver` response prints labeled `workdir:` and `eventLogPath:` locations so print-mode callers can inspect the run. Project preflight and postflight commands do not inherit `COSMONAUTS_DRIVER_*` control variables; backend selection still reads them. Driver-created source commits use a safe report summary or the task title, never report JSON or an outcome marker. Dirty-worktree snapshot refs are removed on Done only when the final tree contains every snapshotted byte; otherwise retained refs appear in the terminal completion record and `run_completed` summary. Each run supplies an explicit envelope. See `lib/driver/README.md` for backend environment controls.

Run state lives under `missions/sessions/<scope>/runs/<runId>/`. For Drive, the scope is the plan slug; for graph-backed chains, the scope is `chain`. Use `cosmonauts run status`, `cosmonauts run watch`, and `cosmonauts run list` for normalized observation; use `watch_events` only when a caller needs legacy Drive cursor compatibility.

Each Drive task has a per-backend invocation timeout. The default is 1800000ms (30 minutes); use `--task-timeout` / `taskTimeoutMs` for unusually long cold-cache gates or slow external backends that need more headroom.

## CLI Surface

```
cosmonauts                                   # Interactive REPL with the default domain lead
cosmonauts -d <domain>                        # Interactive REPL for a domain
cosmonauts "design an auth system"           # Initial prompt
cosmonauts --print "create tasks and go"     # Non-interactive prompt and exit
cosmonauts run chain <name> "auth"           # Named chain
cosmonauts run chain "planner -> coordinator" # Raw chain DSL
cosmonauts run drive --plan auth-system --envelope ./drive-envelope.md
cosmonauts run status run-abc --scope chain   # Normalized run status
cosmonauts harness sync --check --json        # Read-only harness drift report
cosmonauts export --definition agent-package.json --out bin/agent
cosmonauts export <domain>/<agent> --target claude-cli --out bin/agent
```

Key flags:

- `-a, --agent <id>` - choose agent (use `--list-agents` to see available)
- `-d, --domain <id>` - set domain context for unqualified IDs
- `--print` - non-interactive mode
- `--model <provider/model-id>` - override default model
- `--thinking [level]` - set thinking level
- `--list-domains`, `--list-agents`
- `--dump-prompt -a <id>` - print the composed system prompt for an agent

Run `cosmonauts --help` for the full list.

### Harness adapter synchronization

The registered harness surface is:

```text
cosmonauts harness sync [--target <id>] [--scope project|personal]
  [--kind skill|command] [--asset <assetId>] [--copy|--link]
  [--check] [--forget-removed <assetId>] [--transfer-owner <ownerId>]
  [--json|--plain]
```

The four selectors are repeatable and deduplicated. Omitted target selects supported Claude and Codex adapters. Omitted scope applies descriptor defaults: consumer skills use project scope. Explicit scope overrides descriptor defaults. Supplying any `--asset` makes the run partial; kind and asset filters isolate only matching catalogue rows. Consumers supply skill sources; no external bundle or commands ship with the library. `--copy` and `--link` are mutually exclusive. See command help for selection and ownership operations.

The report has exactly four public states: `missing`, `current`, `source-ahead`, and `locally-edited`. Each row exposes owner kind/ID/diagnostics, target/scope/kind/asset, absolute source and target, recorded/requested mode, before state and reason, action and final state, recovery/evidence/discovery detail, and release warnings. Use `--json` for structured output or `--plain` for tab-separated rows.

Normal sync exits nonzero when any row has a conflict, incomplete inventory, ambiguous recovery, evidence-required state, containment or write failure, or unconfirmed release. `--check` is stricter: it exits nonzero for every non-`current` row, performs stable double-read observation, and never calls transaction or materialization code. Forget cannot combine with check, mode, explicit asset selection, or transfer. Transfer requires explicit asset IDs and cannot combine with check, mode, or forget.

The legacy `cosmonauts skills export` command is a partial skill-only facade over the same discovery, descriptor, renderer, classifier, and transaction path. Named and `--all` exports never infer removal for retired bundle entries, commands, or omitted skills.

## Tools the agents use

The public entry `cosmonauts/extensions/orchestration` exports `createOrchestrationExtension(runtime)`, which binds tools to the supplied runtime. A consumer may also provide its session extension factory through runtime extension providers. The CLI registers an `orchestration` extension provider bound to its base execution runtime; an agent receives these tools only when its `extensions` list names `orchestration`. Domain-declared agents also need that name provided in their domain resource order to pass validation; see [Library surface](library-surface.md#extension-providers-and-session-policy).

- **`spawn_agent`** - agent-only, non-blocking delegation; returns a spawn ID immediately. Completion arrives as a follow-up turn. It is not a public run subcommand and does not expose a nested run ID.
- **`chain_run`** - runs a chain expression as a single tool call and checks the caller's subagent grants.
- **`run_driver`** - starts a plan-linked task run and returns a run ID.
- **`run_status`**, **`run_watch`** - normalized status and event observation. For Drive, pass the plan slug as scope.
- **`watch_events`** - deprecated Drive compatibility view with legacy cursor semantics.

The public TypeScript entries are `cosmonauts/chains` (`selectChain`, `runConfiguredChain`), `cosmonauts/orchestration/chain-runner` (`runChain`), and `cosmonauts/orchestration/durable-chain-runner` (`runDurableChain`). Execution configuration carries an explicit runtime and registry. See [Library surface](library-surface.md).
