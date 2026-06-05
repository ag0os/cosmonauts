---
title: Orchestration Surface Consolidation (Durable Orchestration Wave 2)
status: active
createdAt: '2026-06-05T20:24:55.570Z'
updatedAt: '2026-06-05T20:38:51.862Z'
---

## Overview

Wave 2 consolidates the orchestration **surface** now that Wave 1 has unified the durable runtime substrate. The source of truth is:

- `missions/architecture/spikes/orchestration-surface-consolidation.md`, especially §10; §§5–8 are historical and superseded where they differ.
- `missions/architecture/durable-orchestration-runtime.md`, decisions `D-011` through `D-016` and `## Wave 2 — Orchestration Surface Consolidation`.

End state: graph-backed orchestration frontends share one internal `runStart` seam, durable run IDs identify graph-backed chain/Drive runs, `run_status`/`run_watch` are the normalized read surface, `watch_events` is a deprecated compatibility view over normalized events, the CLI surface is `cosmonauts run chain|drive|status|watch|list`, saved “workflows” become **named chains**, and `spawn_agent` is modeled as the inline-default 1-node compiler while keeping its current agent-only `spawnId` runtime behavior.

**Group A decision:** Group A is the first task wave of this one plan, not a separate foundational plan. It should be an independently reviewable first PR/checkpoint because the `runStart` refactor is load-bearing and must be characterization-guarded before B/C/D proceed. It should not be a separate plan because it has little user-visible value alone, the acceptance bar is the cross-surface consolidation, and splitting would duplicate the same architecture context, quality gates, and behavior spine. Treat it as **one plan, first merge gate**: A must land green before B/C/D start.

## Architecture Context

Relevant architecture decisions:

- `D-011`: introduce internal `runStart`; make `runId` + `scope` the graph-backed observation currency; promote `run_status`/`run_watch`; demote `watch_events` to compatibility view.
- `D-012`: chain, Drive, and spawn remain distinct compilers; Drive inline/detached is durable-location, not the inline/durable execution axis.
- `D-013`: `cosmonauts run` is the orchestration CLI surface; JSON stdout, progress stderr; no `run spawn`.
- `D-014`: spawn is the inline-default 1-node compiler; nested-run is deferred; `watch_events` compatibility is over normalized observation.
- `D-015`: “workflow” collapses into “chain”; saved pipelines are named chains. Shipped data shape is `{ name; description; chain }`.
- `D-016`: no parallel mutable execution, no worktrees, no fan-out cap tuning in this plan.

Shipped-type corrections this plan must honor:

- `runStart` does not exist yet.
- Shipped `RunRecord` in `lib/durable-runtime/types.ts` has no `kind`, `parentRunId`, or `parentStepId`.
- Shipped `WorkflowDefinition` uses `name`, not `id`; the rename keeps `name`, `description`, and `chain`.
- `nested-run` is not a known backend; known names are `codex`, `claude-cli`, `cosmonauts-subagent`, and `shell-command`.
- `child_run_started` is defined/renderable but not emitted by current runtime paths; do not build nested-run behavior.

Current code seams verified for this plan:

- `lib/orchestration/durable-chain-runner.ts` directly creates the chain store/ref/run, writes graph/steps/events, runs scheduler passes, and reconstructs `ChainResult`.
- `lib/driver/drive-graph-runner.ts` owns the Drive store/ref, scheduler drain, finalizer polling, and result mapping; `lib/driver/drive-graph-compiler.ts` currently creates/writes the Drive run graph and pending step records.
- `domains/shared/extensions/orchestration/chain-tool.ts` keeps `chain_run` blocking and routes loop/completion chains to `runChain` inline.
- `domains/shared/extensions/orchestration/driver-tool.ts` returns `runId`, `planSlug`, `workdir`, and `eventLogPath`, but no explicit `scope` yet.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` currently reads Drive `events.jsonl` via `tailEvents`.
- `domains/shared/extensions/orchestration/run-control-tools.ts` already registers read-only `run_status`/`run_watch` over `FileRunStore` and `controller.ts`.
- `cli/main.ts` currently exposes `-w/--workflow` and `--list-workflows`; there is no `cosmonauts run` subcommand.
- `cli/drive/subcommand.ts` currently owns Drive CLI run/status/list JSON behavior.
- `lib/workflows/types.ts` and `lib/workflows/loader.ts` currently own named pipeline loading; domain files are `workflows.ts`.
- `domains/shared/extensions/orchestration/spawn-tool.ts` currently keeps `spawn_agent` as a non-blocking in-memory `spawnId` path backed by `SpawnTracker`; this hot path stays semantically unchanged.

Non-goals that are blockers if introduced:

- Do **not** migrate chain loops or coordinator waiting off the legacy inline path.
- Do **not** add `RunRecord.parentRunId`, `RunRecord.parentStepId`, a run `kind` discriminator, or a `nested-run` backend.
- Do **not** add per-step worktrees, merge finalizers, approval gates, worktree isolation, parallel mutable execution, or read-only fan-out cap tuning.
- Do **not** keep old CLI names as a final compatibility commitment. Temporary aliases are acceptable during implementation only; final docs/prompts/code point at `cosmonauts run` and named chains.

## Behaviors

### B-001 - `runStart` creates or adopts a graph run exactly once

- Source: AC-001, AC-008, D-011
- Context: a frontend has compiled a `RunGraph`, selected a `RunRef`, and built a scheduler backend map using shipped `RunRecord`/`StepRecord` types.
- Action: it calls `runStart` with create-run inputs, graph, initial step records, scheduler options, and holder ID.
- Expected: if the run is missing, `runStart` creates `RunRecord`, writes `graph.json`, seeds pending step records, appends one normalized `run_started`, and drives scheduler passes; if the run already exists, it loads persisted `run.json`, `graph.json`, and step records rather than overwriting correctness-critical persisted state.
- Seam: `lib/durable-runtime/run-start.ts` > `runStart`
- Test: `tests/durable-runtime/run-start.test.ts` > `creates or adopts a graph run and seeds pending steps exactly once`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-001`

