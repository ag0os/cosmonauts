---
title: Orchestration Surface Consolidation (Durable Orchestration Wave 2)
status: active
createdAt: '2026-06-05T20:24:55.570Z'
updatedAt: '2026-06-05T21:00:55.474Z'
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
- Shipped durable-runtime vocabulary already includes `StepKind` value `"approval"`, `WorktreeSpec`, and `RunPolicy.maxParallelSteps`; this plan must not delete that public contract vocabulary, and absence checks must target only new execution surfaces/behavior that would implement the deferred scope.

Current code seams verified for this plan:

- `lib/orchestration/durable-chain-runner.ts` directly creates the chain store/ref/run, writes graph/steps/events, runs scheduler passes, and reconstructs `ChainResult`.
- `lib/driver/drive-graph-runner.ts` owns the Drive store/ref, scheduler drain, finalizer polling, and result mapping; `lib/driver/drive-graph-compiler.ts` currently creates/writes the Drive run graph and pending step records.
- `domains/shared/extensions/orchestration/chain-tool.ts` keeps `chain_run` blocking and routes loop/completion chains to `runChain` inline.
- `domains/shared/extensions/orchestration/driver-tool.ts` returns `runId`, `planSlug`, `workdir`, and `eventLogPath`, but no explicit `scope` yet.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` currently reads Drive `events.jsonl` via `tailEvents`.
- `domains/shared/extensions/orchestration/run-control-tools.ts` already registers read-only `run_status`/`run_watch` over `FileRunStore` and `controller.ts`.
- `cli/main.ts` currently exposes `-w/--workflow` and `--list-workflows`; there is no `cosmonauts run` subcommand.
- `cli/main.ts` currently resolves workflow inputs by checking `isChainDslExpression()` before `resolveWorkflow()`, while `lib/orchestration/chain-steps.ts` returns true for single-token stage-like names; shipped coding defaults in `bundled/coding/coding/workflows.ts` include single-token named workflows such as `verify` and `adapt`.
- `cli/drive/subcommand.ts` currently owns Drive CLI run/status/list JSON behavior.
- `lib/workflows/types.ts` and `lib/workflows/loader.ts` currently own named pipeline loading; domain files are `workflows.ts`.
- `lib/driver/driver.ts` and `lib/driver/run-step.ts` create graph-backed Drive durable sinks with `mode: "graph-activity-only"`; `lib/driver/event-stream.ts` currently filters that mode to `step_tool_activity`, `step_output`, and `artifact_written` only.
- `FileRunStore.createRun` in `lib/durable-runtime/file-store.ts` is not an exclusive create; `runStart` must not depend on bare load-then-create for cross-process same-`RunRef` safety.
- Current chain and Drive initialization write graph before seeding step records; `lib/durable-runtime/scheduler.ts` blocks on `missing_step_record`, so `runStart` must define partial-initialization repair before handing the run to the scheduler.
- `domains/shared/extensions/orchestration/spawn-tool.ts` currently keeps `spawn_agent` as a non-blocking in-memory `spawnId` path backed by `SpawnTracker`; this hot path stays semantically unchanged.

Non-goals that are blockers if introduced:

- Do **not** migrate chain loops or coordinator waiting off the legacy inline path.
- Do **not** add `RunRecord.parentRunId`, `RunRecord.parentStepId`, a run `kind` discriminator, or a `nested-run` backend.
- Do **not** add new per-step/per-task worktree execution wiring, merge finalizers, approval-gate execution/surface, parallel mutable execution, or read-only fan-out cap tuning. Existing durable-runtime type vocabulary for approval/worktree/max-parallel policy remains intact.
- Do **not** keep old CLI names as a final compatibility commitment. Temporary aliases are acceptable during implementation only; final docs/prompts/code point at `cosmonauts run` and named chains.

## Behaviors

### B-001 - `runStart` creates or adopts a graph run exactly once

- Source: AC-001, AC-008, D-011
- Context: a frontend has compiled a `RunGraph`, selected a `RunRef`, and built a scheduler backend map using shipped `RunRecord`/`StepRecord` types; another process may be starting the same `RunRef` concurrently.
- Action: it calls `runStart` with create-run inputs, graph, initial step records, scheduler options, and holder ID.
- Expected: `runStart` enters a per-`RunRef` initialization critical section before create/write/seed work. If the run is missing, it creates `RunRecord`, writes `graph.json`, seeds pending step records, appends exactly one normalized `run_started`, and drives scheduler passes. If another process wins creation first, the loser reloads persisted `run.json`, `graph.json`, step records, and events, adopts the run, and does not append a second `run_started` or overwrite persisted correctness-critical state. Stop-policy interruptions return the separate interrupted branch of `RunStartResult`, not a fabricated scheduler exit reason.
- Seam: `lib/durable-runtime/run-start.ts` > `runStart`; `lib/durable-runtime/file-store.ts` > run initialization lock
- Test: `tests/durable-runtime/run-start.test.ts` > `creates or adopts a graph run exactly once across concurrent starters`
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
- Expected: Drive `DriverResult`, compatibility files, graph/step records, and detached frozen-runner behavior match current graph-backed Drive characterization; detached scheduler execution still happens inside `lib/driver/run-step.ts` / `bin/cosmonauts-drive-step`. Resume still compiles/repairs the graph from the persisted authoritative `metadata.driveTaskIds` (via `withAuthoritativeTaskIds`), not a `remainingTaskIds` slice, so a resumed run is not misread as a graph mismatch.
- Seam: `lib/driver/drive-graph-runner.ts` > `runDriveOnGraph`; `lib/driver/run-step.ts` > `runWithLock`; `lib/durable-runtime/run-start.ts` > `runStart`
- Test: `tests/driver/drive-run-start-characterization.test.ts` > `preserves graph-backed Drive files results and detached frozen runner through runStart`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-003`

### B-004 - `runStart` rehydrates and repairs persisted initialization state on resume