### B-002 - Durable chain state and result semantics survive the `runStart` refactor

- Source: AC-001, AC-002, D-011
- Context: a loop-free chain expression compiles to a durable graph and runs with a fake `cosmonauts-subagent` backend under deterministic IDs/time.
- Action: `runDurableChain` routes through `runStart` instead of creating the run and scheduler loop itself.
- Expected: persisted run files and reconstructed `ChainResult` match the pre-refactor characterization shape; `chain_run` remains blocking and unchanged except for added run metadata.
- Seam: `lib/orchestration/durable-chain-runner.ts` > `runDurableChain`; `lib/durable-runtime/run-start.ts` > `runStart`
- Test: `tests/orchestration/run-start-chain-characterization.test.ts` > `preserves durable chain run files and ChainResult through runStart`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-002`

### B-003 - Drive graph state, result mapping, and frozen-detached safety survive `runStart`

- Source: AC-001, AC-002, AC-008, D-011
- Context: a graph-backed Drive run starts inline or detached with deterministic task fixtures and fake backends.
- Action: `runDriveOnGraph` uses `runStart` for shared create/write/seed/scheduler work while Drive keeps finalizer-failure polling, legacy events, completion-file writing, and safe scheduler event writes at the Drive edge.
- Expected: Drive `DriverResult`, compatibility files, graph/step records, and detached frozen-runner behavior match current graph-backed Drive characterization; detached scheduler execution still happens inside `lib/driver/run-step.ts` / `bin/cosmonauts-drive-step`.
- Seam: `lib/driver/drive-graph-runner.ts` > `runDriveOnGraph`; `lib/driver/run-step.ts` > `runWithLock`; `lib/durable-runtime/run-start.ts` > `runStart`
- Test: `tests/driver/drive-run-start-characterization.test.ts` > `preserves graph-backed Drive files results and detached frozen runner through runStart`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-003`

### B-004 - `runStart` rehydrates persisted state on resume instead of fabricating defaults

- Source: AC-001, AC-008, D-011
- Context: a process resumes a run whose in-memory scheduler state is empty but whose run directory contains graph, step, attempt, heartbeat, metadata, and terminal/blocked evidence.
- Action: a frontend calls `runStart` with a graph compiled from current inputs.
- Expected: `runStart` loads persisted graph/step/run state before scheduling, does not rewrite existing results or authoritative Drive metadata, and lets the scheduler reconcile from durable records.
- Seam: `lib/durable-runtime/run-start.ts` > `ensureRunInitialized`; `lib/driver/drive-graph-runner.ts` > resume/load boundary
- Test: `tests/durable-runtime/run-start-resume.test.ts` > `rehydrates persisted graph and step records before scheduling a resumed run`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-004`

### B-005 - `chain_run` returns run metadata for graph-backed chains while keeping blocking convenience

- Source: AC-002, D-011
- Context: an agent calls `chain_run` with a loop-free supported expression.
- Action: the tool blocks until completion, as it does today.
- Expected: the tool still returns the final `ChainResult` and progress lines, and structured details additionally include `{ runId, scope: "chain" }`. Loop/completion chains still route to `runChain` inline and are explicitly non-durable/no-run-record.
- Seam: `domains/shared/extensions/orchestration/chain-tool.ts` > `registerChainTool`; `lib/orchestration/types.ts` > `ChainResult`
- Test: `tests/extensions/orchestration-chain-tool-observation.test.ts` > `returns runId and scope for durable chain_run without changing blocking result semantics`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-005`

### B-006 - Agent-facing Drive starts expose the Drive scope for normalized observation

- Source: AC-002, D-011
- Context: an agent calls `run_driver` and receives the existing start acknowledgement.
- Action: the tool returns its structured result.
- Expected: the response keeps `runId`, `planSlug`, `workdir`, and `eventLogPath`, and additionally includes `scope: planSlug` so callers can pass `{ scope, runId }` directly to `run_status`/`run_watch`.
- Seam: `domains/shared/extensions/orchestration/driver-tool.ts` > `registerDriverTool`
- Test: `tests/extensions/orchestration-driver-tool-observation.test.ts` > `returns scope alongside runId from run_driver for normalized observation`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-006`

### B-007 - Returned chain and Drive runs are observable through `run_status` and `run_watch`

- Source: AC-002, D-011
- Context: a graph-backed chain run and a Drive run have returned `{ runId, scope }` to their callers.
- Action: callers pass those values to `run_status` and `run_watch`.
- Expected: both frontends report normalized status and event pages from `RunRecord.eventsPath`; missing runs remain read-only not-found responses.
- Seam: `domains/shared/extensions/orchestration/run-control-tools.ts`; `lib/durable-runtime/controller.ts` > `runStatus` / `runWatch`
- Test: `tests/extensions/orchestration-run-control-surface.test.ts` > `observes returned chain and Drive run ids through normalized status and watch`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-007`

### B-008 - `watch_events` preserves legacy line-cursor semantics over normalized events