- Source: AC-001, AC-008, D-011
- Context: a process resumes a run whose in-memory scheduler state is empty but whose run directory contains persisted run evidence, including a normal complete graph/steps state or a crash state with a non-empty graph and zero/partial step records.
- Action: a frontend calls `runStart` with a graph compiled from current inputs.
- Expected: `runStart` loads persisted graph/step/run state before scheduling, treats the persisted graph as authoritative when it matches the compiled topology, idempotently writes only missing pending step records for graph steps that lack records, does not rewrite existing results/attempts/heartbeats/metadata, and lets the scheduler reconcile from repaired durable records. If a persisted non-empty graph conflicts with the compiled graph, `runStart` blocks with an explicit initialization diagnostic rather than overwriting the graph.
- Seam: `lib/durable-runtime/run-start.ts` > `ensureRunInitialized`; `lib/driver/drive-graph-runner.ts` > resume/load boundary
- Test: `tests/durable-runtime/run-start-resume.test.ts` > `repairs partial initial step seeding before scheduling a resumed run`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-004`

### B-005 - `chain_run` returns run metadata for graph-backed chains while keeping blocking convenience

- Source: AC-002, D-011
- Context: an agent calls `chain_run` with a loop-free supported expression.
- Action: the tool blocks until completion, as it does today.
- Expected: the tool still returns the final `ChainResult` and progress lines, and structured details additionally include `{ runId, scope: "chain" }` read from the new optional `ChainResult.run` field. Loop/completion chains still route to `runChain` inline and are explicitly non-durable/no-run-record (`ChainResult.run === undefined`).
- Seam: `domains/shared/extensions/orchestration/chain-tool.ts` > `registerChainTool`; `lib/orchestration/types.ts` > `ChainResult.run?: { runId; scope: "chain" }`; `lib/orchestration/durable-chain-runner.ts` > `runDurableChain` (populate `run`)
- Test: `tests/extensions/orchestration-chain-tool-observation.test.ts` > `returns runId and scope for durable chain_run without changing blocking result semantics`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-005`

### B-006 - Agent-facing Drive starts expose the Drive scope for normalized observation

- Source: AC-002, D-011
- Context: an agent calls `run_driver` and receives the existing start acknowledgement.
- Action: the tool returns its structured result, or the caller uses a plan slug that collides with the reserved chain scope.
- Expected: the response keeps `runId`, `planSlug`, `workdir`, and `eventLogPath`, and additionally includes `scope: planSlug` so callers can pass `{ scope, runId }` directly to `run_status`/`run_watch`. If `planSlug === "chain"`, `run_driver` rejects before lock acquisition or durable run creation with a clear reserved-scope diagnostic; Drive does not create records under the chain scope.
- Seam: `domains/shared/extensions/orchestration/driver-tool.ts` > `registerDriverTool`; `lib/driver/types.ts` > plan slug validation
- Test: `tests/extensions/orchestration-driver-tool-observation.test.ts` > `returns scope alongside runId and rejects the reserved chain plan slug`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-006`

### B-007 - Returned chain and Drive runs are observable through `run_status` and `run_watch`

- Source: AC-002, D-011
- Context: a graph-backed chain run and a Drive run have returned `{ runId, scope }` to their callers.
- Action: callers pass those values to `run_status` and `run_watch`.
- Expected: both frontends report normalized status and event pages from `RunRecord.eventsPath`; missing runs remain read-only not-found responses. The reserved chain scope is used only for chain runs, so Drive records cannot mask chain records by plan-slug collision.
- Seam: `domains/shared/extensions/orchestration/run-control-tools.ts`; `lib/durable-runtime/controller.ts` > `runStatus` / `runWatch`
- Test: `tests/extensions/orchestration-run-control-surface.test.ts` > `observes returned chain and Drive run ids through normalized status and watch`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-007`

### B-008 - `watch_events` preserves legacy line-cursor semantics over normalized events

- Source: AC-003, D-014
- Context: a graph-backed Drive run has normalized events, including Drive compatibility activity for each legacy `DriverEvent` needed by `watch_events`; Drive’s durable sink is in `graph-activity-only` mode on real graph runs.
- Action: an agent calls `watch_events({ planSlug, runId, since })` with `since` omitted, zero, or a non-zero legacy cursor returned by a previous call.
- Expected: in the healthy path, the tool reconstructs legacy `DriverEvent[]` from normalized `run_activity` events, not by tailing legacy `events.jsonl`; `graph-activity-only` filtering preserves `run_activity` compatibility events while still dropping duplicate canonical lifecycle events. The tool filters in **legacy event index space** (`since` is the number of legacy events already consumed) and returns `cursor = total reconstructed legacy events`, matching `tailEvents` line-cursor behavior even when one legacy event maps to zero, one, or multiple canonical normalized events. If the normalized reconstruction is incomplete — detected by a count cross-check against the dual-written legacy JSONL (reconstructed legacy-event count below the legacy file count) or a persisted `compat-degraded` marker — `watch_events` falls back to the legacy file for this compatibility tool only and marks the response details with a fallback diagnostic/source, so a partial mid-run normalized-append failure is never served as a silently-truncated projection.
- Seam: `domains/shared/extensions/orchestration/watch-events-tool.ts`; `lib/driver/watch-events-compat.ts` (new); `lib/durable-runtime/types.ts` > `run_activity`; `lib/driver/durable-events.ts` > `normalizeDriverEvent`; `lib/driver/event-stream.ts` > `graph-activity-only` filter
- Test: `tests/extensions/orchestration-watch-events-normalized-compat.test.ts` > `preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-008`

### B-009 - `watch_events` preserves legacy details and summaries from normalized Drive compatibility activity