- Source: AC-003, D-014
- Context: a Drive run has normalized events, including Drive compatibility activity for each legacy `DriverEvent` needed by `watch_events`.
- Action: an agent calls `watch_events({ planSlug, runId, since })` with `since` omitted, zero, or a non-zero legacy cursor returned by a previous call.
- Expected: the tool does not read legacy `events.jsonl`; it reconstructs legacy `DriverEvent[]` from normalized events, filters in **legacy event index space** (`since` is the number of legacy events already consumed), and returns `cursor = total reconstructed legacy events`, matching `tailEvents` line-cursor behavior even when one legacy event maps to zero, one, or multiple canonical normalized events.
- Seam: `domains/shared/extensions/orchestration/watch-events-tool.ts`; `lib/driver/watch-events-compat.ts` (new); `lib/durable-runtime/types.ts` > `run_activity`; `lib/driver/durable-events.ts` > `normalizeDriverEvent`
- Test: `tests/extensions/orchestration-watch-events-normalized-compat.test.ts` > `preserves legacy watch_events cursor semantics over normalized events with nonzero since`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-008`

### B-009 - `watch_events` preserves legacy details and summaries from normalized Drive compatibility activity

- Source: AC-003, D-014
- Context: representative legacy Drive event variants are emitted, including variants that currently normalize to multiple events or diagnostics-only advisory data.
- Action: the normalized compatibility mapper reconstructs legacy events and `watch_events` renders compact summaries.
- Expected: reconstructed structured `events` and text summaries match the old `tailEvents`/`summarizeDriverEvent` output for run, task, backend activity, report, finalization, lock-warning, plan-completion-candidate, and terminal variants. The tool description marks `watch_events` deprecated and points new callers to `run_watch`/`run_status`.
- Seam: `lib/driver/watch-events-compat.ts` (new); `domains/shared/extensions/orchestration/watch-events-tool.ts` > `summarizeDriverEvent`
- Test: `tests/extensions/orchestration-watch-events-normalized-compat.test.ts` > `reconstructs legacy watch_events details and summaries from normalized Drive compatibility activity`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-009`

### B-010 - `cosmonauts run chain <expression>` emits JSON stdout and stderr progress

- Source: AC-004, D-013
- Context: a user invokes a loop-free ad-hoc chain through the new `run` CLI.
- Action: `cosmonauts run chain "planner -> reviewer" "prompt"` runs the same durable-or-inline routing used by the agent tool.
- Expected: stdout contains exactly one JSON value with `{ runId, scope: "chain", status, success, stageResults, ... }` for graph-backed chains; human progress goes to stderr; exit code is zero only on success. Inline loop chains remain legacy and report non-durable mode explicitly.
- Seam: `cli/run/subcommand.ts` (new) > `run chain`; `cli/chain-event-logger.ts`; `lib/orchestration/durable-chain-runner.ts`
- Test: `tests/cli/run/chain.test.ts` > `runs an ad-hoc chain with JSON stdout progress stderr and returned run id`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-010`

### B-011 - Named chains replace named workflows at the CLI

- Source: AC-004, AC-005, D-013, D-015
- Context: saved pipelines are registered as named chains with fields `{ name; description; chain }`.
- Action: a user invokes `cosmonauts run chain plan-and-build "prompt"` or `cosmonauts run chain list`.
- Expected: named chains resolve through the same chain compiler as raw expressions; `run chain list` lists names/descriptions/chains under the `run` front door; `run chain list` is JSON-native like other `run` subcommands, intentionally resolving the record’s ambiguous `chain list` note in favor of one `run` CLI surface.
- Seam: `cli/run/subcommand.ts` > `run chain`; `lib/chains/loader.ts` (new); `lib/chains/types.ts` (new)
- Test: `tests/cli/run/named-chain.test.ts` > `runs and lists named chains through the run chain CLI`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-011`

### B-012 - `cosmonauts run drive` preserves Drive semantics under the unified CLI

- Source: AC-004, D-013
- Context: a user starts an inline or detached plan-linked Drive run through the new `run` CLI.
- Action: `cosmonauts run drive --plan <slug> --backend codex --mode inline|detached ...` builds the same `DriverRunSpec` and starts the same `runInline`/`startDetached` paths.
- Expected: stdout JSON is native and contains current Drive result/start fields plus `scope: <planSlug>` and `runId`; progress/diagnostics go to stderr; detached starts return immediately; inline exit behavior matches current Drive.
- Seam: `cli/run/subcommand.ts` > `run drive`; `cli/drive/subcommand.ts` extraction/removal path; `lib/driver/driver.ts`
- Test: `tests/cli/run/drive.test.ts` > `starts inline and detached Drive runs through cosmonauts run drive with current JSON semantics`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-012`

### B-013 - `cosmonauts run status|watch|list` observes all normalized run scopes

- Source: AC-002, AC-004, D-011, D-013
- Context: chain and Drive run records exist under `missions/sessions/<scope>/runs/<runId>/`.
- Action: a user invokes `cosmonauts run status <runId>`, `cosmonauts run watch <runId>`, or `cosmonauts run list`, optionally passing a scope when ambiguous.
- Expected: status/watch resolve a unique run across scopes or fail with JSON ambiguity/not-found errors; list returns JSON summaries from `FileRunStore.listRecentRuns`; no `--json`/`--plain` flag is accepted for `run` subcommands.
- Seam: `cli/run/subcommand.ts` > `run status` / `run watch` / `run list`; `lib/durable-runtime/controller.ts`; `lib/durable-runtime/file-store.ts` > `listRecentRuns`
- Test: `tests/cli/run/observation.test.ts` > `reports status watch and list for chain and Drive runs with JSON-only output`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-013`

### B-014 - Removed CLI names and `run spawn` are not exposed in the final surface