- Source: AC-003, D-014
- Context: representative legacy Drive event variants are emitted, including variants that currently normalize to multiple events or diagnostics-only advisory data.
- Action: the normalized compatibility mapper reconstructs legacy events and `watch_events` renders compact summaries.
- Expected: reconstructed structured `events` and text summaries match the old `tailEvents`/`summarizeDriverEvent` output for run, task, backend activity, report, finalization, lock-warning, plan-completion-candidate, and terminal variants. Advisory variants that previously produced only diagnostics still have a `run_activity` compatibility event for reconstruction. The tool description marks `watch_events` deprecated and points new callers to `run_watch`/`run_status`.
- Seam: `lib/driver/watch-events-compat.ts` (new); `domains/shared/extensions/orchestration/watch-events-tool.ts` > `summarizeDriverEvent`
- Test: `tests/extensions/orchestration-watch-events-normalized-compat.test.ts` > `reconstructs legacy watch_events details and summaries from normalized Drive compatibility activity`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-009`

### B-010 - `cosmonauts run chain <expression>` emits JSON stdout and stderr progress

- Source: AC-004, D-013
- Context: a user invokes a loop-free ad-hoc chain through the new `run` CLI.
- Action: `cosmonauts run chain "planner -> reviewer" "prompt"` runs the same durable-or-inline routing used by the agent tool.
- Expected: stdout contains exactly one JSON value with `{ runId, scope: "chain", status, success, stageResults, ... }` for graph-backed chains; human progress goes to stderr; exit code is zero only on success. Inline loop chains remain legacy and report non-durable mode explicitly.
- Seam: `cli/run/subcommand.ts` (new) > `run chain`; `cli/main.ts` > shared run/workflow bootstrap seam (Pi-flags + `--domain`/`--plugin-dir`/`--model`/`--thinking`/`--completion-label`/`--profile` + `CosmonautsRuntime.create`); `cli/chain-event-logger.ts`; `lib/orchestration/durable-chain-runner.ts`
- Test: `tests/cli/run/chain.test.ts` > `runs an ad-hoc chain with JSON stdout progress stderr and returned run id`; `tests/cli/run/chain-bootstrap.test.ts` > `honors domain plugin-dir model thinking completion-label and profile like workflow mode`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-010`

### B-011 - Named chains replace named workflows at the CLI

- Source: AC-004, AC-005, D-013, D-015
- Context: saved pipelines are registered as named chains with fields `{ name; description; chain }`, including shipped single-token names such as `verify`/`adapt` that also satisfy `isChainDslExpression()`, and a project may configure a named chain literally named `list`.
- Action: a user invokes `cosmonauts run chain verify "prompt"`, `cosmonauts run chain list`, or `cosmonauts run chain --name list "prompt"`.
- Expected: `run chain <expression-or-name>` resolves an exact named-chain match **before** treating the token as raw DSL; therefore shipped single-token named chains like `verify` run their saved chain instead of being parsed as raw agent stages. Bare `run chain list` remains the JSON-native listing command. A named chain called `list` is allowed in the registry, appears in the listing, and is executable through the explicit named-chain form (`--name list`); `--name` performs name lookup only and does not fall back to raw DSL.
- Seam: `cli/run/subcommand.ts` > `run chain`; `lib/chains/loader.ts` (new); `lib/chains/types.ts` (new)
- Test: `tests/cli/run/named-chain.test.ts` > `resolves shipped single-token named chains before raw DSL and disambiguates list`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-011`

### B-012 - `cosmonauts run drive` preserves Drive semantics under the unified CLI

- Source: AC-004, D-013
- Context: a user starts an inline or detached plan-linked Drive run through the new `run` CLI.
- Action: `cosmonauts run drive --plan <slug> --backend codex --mode inline|detached ...` builds the same `DriverRunSpec` and starts the same `runInline`/`startDetached` paths.
- Expected: stdout JSON is native and contains current Drive result/start fields plus `scope: <planSlug>` and `runId`; progress/diagnostics go to stderr; detached starts return immediately; inline exit behavior matches current Drive. `--plan chain` is rejected before run creation because `chain` is reserved for chain-run scope.
- Seam: `cli/run/subcommand.ts` > `run drive`; `cli/drive/subcommand.ts` extraction/removal path; `lib/driver/driver.ts`; `lib/driver/types.ts` > plan slug validation
- Test: `tests/cli/run/drive.test.ts` > `starts Drive through cosmonauts run drive and rejects the reserved chain plan slug`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-012`

### B-013 - `cosmonauts run status|watch|list` observes all normalized run scopes

- Source: AC-002, AC-004, D-011, D-013
- Context: chain and Drive run records exist under `missions/sessions/<scope>/runs/<runId>/`.
- Action: a user invokes `cosmonauts run status <runId>`, `cosmonauts run watch <runId>`, or `cosmonauts run list`, optionally passing a scope when ambiguous.
- Expected: status/watch resolve a unique run across scopes or fail with JSON ambiguity/not-found errors; list returns JSON summaries from `FileRunStore.listRecentRuns`; no `--json`/`--plain` flag is accepted for `run` subcommands. Drive cannot create records in reserved scope `chain`, so a Drive plan slug collision cannot masquerade as a chain run.
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
- Expected: `lib/chains/` exports `NamedChain`; domain manifests load `chains.ts`; project config uses `chains?: Record<string, { description?: string; chain: string }>` where the object key is the chain name; project config entries override domain entries by name; a project entry named `list` is valid registry data; runtime exposes `chains`; old `WorkflowDefinition`/`lib/workflows` names are absent from the final state.
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
- Expected: `RunRecord` still has no `kind`, `parentRunId`, or `parentStepId`; `KNOWN_BACKEND_NAMES` still does not include `nested-run`; no `run spawn` CLI exists; no new Drive/chain execution path enables mutable parallel task dispatch, worktree isolation, merge finalization, approval-gate execution, or fan-out cap tuning. Existing shipped type vocabulary such as `StepKind: "approval"`, `WorktreeSpec`, and `RunPolicy.maxParallelSteps` remains allowed and must not be used as a grep-style failure condition.
- Seam: `lib/durable-runtime/types.ts`; `cli/run/subcommand.ts`; `lib/orchestration/spawn-compiler.ts`; docs/prose touched by Group E
- Test: `tests/orchestration/surface-non-goals.test.ts` > `keeps nested-run parent fields run spawn and new mutable-parallel surfaces out of wave two`
- Marker: `@cosmo-behavior plan:orchestration-surface-consolidation#B-019`

## Design

### Module boundaries and dependency direction

- `lib/durable-runtime/*` is the stable core. It may define `runStart`, controller helpers, a generic `run_activity` normalized event variant, the run initialization lock contract, and run-list/status/watch contracts. It must not import Drive types, chain parser/runner code, CLI renderers, prompts, task managers, or domain loaders.
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
- `watch_events` reading Drive legacy `events.jsonl` directly on the healthy normalized path after B-008/B-009; legacy JSONL is allowed only as the explicit compatibility fallback when normalized compatibility activity is unavailable because durable setup/append failed.

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

export interface RunStartSchedulerResult extends RunGraphSchedulerResult {
  type: "scheduler";
  ref: RunRef;
  createdRun: boolean;
  passes: number;
  interruption?: never;
}

export interface RunStartInterruptedResult {
  type: "interrupted";
  ref: RunRef;
  createdRun: boolean;
  passes: number;
  run: RunRecord;
  steps: readonly StepRecord[];
  diagnostics: readonly RuntimeDiagnostic[];
  interruption: RunStartInterruption;
}

export type RunStartResult = RunStartSchedulerResult | RunStartInterruptedResult;
```

`RunStartResult` is intentionally a discriminated union, not `RunGraphSchedulerResult` with extra fields. The scheduler’s shipped `exitReason` union remains `"terminal" | "drained" | "blocked" | "cancelled" | "waiting_for_fresh_external_work"`; interruption-only outcomes use `type: "interrupted"` and keep `exitReason: "interrupted"` only inside `RunStartInterruption`.

Run initialization locking:

- Extend the store contract with a per-run initialization critical section, implemented by `FileRunStore` with an exclusive file/directory lock under the run’s durable scope. `runStart` must enter this lock before load/create/write-graph/seed-steps/append-`run_started` work.

```ts
export interface RunStore {
  // existing methods...
  withRunInitializationLock<T>(ref: RunRef, action: () => Promise<T>): Promise<T>;
}
```

- `withSafeSchedulerEventWrites` and any other store wrapper used in this plan must delegate `withRunInitializationLock`, `loadRun`, `readRunGraph`, `listStepRecords`, scheduler state, attempts, and step reads/writes to the same backing store. Only `appendEvent`/`appendDiagnostic` may be wrapped.
- `FileRunStore.createRun` alone is not the concurrency primitive. `runStart` must re-load inside the initialization lock before creating or adopting, so two process-local `FileRunStore` instances starting the same `RunRef` converge on one run record and one `run_started` event.

Initialization rules:

1. `runStart` enters `store.withRunInitializationLock(ref, ...)` and calls `store.loadRun(ref)` inside the lock before creating anything.
2. Missing run: create with `store.createRun({ ...ref, ...createRun })`, write graph, write `initialSteps` or pending records derived from graph, append one `run_started`, and release the lock before scheduler passes.
3. Existing run with graph/steps: load persisted graph and step records; do not rewrite graph, results, attempts, heartbeats, scheduler state, metadata, or authoritative Drive metadata.
4. Existing run with empty graph and no steps: initialize once after frontend validation, under the lock.
5. Existing run with a non-empty graph and missing/partial step records: compare the persisted graph topology to the newly compiled graph. If they match, write pending records only for graph steps that do not already have a step record; leave all existing records unchanged. If they differ, append/block with an explicit initialization diagnostic such as `run_start_graph_mismatch` and return an interrupted result rather than overwriting the persisted graph.
6. Append `run_started` only when no persisted `run_started` event exists for the run, and perform that check under the initialization lock.
7. Stop-policy callbacks receive `RunStartState` built from persisted/repaired records. Drive finalizer polling returns `RunStartInterruption` from the Drive edge; generic runtime does not inspect Drive finalizer concepts.

`schedulerStore` invariant: it is allowed only for same-backing-store wrappers such as Drive’s current `withSafeSchedulerEventWrites`, where every method except `appendEvent`/`appendDiagnostic` delegates to the same underlying `store`. It must not change scheduler reads, graph/step/run writes, attempts, scheduler state, initialization locking, or resume decisions. Add a test/acceptance check proving Drive’s safe wrapper cannot alter reads used for reconciliation.

Frontend routing:

- Chain keeps compilation, backend creation, event adaptation, and result reconstruction at `lib/orchestration/*`; `runStart` owns setup/scheduler passes.
- Drive splits graph/step construction from run creation; `runDriveOnGraph` supplies Drive metadata/policy/initial steps to `runStart` and keeps finalizer polling, legacy events, completion-file writing, result mapping, resume metadata validation, and detached runner boundaries in `lib/driver/*`.
- Drive resume invariant (must survive the split): on resume or partial-init repair, the Drive graph is (re)compiled from the **persisted authoritative original task set** — `run.metadata.driveTaskIds` applied via `withAuthoritativeTaskIds()` — never from a `remainingTaskIds` slice or a fresh current-task selection. The CLI may still compute `remainingTaskIds` from legacy events for queue display, but the graph topology and finalizer dependencies derive from `driveTaskIds`. If `runStart`'s persisted-vs-compiled graph comparison were fed a remaining-slice or re-selected graph, a recoverable resumed run would trip `run_start_graph_mismatch` and lose sequential finalizer ordering. A named test pins `driveTaskIds` vs `remainingTaskIds` behavior across a resumed/partially-initialized Drive run.

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
- In `graph-activity-only` mode, `processDurableDriverEvent()` continues to filter out duplicate canonical lifecycle events, but it must allow `run_activity` through alongside `step_tool_activity`, `step_output`, and `artifact_written`. This is the real graph-backed Drive path used by `runInline` and the frozen detached runner.
- Advisory legacy events that currently normalize to diagnostics only (`lock_warning`, `plan_completion_candidate`, finalizer evidence without a task, etc.) still get a `run_activity` compatibility event.

`watch_events` mapper in `lib/driver/watch-events-compat.ts`:

- Resolves `RunRef` from `planSlug` + `runId`.
- Reads normalized events through the store/controller path on the healthy path, not `events.jsonl`.
- Filters `run_activity.details.kind === "legacy_driver_event"` in normalized event order and extracts the legacy `DriverEvent` payloads.
- Treats `since` as a **legacy event count**, not a normalized seq. Implementation can read the full normalized stream for this compatibility tool, build `legacyEvents`, return `legacyEvents.slice(since)`, and set `cursor = legacyEvents.length`.
- Keeps response shape `{ events, cursor }`, existing compact summaries, and structured `details`.
- Fallback must catch **partial** normalized loss, not just total absence. Today each normalized append failure is caught per event and only reported to stderr (`drive_durable_event_append_failed` in `withSafeSchedulerEventWrites`); the failure is not persisted and later appends may still succeed, leaving a *partial-but-healthy-looking* normalized stream that is missing legacy events present in the dual-written JSONL. So before trusting normalized reconstruction `watch_events` must verify **completeness**, via two complementary signals:
  - **Completeness cross-check (primary).** While Drive still dual-writes legacy `missions/sessions/<planSlug>/runs/<runId>/events.jsonl` this wave, compare the count of reconstructed legacy events (from `run_activity` `legacy_driver_event` payloads) against the legacy JSONL event count. If the normalized reconstruction has fewer events than the legacy file (or the normalized record/events are absent or carry no `run_activity`), the normalized stream is incomplete: fall back to `tailEvents` over the legacy JSONL (authoritative this wave) and mark `source: "legacy-events-jsonl-fallback"` plus a divergence diagnostic.
  - **Persisted degraded marker (belt-and-suspenders).** When a normalized event append fails at the Drive edge, also write a best-effort degraded sentinel **directly to the run directory** (e.g. `compat-degraded.json`), *not* through the failing durable event store; if that marker exists for the run, `watch_events` takes the legacy fallback regardless of counts.
  - `run_status`/`run_watch` never use this fallback (normalized-only). The fallback is a `watch_events`-only compatibility affordance.
- Parity tests must include `since > 0`, events that produce multiple canonical normalized events, legacy advisory events that previously produced diagnostics-only normalized data, graph-backed Drive’s `graph-activity-only` filter, total durable-setup/append failure fallback, **and a partial mid-run append-failure case where some `run_activity` events are present but the reconstruction count is below the legacy JSONL count** (asserting divergence detection + legacy fallback, not a silently-truncated normalized projection).

Chain/Drive observation:

- Define the shared chain return contract in `lib/orchestration/types.ts` before T3, so tool and CLI do not invent divergent metadata. Today `runDurableChain` returns `Promise<ChainResult>` and `ChainResult` (`{ success, stageResults, totalDurationMs, errors, stats? }`) has no run identity. Add an optional `run?: { runId: string; scope: "chain" }` to `ChainResult`: `runDurableChain` populates it (it already generates `runId` locally and builds the `{ scope: "chain", runId }` ref); `runChain` (inline/legacy) leaves it `undefined`. The `chain_run ? runChain : runDurableChain` ternary keeps returning `ChainResult`, so callers are unchanged except for reading `result.run`.
- `chain_run` structured details and `cosmonauts run chain` JSON both read `result.run`; the inline result shape is explicitly `run: undefined` (non-durable / no run record). No frontend adds its own metadata field name.
- Graph-backed durable chains therefore expose `{ runId, scope: "chain" }` via `result.run` in tool/CLI details.
- `run_driver` includes `scope: planSlug` in addition to existing `planSlug`.
- Inline loop/completion chains remain legacy and explicitly non-durable/no-run-record (`result.run === undefined`).
- Scope policy: `"chain"` is the reserved normalized scope for graph-backed chains. Because Drive scope is `planSlug` by D-011, Drive frontends must reject `planSlug === "chain"` before lock acquisition or durable run creation. Do not silently prefix Drive scopes in this wave; the architecture record’s scope contract remains `scope: planSlug` for valid Drive plan slugs.

### Group C — `cosmonauts run` CLI and named-chain rename

Add `cli/run/subcommand.ts` and register `run` in `cli/main.ts` subcommand dispatch.

Bootstrapping seam (load-bearing): the subcommand dispatch in `cli/main.ts:795` (`process.argv[2]` → `createXProgram()` → `parseAsync(process.argv.slice(3))`) **bypasses** `parseCliArgs`/`parsePiFlags`/`buildCliParser`/`run()`. A `run` subcommand added there therefore does NOT inherit Pi-flag parsing, bundled/plugin-dir domain discovery, or the workflow runtime bootstrap that `handleWorkflowMode` relies on. Extract a shared bootstrap helper — Pi-flag parse + `--domain`/`--plugin-dir`/`--model`/`--thinking`/`--completion-label`/`--profile` resolution + `CosmonautsRuntime.create` — used by **both** the legacy workflow-mode path and `cli/run/subcommand.ts`. `cosmonauts run chain` declares those options on its own subcommand parser and calls the shared bootstrap; it must not depend on the top-level parser. A test exercises `run chain` with `--domain`, `--plugin-dir`, `--model`, `--thinking`, `--completion-label`, and `--profile` to prove parity with workflow mode.

Run CLI contract:

- Every `cosmonauts run ...` command writes exactly one JSON value to stdout.
- Human progress/warnings/diagnostics go to stderr.
- `run` does not accept `--json` or `--plain`, including `run chain list`.
- Detached starts exit `0` after launch; inline chain/Drive commands exit `0` only for success/completed outcomes.

Subcommands:

- `cosmonauts run chain <expression-or-name> [prompt...]`
  - Resolves exact named-chain matches before raw DSL. This reverses the shipped `resolveWorkflowExpression()` order intentionally because `isChainDslExpression()` returns true for single-token names like `verify` and `adapt`.
  - Resolution order: load named chains for the selected domain/project; if the token exactly matches a named chain, use that chain’s `.chain`; otherwise, if `isChainDslExpression(token)` is true, treat the token as raw DSL; otherwise return a JSON error for unknown named chain / invalid chain expression.
  - Bootstraps `CosmonautsRuntime` through the shared bootstrap seam above (not the top-level parser), preserving domain, plugin-dir, model, thinking, completion-label, and profile behavior.
  - Uses existing durable-or-inline predicate; no loop migration.
- `cosmonauts run chain --name <name> [prompt...]`
  - Explicit named-chain mode for command-name collisions and scripts that want no DSL fallback.
  - Performs exact named-chain lookup only. If missing, returns a JSON error; it never treats `<name>` as raw DSL.
  - Required collision case: a project-configured chain named `list` is listed and can be executed with `run chain --name list`, while bare `run chain list` remains the listing command.
- `cosmonauts run chain list`
  - Lists named chains from domain arrays and `.cosmonauts/config.json` `chains` map.
  - JSON-native under the `run` contract.
- `cosmonauts run drive ...`
  - Reuses current Drive option set and run-spec behavior.
  - Adds `scope: planSlug` to start/result JSON.
  - Rejects `--plan chain` as a reserved normalized scope before run creation.
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
- `list` is not a reserved registry key; it is only reserved as the bare `run chain list` command word.
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
- **Cross-process run initialization races duplicate or overwrite run state.** B-001 requires an initialization lock and a race test using separate store instances.
- **Partial graph initialization resumes into scheduler blocking.** B-004 requires idempotent missing-step seeding repair before scheduler reconciliation.
- **Drive finalizer polling leaks into generic runtime.** Keep callbacks generic and finalizer mapping in `lib/driver/`.
- **Safe scheduler wrapper changes reads.** `schedulerStore` must be a same-backing-store write wrapper only; tests must prove it cannot alter reconciliation reads or initialization locking.
- **Weak characterization tests.** Group A tests must assert meaningful run files/events/results, not call counts.
- **`watch_events` cursor parity regresses.** Since is legacy event count, not normalized seq; parity tests must include non-zero cursors and divergent normalized-event counts.
- **`run_activity` compatibility is filtered from graph-backed Drive.** Graph `graph-activity-only` mode must explicitly preserve `run_activity` while keeping canonical scheduler lifecycle authoritative.
- **Normalized append/setup failure hides legacy events — including partial mid-run loss.** Per-event append failures are only logged to stderr today, so a partial normalized stream can look healthy; `watch_events` must detect divergence (legacy-count cross-check + persisted degraded marker), not just total absence, before falling back to legacy JSONL with diagnostics. `run_status`/`run_watch` stay normalized only.
- **`run_activity` compatibility pollutes canonical status.** `run_status` must ignore `run_activity` for terminal status; canonical lifecycle events remain authoritative.
- **Named-chain lookup regresses shipped single-token names.** `run chain verify`/`adapt` must resolve named chains before raw DSL.
- **CLI command-name collisions make a valid named chain unreachable.** The `list` registry key remains valid and executable through explicit named-chain mode while bare `run chain list` lists.
- **CLI runtime bootstrapping regresses domain/Pi options.** Tests must cover domain/plugin/model/thinking/profile/completion-label behavior before old flags are removed.
- **Drive scope collides with reserved chain scope.** Reject `planSlug === "chain"` before run creation.
- **Rename churn leaves split terminology.** Final active code/docs should not teach workflows as a separate orchestration concept.
- **Spawn compiler changes hot path.** Tests must prove `spawn_agent` still returns `spawnId` and creates no durable run by default.
- **Scope creep into D-016.** New worktree execution, mutable-parallel scheduling, approval execution, and fan-out cap tuning stay out; existing type vocabulary may remain.

Pivot / abort conditions:

- If `runStart` requires frontend-specific Drive or chain types in `lib/durable-runtime`, stop and redesign.
- If `watch_events` parity needs more than the single generic `run_activity` variant plus Drive-edge detail/fallback, pause for architecture confirmation.
- If removing old CLI names strands internal callers, keep temporary aliases only long enough to migrate those callers, then remove before Group E/final gates.

## Quality Contract

All task waves use the same ladder. Per-task implementation may run focused subsets first, but final integration covers the whole plan.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests for touched behavior pass; final integration correctness evidence passes | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for this plan | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Targeted negative/edge checks cover concurrent `runStart` create/adopt, partial seeding repair, separate interruption result typing, safe scheduler wrapper reads, graph-backed `run_activity` preservation, watch_events non-zero cursor/fallback parity, named-chain-before-DSL precedence, list collision, reserved `chain` Drive slug, removed CLI names, no run spawn, no nested-run fields/backend, and unchanged spawn_agent behavior | pending | unbound mechanically; reviewer judgment required |
| 4 | `duplication` | bindable | bound | Chain and Drive no longer duplicate create-run/write-graph/init-step/scheduler-loop boilerplate outside `runStart`; remaining duplication is frontend-specific result mapping | reviewer evidence | hard fail for reintroducing a second run-start envelope |
| 5 | `complexity` | bindable | bound | `runStart`, named-chain resolution, and `watch_events` compatibility stay cohesive without speculative nested-run/worktree abstractions or broad parser frameworks beyond the needed seams | reviewer evidence | hard fail for avoidable surface-expanding complexity |
| 6 | `boundary-conformance` | bindable | bound | Project-bound static/type boundary checks pass; no generic runtime import of Drive/CLI/domain/task modules; Drive compatibility and finalizer concepts stay at the Drive edge | project-discovered + reviewer evidence | hard fail in this project; not a universal artifact gate |
| 7 | `dead-code` | bindable | unbound | Old workflow/drive CLI paths and workflow registry names are removed or intentionally temporary within an in-progress task, not left as final unused public surface | pending | unbound mechanically; reviewer judgment required |

## Implementation Order

Dependency shape: **A → B/C/D → E**. Group A is the first merge gate. Groups B, C, and D start only after A is green. Group E lands last.

### T1 — Group A: Add `runStart` contract and characterization guards

- Dependencies: none.
- Behaviors: B-001, B-004 plus RED portions of B-002 and B-003.
- Acceptance criteria:
  - Add `lib/durable-runtime/run-start.ts` contract, explicit `RunStartState`/`RunStartInterruption`, and a discriminated `RunStartResult` union where interruptions do not extend or fake `RunGraphSchedulerResult`.
  - Add the store initialization-lock contract and `FileRunStore` implementation; `runStart` re-loads inside the lock and appends at most one `run_started`.
  - Add create/adopt/seed-once tests, including two process-local `FileRunStore` instances racing to start the same `RunRef`.
  - Add chain and Drive characterization tests that pass against current behavior before the refactor.
  - Add resume/rehydration tests proving persisted graph/step/result state is authoritative and partial/zero initial step records are repaired idempotently when the persisted graph matches.
  - Add graph-mismatch initialization diagnostic coverage proving `runStart` blocks/interrupts rather than overwriting a conflicting persisted graph.
  - Add safe-wrapper invariant test proving a scheduler store wrapper cannot change initialization locking or reads/reconciliation state.

### T2 — Group A: Route durable chain and Drive through `runStart`

- Dependencies: T1.
- Behaviors: B-001, B-002, B-003, B-004.
- Acceptance criteria:
  - `runDurableChain` delegates create/write/seed/scheduler loop to `runStart` and keeps chain behavior at the chain edge.
  - `compileDriveRunToGraph` is split so `runDriveOnGraph` calls `runStart` with Drive graph/initial steps/create-run metadata.
  - Drive finalizer polling and safe event writes remain Drive-edge layers.
  - Drive resume/repair compiles the graph from persisted `metadata.driveTaskIds` via `withAuthoritativeTaskIds`, never a `remainingTaskIds` slice; a named test pins `driveTaskIds` vs `remainingTaskIds` across resume and partial-init repair.
  - Durable chain and Drive graph tests remain green, including detached frozen-runner safety and partial-init repair.

### T3 — Group B: Surface run metadata and normalized observation for graph-backed agent tools

- Dependencies: T2.
- Behaviors: B-005, B-006, B-007.
- Acceptance criteria:
  - Add `ChainResult.run?: { runId; scope: "chain" }`; `runDurableChain` populates it, `runChain` leaves it undefined; a test pins both the durable and inline result shapes.
  - `chain_run` details include `{ runId, scope: "chain" }` (from `result.run`) for graph-backed chains.
  - `run_driver` response includes `scope: planSlug` while keeping `planSlug`.
  - `run_driver` rejects reserved `planSlug === "chain"` before lock acquisition or durable run creation.
  - Inline loop/completion chains remain legacy and explicitly non-durable.
  - `run_status`/`run_watch` observe returned chain and Drive run IDs without frontend-specific branches.

### T4 — Group B: Re-implement `watch_events` over normalized events with cursor parity

- Dependencies: T2, T3.
- Behaviors: B-008, B-009.
- Acceptance criteria:
  - Add generic `run_activity` event variant and controller summary support.
  - Drive emits one `run_activity` compatibility event carrying the original `DriverEvent` for every legacy Drive event, including diagnostics-only/advisory legacy events.
  - `graph-activity-only` mode preserves `run_activity` through `processDurableDriverEvent()` while continuing to filter duplicate canonical lifecycle events.
  - `watch_events` reads normalized events on the healthy path, filters `legacy_driver_event` activity, applies legacy event-count cursor semantics, and keeps response shape/summaries.
  - `watch_events` verifies normalized completeness before trusting reconstruction: a count cross-check against the dual-written legacy JSONL plus a best-effort persisted `compat-degraded` marker (written to the run dir, not via the failing event store) trigger a legacy `events.jsonl` fallback with an explicit source/diagnostic; `run_status`/`run_watch` do not use the fallback.
  - Parity tests include cursor 0, non-zero `since`, one-to-many canonical normalization, advisory events, graph-backed Drive mode, total durable-append/setup failure fallback, and a **partial mid-run append-failure** case (some `run_activity` present, reconstruction count below legacy JSONL → divergence detected → legacy fallback).

### T5 — Group C: Rename workflow registry to named chains

- Dependencies: T2.
- Behaviors: B-011, B-015.
- Acceptance criteria:
  - Add `lib/chains/*` and `NamedChain`.
  - Define `ProjectConfig.chains?: Record<string, { description?: string; chain: string }>`; project entries override domain entries by key/name.
  - Update domain loader/runtime/config/validator to `chains` naming.
  - Rename domain defaults to `chains.ts` and update tests.
  - Registry accepts a project chain named `list` as normal data.
  - No final `workflows` project-config alias or `RunRecord.kind` work is introduced.

### T6 — Group C: Add `cosmonauts run` observation and chain commands

- Dependencies: T3, T5.
- Behaviors: B-010, B-011, B-013.
- Acceptance criteria:
  - Register `cosmonauts run`, and extract the shared bootstrap seam (Pi-flags + domain/plugin-dir/model/thinking/completion-label/profile + `CosmonautsRuntime.create`) used by both workflow mode and `cli/run/*`, since the subcommand dispatch at `cli/main.ts:795` otherwise bypasses top-level flag parsing. A test proves `run chain` honors those options.
  - Implement `run status|watch|list` over normalized controller/store with scope resolution and JSON-only stdout.
  - Implement `run chain <expression-or-name>` using named-chain exact lookup before raw DSL fallback; tests include shipped single-token named chain `verify` or `adapt`.
  - Implement `run chain --name <name>` as explicit named-only mode; tests include a project chain named `list` and verify bare `run chain list` still lists.
  - Implement `run chain list` using `lib/chains`, preserving applicable domain/model/thinking/completion/profile behavior.
  - Progress goes to stderr; stdout is exactly one JSON value.

### T7 — Group C: Move Drive CLI onto `cosmonauts run drive` and remove final old orchestration CLI surface

- Dependencies: T2, T6.
- Behaviors: B-012, B-014.
- Acceptance criteria:
  - Extract/move current Drive CLI helpers so `run drive` uses the same spec, resume, dirty-worktree, pending-finalization, inline/detached, and backend behavior.
  - `run drive` output matches current Drive JSON plus `scope`.
  - `run drive --plan chain` is rejected before durable run creation.
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
  - Absence checks target new deferred execution surfaces, not existing durable-runtime type vocabulary.

### T10 — Final integration and boundary cleanup

- Dependencies: T1 through T9.
- Behaviors: all, especially B-019.
- Acceptance criteria:
  - Full project correctness and boundary gates pass.
  - Artifact conformance for this plan passes.
  - No generic runtime import violates dependency direction.
  - No `nested-run` backend, parent run fields, `RunRecord.kind`, `run spawn`, reserved Drive `chain` scope creation, new mutable-parallel execution path, new worktree isolation execution path, merge finalizer, approval-gate execution path, or fan-out cap tuning landed.
  - Existing shipped vocabulary (`StepKind` `"approval"`, `WorktreeSpec`, `RunPolicy.maxParallelSteps`) is allowed to remain and is not treated as failure by absence tests.
  - Remove any temporary aliases left from intermediate tasks.

## Reviewer Resolution

- **PR-001 — `watch_events` cursor parity.** Resolved by adding explicit legacy event-count cursor semantics, requiring full normalized-stream reconstruction or equivalent legacy-index metadata, adding `since > 0` parity tests, and introducing one generic `run_activity` compatibility event carrying original Drive events from the Drive edge.
- **PR-002 — `run_driver` scope.** Resolved by adding B-006 and T3 acceptance for `run_driver` returning `scope: planSlug` while preserving `planSlug`.
- **PR-003 — named-chain ordering.** Resolved by moving named-chain registry work to T5 before `run chain <name>`/`run chain list` in T6; B-011 is owned by the CLI task after the registry exists.
- **PR-004 — `runStart` implicit contracts.** Resolved by defining `RunStartState`, `RunStartInterruption`, and the same-backing-store scheduler wrapper invariant, with an explicit acceptance check.
- **PR-005 — project `chains` config shape.** Resolved by specifying `ProjectConfig.chains?: Record<string, { description?: string; chain: string }>` with key-as-name and project-over-domain precedence; no final `workflows` alias.
- **PR-006 — named-chain resolution precedence.** Resolved by prescribing exact named-chain lookup before raw DSL for `run chain <expression-or-name>`, because shipped single-token names such as `verify`/`adapt` satisfy `isChainDslExpression()`. B-011/T6 now require a shipped single-token named-chain test and keep `run chain list` as the listing command.
- **PR-007 — `RunStartResult` type.** Resolved by choosing a separate discriminated union: scheduler completions use `RunStartSchedulerResult extends RunGraphSchedulerResult`, while pre-pass/stop-policy interruptions use `RunStartInterruptedResult` and do not pretend `exitReason: "interrupted"` is a shipped scheduler exit reason.
- **PR-008 — graph-activity-only filter.** Resolved by requiring `graph-activity-only` Drive sinks to allow `run_activity` compatibility events through the filter while still filtering duplicate canonical lifecycle events; B-008/T4 cover the real graph-backed Drive path.
- **PR-009 — partial-init resume.** Resolved by choosing idempotent repair: under the initialization lock, `runStart` repairs missing pending step records for a matching persisted graph before scheduling, and blocks with an explicit diagnostic only when the persisted graph conflicts with the compiled graph.
- **PR-010 — non-goal tests.** Resolved by narrowing B-019/T10 absence checks to genuinely new deferred surfaces (`nested-run`, parent fields, `RunRecord.kind`, `run spawn`, new mutable-parallel/worktree/merge/approval execution paths, fan-out cap tuning) and explicitly allowing shipped type vocabulary like `StepKind: "approval"`, `WorktreeSpec`, and `maxParallelSteps`.
- **PR-011 — Quality Contract ladder.** Resolved by reordering the ladder to correctness, artifact-conformance, mutation, duplication, complexity, boundary-conformance, dead-code and classifying boundary-conformance as a bindable project-bound gate rather than universal.
- **Missing coverage — cross-process `runStart` create-if-absent races.** Resolved by adding the store initialization-lock contract, re-load-inside-lock rule, one-`run_started` guarantee, and a two-`FileRunStore` same-`RunRef` race test in B-001/T1.
- **Missing coverage — `run chain list` and a project chain named `list`.** Resolved by keeping bare `run chain list` as the listing command, allowing `list` as a registry key, and adding explicit named-only execution via `run chain --name list` with B-011/T5/T6 coverage.
- **Missing coverage — normalized-event failure fallback.** Resolved by keeping normalized reconstruction as the healthy path while adding an explicit `watch_events`-only legacy JSONL fallback with source/diagnostic when durable setup/append fails after the legacy event file was written; `run_status`/`run_watch` remain normalized-only.
- **Missing coverage — Drive plan slug collides with reserved chain scope.** Resolved by reserving `scope: "chain"` for graph-backed chains and requiring `run_driver`/`run drive` to reject `planSlug === "chain"` before durable run creation, preserving D-011’s `scope: planSlug` rule for valid Drive plans.

### Round 2 (review IDs renumbered PR-001..PR-004)

- **R2-PR-001 (high) — `watch_events` cannot detect partial normalized-event loss.** Resolved in Group B / B-008 / T4: completeness is verified before trusting normalized reconstruction via a count cross-check against the dual-written legacy JSONL plus a best-effort persisted `compat-degraded` marker (written to the run dir, not the failing event store); either signal triggers the `watch_events`-only legacy fallback with a divergence diagnostic. Parity tests now include a partial mid-run append-failure case, not only total absence.
- **R2-PR-002 (medium) — no contract carries durable chain `runId` to tools/CLI.** Resolved in Group B / B-005 / T3: add `ChainResult.run?: { runId; scope: "chain" }`, populated by `runDurableChain` and left `undefined` by inline `runChain`; `chain_run` details and `cosmonauts run chain` JSON both read `result.run`, and a test pins both the durable and inline result shapes. (Covers the missing inline-result-shape item.)
- **R2-PR-003 (medium) — `cosmonauts run` bootstrap bypasses Pi-flag/runtime parsing.** Resolved in Group C / B-010 / T6: the `cli/main.ts:795` subcommand dispatch bypasses the top-level parser, so a shared bootstrap seam (Pi-flags + `--domain`/`--plugin-dir`/`--model`/`--thinking`/`--completion-label`/`--profile` + `CosmonautsRuntime.create`) is extracted and used by both workflow mode and `cli/run/*`; a test proves `run chain` parity on those options. (Covers the missing run-chain-options coverage item.)
- **R2-PR-004 (medium) — Drive resume `driveTaskIds` invariant not pinned.** Resolved in Group A / B-003 / T2: the `runStart` refactor must (re)compile/repair Drive graphs from the persisted authoritative `metadata.driveTaskIds` (via `withAuthoritativeTaskIds`), never a `remainingTaskIds` slice or current selection, so a recoverable resumed/partially-initialized run is not misread as `run_start_graph_mismatch`; a named `driveTaskIds`-vs-`remainingTaskIds` resume test pins it.