- Source: AC-004, AC-005, AC-008, D-013, D-016
- Context: the final CLI parser is built after the `run` surface lands.
- Action: tests parse removed or explicitly rejected invocations.
- Expected: `cosmonauts run spawn` is rejected; `-p/--print` remains the single-agent CLI path; final public parser/tests/docs do not rely on `-w/--workflow`, `--list-workflows`, or bare `cosmonauts drive`.
- Seam: `cli/main.ts` > subcommand dispatch and option parser; `cli/run/subcommand.ts`
- Test: `tests/cli/run/surface-contract.test.ts` > `rejects run spawn and removed workflow or drive entry points while preserving print mode`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-014`

### B-015 - The named-chain registry replaces `lib/workflows` and preserves config precedence

- Source: AC-005, D-015
- Context: domains provide named chains as arrays of `{ name; description; chain }`, and project config overrides or adds chains with a keyed map.
- Action: domain loader, runtime bootstrap, config loader, and CLI use the new named-chain registry.
- Expected: `lib/chains/` exports `NamedChain`; domain manifests load `chains.ts`; project config uses `chains?: Record<string, { description?: string; chain: string }>` where the object key is the chain name; project config entries override domain entries by name; runtime exposes `chains`; old `WorkflowDefinition`/`lib/workflows` names are absent from the final state.
- Seam: `lib/chains/types.ts` (new); `lib/chains/loader.ts` (new); `lib/domains/loader.ts`; `lib/domains/types.ts`; `lib/runtime.ts`; `lib/config/types.ts`; `lib/config/loader.ts`; `bundled/coding/coding/chains.ts` (new)
- Test: `tests/chains/named-chain-loader.test.ts` > `loads domain arrays and project chain maps with project overrides by name`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-015`

### B-016 - Spawn has a tested 1-node graph compiler shape

- Source: AC-006, D-014
- Context: a caller has a `SpawnConfig`-like role, prompt, model/thinking/runtime context, project skills, and cwd.
- Action: it calls `compileSpawnToGraph`.
- Expected: the compiler returns a `RunGraph` with exactly one `agent` step on backend `cosmonauts-subagent`, `scope` guidance for ad-hoc top-level use, and backend options containing spawn inputs needed by the current session factory; it does not reference `nested-run` or parent run fields.
- Seam: `lib/orchestration/spawn-compiler.ts` (new) > `compileSpawnToGraph`
- Test: `tests/orchestration/spawn-compiler.test.ts` > `compiles spawn input into a single cosmonauts-subagent graph step without nested-run fields`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-016`

### B-017 - `spawn_agent` remains agent-only, inline-default, and behaviorally unchanged

- Source: AC-006, AC-008, D-014, D-016
- Context: an agent calls `spawn_agent` from an interactive session.
- Action: the tool accepts, rejects, or completes through the existing `SpawnTracker` and follow-up message flow.
- Expected: accepted spawns still return `spawnId`, completions still arrive as follow-up messages, depth/concurrency authorization remains unchanged, no CLI `run spawn` exists, and no durable `RunRecord` is created for the current inline path.
- Seam: `domains/shared/extensions/orchestration/spawn-tool.ts`; `lib/orchestration/spawn-tracker.ts`; `lib/orchestration/spawn-compiler.ts`
- Test: `tests/extensions/orchestration-spawn-inline-compiler.test.ts` > `keeps spawn_agent inline spawnId behavior while documenting the one-node compiler mapping`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-017`

### B-018 - Docs and prompts teach the consolidated surface and named chains

- Source: AC-005, AC-007, D-011, D-013, D-015
- Context: agents and external operators read active docs, skills, capabilities, README, prompts, and external skills.
- Action: prose is refreshed after code and CLI behavior land.
- Expected: active guidance describes `cosmonauts run`, named chains, `runId`, `run_status`/`run_watch`, `watch_events` compatibility, Drive durable-location vocabulary, and spawn’s agent-only scope; it avoids removed flags and old `cosmonauts drive`/workflow-as-orchestration guidance. Generic “workflow” headings meaning “work procedure” may remain.
- Seam: `docs/orchestration.md`; `README.md`; `domains/shared/skills/drive/SKILL.md`; `domains/shared/capabilities/drive.md`; `domains/shared/skills/spawning/SKILL.md`; `domains/shared/capabilities/spawning.md`; `lib/driver/README.md`; `external-skills/cosmonauts/`; `bundled/coding/coding/prompts/*.md`
- Test: `tests/docs/orchestration-surface-docs.test.ts` > `documents cosmonauts run named chains and normalized observation without removed orchestration flags`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-018`

### B-019 - Deferred nested-run and parallel-mutation scope stays absent

- Source: AC-008, D-014, D-016
- Context: implementation touches runtime types, backend names, compilers, CLI, and docs.
- Action: tests and reviewer checks inspect final code and public prose.
- Expected: `RunRecord` still has no `kind`, `parentRunId`, or `parentStepId`; `KNOWN_BACKEND_NAMES` still does not include `nested-run`; no `run spawn` CLI exists; no worktree isolation, merge finalizer, approval gate, mutable parallel scheduling, or fan-out cap tuning lands.
- Seam: `lib/durable-runtime/types.ts`; `cli/run/subcommand.ts`; `lib/orchestration/spawn-compiler.ts`; docs/prose touched by Group E
- Test: `tests/orchestration/surface-non-goals.test.ts` > `keeps nested-run parent fields run spawn and parallel mutable execution out of wave two`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-019`

## Design

### Module boundaries and dependency direction

- `lib/durable-runtime/*` is the stable core. It may define `runStart`, controller helpers, a generic `run_activity` normalized event variant, and run-list/status/watch contracts. It must not import Drive types, chain parser/runner code, CLI renderers, prompts, task managers, or domain loaders.
- `lib/orchestration/*` owns chain and spawn compiler/frontends.
- `lib/driver/*` owns Drive graph compilation, Drive finalizer polling, `DriverEvent` compatibility, event normalization, completion files, resume behavior, and backend adapters. It may call `runStart`, but generic runtime code must not call back into Drive.
- `cli/run/*` owns the new human/external CLI front door.
- `lib/chains/*` owns named-chain registry loading.
- `domains/shared/extensions/orchestration/*` remains the agent-tool surface.

Dependency rule:

```text
CLI / Pi tools / docs
  -> chain, Drive, spawn frontends
  -> durable-runtime runStart + controller + store
  -> scheduler + backend contracts
```

Disallowed:

- `lib/durable-runtime/*` importing `lib/driver/*`, `lib/orchestration/*`, `cli/*`, `domains/*`, or `lib/tasks/*`.
- `spawn_agent` importing a nested-run backend or writing parent run fields.
- `watch_events` reading Drive legacy `events.jsonl` directly after B-008/B-009.

### Group A — internal `runStart` seam

Create `lib/durable-runtime/run-start.ts` and export it from `lib/durable-runtime/index.ts`.

Contract shape against shipped types:

```ts
export interface RunStartOptions {
  store: RunStore;
  schedulerStore?: RunStore; // must be a same-backing-store wrapper; see invariant below
  ref: RunRef;
  graph: RunGraph;
  createRun?: Omit<CreateRunInput, "scope" | "runId">;
  initialSteps?: readonly StepRecord[];
  backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
  holderId: string;
  inputForStep?: RunGraphSchedulerOptions["inputForStep"];
  signal?: AbortSignal;
  heartbeatIntervalMs?: number;
  maxPasses?: number;
  stopPolicy?: RunStartStopPolicy;
}

export interface RunStartState {
  store: RunStore;
  ref: RunRef;
  run: RunRecord;
  graph: RunGraph;
  steps: readonly StepRecord[];
  createdRun: boolean;
  passes: number;
}

export interface RunStartInterruption {
  reason: string;
  exitReason: "interrupted";
  run?: RunRecord;
  steps?: readonly StepRecord[];
  diagnostics?: readonly RuntimeDiagnostic[];
  details?: unknown;
}

export interface RunStartStopPolicy {
  beforePass?(state: RunStartState): Promise<RunStartInterruption | undefined>;
  afterPass?(state: RunStartState, pass: RunGraphSchedulerResult): Promise<RunStartInterruption | undefined>;
  shouldStop?(pass: RunGraphSchedulerResult): boolean;
}

export interface RunStartResult extends RunGraphSchedulerResult {
  ref: RunRef;
  createdRun: boolean;
  passes: number;
  interruption?: RunStartInterruption;
}
```

`schedulerStore` invariant: it is allowed only for same-backing-store wrappers such as Drive’s current `withSafeSchedulerEventWrites`, where every method except `appendEvent`/`appendDiagnostic` delegates to the same underlying `store`. It must not change scheduler reads, graph/step/run writes, attempts, scheduler state, or resume decisions. Add a test/acceptance check proving Drive’s safe wrapper cannot alter reads used for reconciliation.

Initialization rules:

1. `runStart` calls `store.loadRun(ref)` before creating anything.
2. Missing run: create with `store.createRun({ ...ref, ...createRun })`, write graph, write `initialSteps` or pending records derived from graph, append one `run_started`.
3. Existing run with graph/steps: load persisted graph and step records; do not rewrite graph, results, attempts, heartbeats, scheduler state, or metadata.
4. Existing run with empty graph and no steps: initialize once after frontend validation.
5. Stop-policy callbacks receive `RunStartState` built from persisted records. Drive finalizer polling returns `RunStartInterruption` from the Drive edge; generic runtime does not inspect Drive finalizer concepts.

Frontend routing:

- Chain keeps compilation, backend creation, event adaptation, and result reconstruction at `lib/orchestration/*`; `runStart` owns setup/scheduler passes.
- Drive splits graph/step construction from run creation; `runDriveOnGraph` supplies Drive metadata/policy/initial steps to `runStart` and keeps finalizer polling, legacy events, completion-file writing, result mapping, resume metadata validation, and detached runner boundaries in `lib/driver/*`.

### Group B — normalized observation + `watch_events` compatibility

Add a generic normalized event variant in `lib/durable-runtime/types.ts`:

```ts
type OrchestrationEvent =
  | ExistingVariants
  | { type: "run_activity"; runId: string; details: unknown };
```

`run_activity` is generic and opaque. Durable runtime summarizes it generically and does not import Drive. Drive uses it to preserve exact legacy `DriverEvent` compatibility evidence:

```ts
{
  type: "run_activity",
  runId: event.runId,
  details: { kind: "legacy_driver_event", event }
}
```

Drive normalization rules:

- For every legacy `DriverEvent` written by Drive, append one `run_activity` compatibility event carrying the original event payload in `details`.
- Continue emitting canonical normalized lifecycle/activity/artifact events as today; `run_activity` is additional compatibility evidence and must not be treated as canonical terminal state by `run_status`.
- Graph-backed Drive’s scheduler lifecycle remains authoritative; compatibility `run_activity` does not create duplicate canonical `run_*` or `step_*` lifecycle events.

`watch_events` mapper in `lib/driver/watch-events-compat.ts`:

- Resolves `RunRef` from `planSlug` + `runId`.
- Reads normalized events through the store/controller path, not `events.jsonl`.
- Filters `run_activity.details.kind === "legacy_driver_event"` in normalized event order and extracts the legacy `DriverEvent` payloads.
- Treats `since` as a **legacy event count**, not a normalized seq. Implementation can read the full normalized stream for this compatibility tool, build `legacyEvents`, return `legacyEvents.slice(since)`, and set `cursor = legacyEvents.length`.
- Keeps response shape `{ events, cursor }`, existing compact summaries, and structured `details`.
- Parity tests must include `since > 0`, events that produce multiple canonical normalized events, and legacy advisory events that previously produced diagnostics-only normalized data.

Chain/Drive observation:

- Graph-backed durable chains include `{ runId, scope: "chain" }` in tool/CLI details.
- `run_driver` includes `scope: planSlug` in addition to existing `planSlug`.
- Inline loop/completion chains remain legacy and explicitly non-durable/no-run-record.

### Group C — `cosmonauts run` CLI and named-chain rename

Add `cli/run/subcommand.ts` and register `run` in `cli/main.ts` subcommand dispatch.

Run CLI contract:

- Every `cosmonauts run ...` command writes exactly one JSON value to stdout.
- Human progress/warnings/diagnostics go to stderr.
- `run` does not accept `--json` or `--plain`, including `run chain list`.
- Detached starts exit `0` after launch; inline chain/Drive commands exit `0` only for success/completed outcomes.

Subcommands:

- `cosmonauts run chain <expression-or-name> [prompt...]`
  - Resolves raw DSL with `isChainDslExpression` or named chains via `lib/chains/loader.ts`.
  - Bootstraps `CosmonautsRuntime` similarly to current `handleWorkflowMode`; preserve domain, plugin-dir, model, thinking, completion-label, and profile behavior where applicable.
  - Uses existing durable-or-inline predicate; no loop migration.
- `cosmonauts run chain list`
  - Lists named chains from domain arrays and `.cosmonauts/config.json` `chains` map.
  - JSON-native under the `run` contract.
- `cosmonauts run drive ...`
  - Reuses current Drive option set and run-spec behavior.
  - Adds `scope: planSlug` to start/result JSON.
- `cosmonauts run status <runId> [--scope <scope>]`, `watch`, `list`
  - Use `FileRunStore` and controller APIs, with unique-run resolution or JSON errors when ambiguous/missing.

Final parser state:

- Remove final reliance on `-w/--workflow`, `--list-workflows`, and bare `cosmonauts drive` as public orchestration paths.
- `cosmonauts run spawn` is rejected; `cosmonauts -p/--print` remains the single-agent CLI path.

Named-chain registry:

```ts
export interface NamedChain {
  name: string;
  description: string;
  chain: string;
}

export interface ProjectNamedChainConfig {
  description?: string;
  chain: string;
}

export interface ProjectConfig {
  chains?: Readonly<Record<string, ProjectNamedChainConfig>>;
}
```

- Domain files export `NamedChain[]` from `chains.ts`.
- Project config uses a map keyed by chain name; values contain `description?` and `chain`. The key is authoritative for `name`.
- Project config entries override domain entries by name, matching current workflow precedence.
- No final `workflows` project-config alias. Temporary aliases are only implementation scaffolding and must be removed before completion.

### Group D — spawn as inline-default 1-node compiler

Add `lib/orchestration/spawn-compiler.ts` with:

```ts
export interface CompileSpawnToGraphOptions {
  runId: string;
  role: string;
  prompt: string;
  cwd: string;
  domainContext?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  runtimeContext?: SpawnRuntimeContext;
  projectSkills?: readonly string[];
  skillPaths?: readonly string[];
  planSlug?: string;
}

export interface CompiledSpawnGraph {
  scope: "adhoc";
  graph: RunGraph;
  stepId: string;
}
```

The graph has one `agent` step, backend `cosmonauts-subagent`, no dependencies, and backend options with `source: "spawn"` plus the spawn inputs needed by the existing session factory.

Do **not** route `spawn_agent` through `runStart` this wave. Current `spawn_agent` remains non-blocking, `spawnId`-based, `SpawnTracker`-backed, follow-up-message-delivered, depth/concurrency-limited, and non-durable by default.

### Group E — docs, prompts, capabilities, external skills

After code and CLI behavior are stable:

- Rewrite `docs/orchestration.md` around one runtime, named compilers, `runId`, normalized observation, `cosmonauts run`, named chains, and spawn as inline agent-only.
- Update Drive skill/capability and `lib/driver/README.md` to prefer `run_status`/`run_watch` and `cosmonauts run drive`; describe `watch_events` as deprecated compatibility.
- Update spawning skill/capability to use chain/named-chain terminology and `cosmonauts run chain`.
- Update `README.md` and `external-skills/cosmonauts/`; rename or rewrite `cosmonauts-workflows` guidance.
- Update coding-domain prompts only where “workflow” refers to the old orchestration concept. Generic process headings can remain.

## Files to Change

- `lib/durable-runtime/run-start.ts` (new)
- `lib/durable-runtime/index.ts`
- `lib/durable-runtime/types.ts`
- `lib/durable-runtime/controller.ts`
- `lib/durable-runtime/file-store.ts`
- `lib/orchestration/durable-chain-runner.ts`
- `lib/orchestration/durable-chain-compiler.ts`
- `lib/orchestration/types.ts`
- `lib/orchestration/spawn-compiler.ts` (new)
- `domains/shared/extensions/orchestration/chain-tool.ts`
- `domains/shared/extensions/orchestration/driver-tool.ts`
- `domains/shared/extensions/orchestration/run-control-tools.ts`
- `domains/shared/extensions/orchestration/watch-events-tool.ts`
- `lib/driver/drive-graph-runner.ts`
- `lib/driver/drive-graph-compiler.ts`
- `lib/driver/event-stream.ts`
- `lib/driver/durable-events.ts`
- `lib/driver/watch-events-compat.ts` (new)
- `lib/driver/driver.ts`
- `lib/driver/run-step.ts`
- `lib/driver/types.ts`
- `cli/main.ts`
- `cli/run/subcommand.ts` (new)
- `cli/run/chain.ts` (new, if extraction needs it)
- `cli/run/drive.ts` (new, if extraction needs it)
- `cli/run/observation.ts` (new, if extraction needs it)
- `cli/drive/subcommand.ts` (remove, rename, or reduce during migration)
- `cli/types.ts`
- `lib/chains/types.ts` (new)
- `lib/chains/loader.ts` (new)
- `lib/workflows/types.ts` (remove or rename)
- `lib/workflows/loader.ts` (remove or rename)
- `lib/domains/types.ts`
- `lib/domains/loader.ts`
- `lib/domains/validator.ts`
- `lib/runtime.ts`
- `lib/config/types.ts`
- `lib/config/loader.ts`
- `lib/config/defaults.ts`
- `domains/main/chains.ts` (new)
- `domains/main/workflows.ts` (remove or rename)
- `domains/shared/chains.ts` (new)
- `domains/shared/workflows.ts` (remove or rename)
- `bundled/coding/coding/chains.ts` (new)
- `bundled/coding/coding/workflows.ts` (remove or rename)
- `docs/orchestration.md`
- `README.md`
- `domains/shared/skills/drive/SKILL.md`
- `domains/shared/capabilities/drive.md`
- `domains/shared/skills/spawning/SKILL.md`
- `domains/shared/capabilities/spawning.md`
- `lib/driver/README.md`
- `external-skills/cosmonauts/SKILL.md`
- `external-skills/cosmonauts/workflows/SKILL.md` (rename to chains skill or rewrite)
- `external-skills/cosmonauts/plans/SKILL.md`
- `external-skills/cosmonauts/tasks/SKILL.md`
- `external-skills/cosmonauts/skills/SKILL.md`
- `tests/durable-runtime/run-start.test.ts` (new)
- `tests/durable-runtime/run-start-resume.test.ts` (new)
- `tests/orchestration/run-start-chain-characterization.test.ts` (new)
- `tests/driver/drive-run-start-characterization.test.ts` (new)
- `tests/extensions/orchestration-chain-tool-observation.test.ts` (new)
- `tests/extensions/orchestration-driver-tool-observation.test.ts` (new)
- `tests/extensions/orchestration-run-control-surface.test.ts` (new)
- `tests/extensions/orchestration-watch-events-normalized-compat.test.ts` (new)
- `tests/cli/run/chain.test.ts` (new)
- `tests/cli/run/named-chain.test.ts` (new)
- `tests/cli/run/drive.test.ts` (new)
- `tests/cli/run/observation.test.ts` (new)
- `tests/cli/run/surface-contract.test.ts` (new)
- `tests/chains/named-chain-loader.test.ts` (new)
- `tests/orchestration/spawn-compiler.test.ts` (new)
- `tests/extensions/orchestration-spawn-inline-compiler.test.ts` (new)
- `tests/orchestration/surface-non-goals.test.ts` (new)
- `tests/docs/orchestration-surface-docs.test.ts` (new)
- Existing workflow/drive/chain tests under `tests/cli/`, `tests/workflows/`, `tests/domains/`, and `tests/extensions/` as needed for rename and behavior updates.

## Risks

- **`runStart` overwrites persisted state on resume.** B-004 is a blocker.
- **Drive finalizer polling leaks into generic runtime.** Keep callbacks generic and finalizer mapping in `lib/driver/`.
- **Safe scheduler wrapper changes reads.** `schedulerStore` must be a same-backing-store write wrapper only; tests must prove it cannot alter reconciliation reads.
- **Weak characterization tests.** Group A tests must assert meaningful run files/events/results, not call counts.
- **`watch_events` cursor parity regresses.** Since is legacy event count, not normalized seq; parity tests must include non-zero cursors and divergent normalized-event counts.
- **`run_activity` compatibility pollutes canonical status.** `run_status` must ignore `run_activity` for terminal status; canonical lifecycle events remain authoritative.
- **CLI runtime bootstrapping regresses domain/Pi options.** Tests must cover domain/plugin/model/thinking/profile/completion-label behavior before old flags are removed.
- **Rename churn leaves split terminology.** Final active code/docs should not teach workflows as a separate orchestration concept.
- **Spawn compiler changes hot path.** Tests must prove `spawn_agent` still returns `spawnId` and creates no durable run by default.
- **Scope creep into D-016.** Worktrees, parallel mutation, approval gates, and fan-out cap tuning stay out.

Pivot / abort conditions:

- If `runStart` requires frontend-specific Drive or chain types in `lib/durable-runtime`, stop and redesign.
- If `watch_events` parity needs more than the single generic `run_activity` variant plus Drive-edge detail, pause for architecture confirmation.
- If removing old CLI names strands internal callers, keep temporary aliases only long enough to migrate those callers, then remove before Group E/final gates.

## Quality Contract

All task waves use the same ladder. Per-task implementation may run focused subsets first, but final integration covers the whole plan.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests for touched behavior pass; final integration correctness evidence passes | project-discovered | hard fail |
| 2 | `boundary-conformance` | universal | bound | Project-native static/type boundary checks pass; no generic runtime import of Drive/CLI/domain/task modules | project-discovered + reviewer evidence | hard fail |
| 3 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for this plan | artifact evidence | hard fail |
| 4 | `mutation` | bindable | unbound | Targeted negative/edge checks cover resumed persisted state, safe scheduler wrapper reads, watch_events non-zero cursor parity, removed CLI names, no run spawn, no nested-run fields/backend, and unchanged spawn_agent behavior | pending | unbound mechanically; reviewer judgment required |
| 5 | `duplication` | bindable | bound | Chain and Drive no longer duplicate create-run/write-graph/init-step/scheduler-loop boilerplate outside `runStart`; remaining duplication is frontend-specific result mapping | reviewer evidence | hard fail for reintroducing a second run-start envelope |
| 6 | `dead-code` | bindable | unbound | Old workflow/drive CLI paths and workflow registry names are removed or intentionally temporary within an in-progress task, not left as final unused public surface | pending | unbound mechanically; reviewer judgment required |

## Implementation Order

Dependency shape: **A → B/C/D → E**. Group A is the first merge gate. Groups B, C, and D start only after A is green. Group E lands last.

### T1 — Group A: Add `runStart` contract and characterization guards

- Dependencies: none.
- Behaviors: B-001, B-004 plus RED portions of B-002 and B-003.
- Acceptance criteria:
  - Add `lib/durable-runtime/run-start.ts` contract, explicit `RunStartState`/`RunStartInterruption`, and create/adopt/seed-once tests.
  - Add chain and Drive characterization tests that pass against current behavior before the refactor.
  - Add resume/rehydration test proving persisted graph/step/result state is authoritative.
  - Add safe-wrapper invariant test proving a scheduler store wrapper cannot change reads/reconciliation state.

### T2 — Group A: Route durable chain and Drive through `runStart`

- Dependencies: T1.
- Behaviors: B-001, B-002, B-003, B-004.
- Acceptance criteria:
  - `runDurableChain` delegates create/write/seed/scheduler loop to `runStart` and keeps chain behavior at the chain edge.
  - `compileDriveRunToGraph` is split so `runDriveOnGraph` calls `runStart` with Drive graph/initial steps/create-run metadata.
  - Drive finalizer polling and safe event writes remain Drive-edge layers.
  - Durable chain and Drive graph tests remain green, including detached frozen-runner safety.

### T3 — Group B: Surface run metadata and normalized observation for graph-backed agent tools

- Dependencies: T2.
- Behaviors: B-005, B-006, B-007.
- Acceptance criteria:
  - `chain_run` details include `{ runId, scope: "chain" }` for graph-backed chains.
  - `run_driver` response includes `scope: planSlug` while keeping `planSlug`.
  - Inline loop/completion chains remain legacy and explicitly non-durable.
  - `run_status`/`run_watch` observe returned chain and Drive run IDs without frontend-specific branches.

### T4 — Group B: Re-implement `watch_events` over normalized events with cursor parity

- Dependencies: T2, T3.
- Behaviors: B-008, B-009.
- Acceptance criteria:
  - Add generic `run_activity` event variant and controller summary support.
  - Drive emits one `run_activity` compatibility event carrying the original `DriverEvent` for every legacy Drive event.
  - `watch_events` reads normalized events, filters `legacy_driver_event` activity, applies legacy event-count cursor semantics, and keeps response shape/summaries.
  - Parity tests include cursor 0, non-zero `since`, one-to-many canonical normalization, and advisory events.

### T5 — Group C: Rename workflow registry to named chains

- Dependencies: T2.
- Behaviors: B-011, B-015.
- Acceptance criteria:
  - Add `lib/chains/*` and `NamedChain`.
  - Define `ProjectConfig.chains?: Record<string, { description?: string; chain: string }>`; project entries override domain entries by key/name.
  - Update domain loader/runtime/config/validator to `chains` naming.
  - Rename domain defaults to `chains.ts` and update tests.
  - No final `workflows` project-config alias or `RunRecord.kind` work is introduced.

### T6 — Group C: Add `cosmonauts run` observation and chain commands

- Dependencies: T3, T5.
- Behaviors: B-010, B-011, B-013.
- Acceptance criteria:
  - Register `cosmonauts run`.
  - Implement `run status|watch|list` over normalized controller/store with scope resolution and JSON-only stdout.
  - Implement `run chain <expression-or-name>` and `run chain list` using `lib/chains`, preserving applicable domain/model/thinking/completion/profile behavior.
  - Progress goes to stderr; stdout is exactly one JSON value.

### T7 — Group C: Move Drive CLI onto `cosmonauts run drive` and remove final old orchestration CLI surface

- Dependencies: T2, T6.
- Behaviors: B-012, B-014.
- Acceptance criteria:
  - Extract/move current Drive CLI helpers so `run drive` uses the same spec, resume, dirty-worktree, pending-finalization, inline/detached, and backend behavior.
  - `run drive` output matches current Drive JSON plus `scope`.
  - Final parser rejects `run spawn`; `-p/--print` still works.
  - Final parser/tests/docs no longer rely on `-w/--workflow`, `--list-workflows`, or bare `cosmonauts drive`.

### T8 — Group D: Add spawn 1-node compiler while preserving `spawn_agent`

- Dependencies: T2.
- Behaviors: B-016, B-017, B-019.
- Acceptance criteria:
  - Add `compileSpawnToGraph` returning one `agent` step on `cosmonauts-subagent` with spawn inputs in backend options.
  - Tests prove no `nested-run` backend, no parent run fields, and no durable run record creation in current `spawn_agent` path.
  - `spawn_agent` remains `spawnId` + follow-up message.
  - No CLI `run spawn` exists.

### T9 — Group E: Refresh docs, prompts, capabilities, and external skills

- Dependencies: T3, T4, T5, T6, T7, T8.
- Behaviors: B-018, B-019.
- Acceptance criteria:
  - Update docs/README/driver README around `cosmonauts run`, named chains, run IDs, normalized observation, and compatibility.
  - Update Drive and spawning skills/capabilities.
  - Update external cosmonauts skill bundle; rename or rewrite workflow guidance to named chains.
  - Prompt/doc terminology tests pass; removed flags and old primary CLI names are absent from active guidance.

### T10 — Final integration and boundary cleanup

- Dependencies: T1 through T9.
- Behaviors: all, especially B-019.
- Acceptance criteria:
  - Full project correctness and boundary gates pass.
  - Artifact conformance for this plan passes.
  - No generic runtime import violates dependency direction.
  - No nested-run/parent fields/backend, worktree/parallel mutation, approval gates, or fan-out cap tuning landed.
  - Remove any temporary aliases left from intermediate tasks.

## Reviewer Resolution

- **PR-001 — `watch_events` cursor parity.** Resolved by adding explicit legacy event-count cursor semantics, requiring full normalized-stream reconstruction or equivalent legacy-index metadata, adding `since > 0` parity tests, and introducing one generic `run_activity` compatibility event carrying original Drive events from the Drive edge.
- **PR-002 — `run_driver` scope.** Resolved by adding B-006 and T3 acceptance for `run_driver` returning `scope: planSlug` while preserving `planSlug`.
- **PR-003 — named-chain ordering.** Resolved by moving named-chain registry work to T5 before `run chain <name>`/`run chain list` in T6; B-011 is owned by the CLI task after the registry exists.
- **PR-004 — `runStart` implicit contracts.** Resolved by defining `RunStartState`, `RunStartInterruption`, and the same-backing-store scheduler wrapper invariant, with an explicit acceptance check.
- **PR-005 — project `chains` config shape.** Resolved by specifying `ProjectConfig.chains?: Record<string, { description?: string; chain: string }>` with key-as-name and project-over-domain precedence; no final `workflows` alias.
