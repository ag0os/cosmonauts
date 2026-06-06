---
title: 'Durable Runtime Phase 4: Frontend Migration'
status: completed
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-05T01:01:49.834Z'
---

## Overview

Move the safe user-facing orchestration frontends onto the durable runtime without broad semantic rewrites.

This plan implements Plan 4 of the durable orchestration runtime track after Plans 1–3. It ships in two independently releasable groups:

- **Group A — durable chain compiler:** compile loop-free chain DSL shapes into a durable graph for `chain_run` and the CLI `-w/--workflow` path, while keeping loop/completion-check chains on the legacy inline runner.
- **Group B — Drive-on-graph:** compile Drive task runs into a durable graph and run that graph through the scheduler, preserving the current Drive CLI/tool surface, event/watch UX, resume/finalization recovery, and detached frozen-runner safety.

The implementation is intentionally conservative. It does not migrate coordinator loops, does not add mutating controller tools, does not add per-step frozen runner binaries, and does not introduce default concurrent mutable work.

## Architecture Context

This plan implements the fourth slice of `missions/architecture/durable-orchestration-runtime.md`.

Relevant durable-runtime decisions:

- `D-001 - One runtime, multiple frontends`: chains/workflows and Drive compile into the shared runtime graph.
- `D-003 - Drive compatibility before chain migration`: reuse Drive's concrete compatibility surface and recovery behavior.
- `D-006 - Step results must distinguish unknown from success`: malformed or ambiguous backend reports must not silently advance as success.
- `D-008 - Durable chains start narrow`: only sequential, bracket-parallel, and fan-out chain shapes move to durable execution; loops stay inline.
- `D-009 - Wave-1 controller surface is read-only`: this plan may add internal run-start wrappers, but no `run_pause`, `run_cancel`, `run_resume`, or `run_intervene` tools.
- `D-010 - Scheduler runs in-process for wave 1`: the scheduler is invoked as a library. For detached Drive this means in-process inside the frozen child, not in the mutable host.

Cross-plan acceptance scenarios that are first-class for this plan:

- **Scenario 1 — Large implementation plan:** a Drive-like graph survives session death and resumes cleanly.
- **Scenario 5 — Self-modifying Cosmonauts run:** Drive-on-graph preserves the existing detached frozen runner `cosmonauts-drive-step`; the host may self-modify while only observing `run.completion.json`.

Confirmed product/architecture decision for this plan: **Architecture X — scheduler-inside-frozen-child.** Detached Drive still spawns the run-level frozen `bin/cosmonauts-drive-step`; inside that child, `lib/driver/run-step.ts` calls the shared graph entry. Inline Drive calls the same entry in the host process. Generic per-step frozen runners are post-production and are not designed here.

Scheduler/finalizer constraint verified for this revision: `lib/durable-runtime/scheduler.ts` only preserves a retry result when `attemptNumber < effectiveMaxAttempts`; with no step retry policy and no run retry limit, `effectiveMaxAttempts` defaults to 1 and `stepTransitionFromResult` rewrites the persisted step result to blocked/wait-for-human. Drive finalizer steps in this plan therefore carry an explicit finalizer retry policy, and Drive maps finalization failure from persisted finalizer attempt/result evidence plus `pending-finalization.json`, not from an in-memory scheduler transition.

## Current State

Plans 1–3 already provide the generic durable substrate:

- `lib/durable-runtime/types.ts` defines `RunGraph`, `RunGraphStep`, `StepRecord`, `SchedulerStepInput`, `StepResult`, `RunStore`, and known backend names including `shell-command`.
- `lib/durable-runtime/file-store.ts` provides `createRun`, `writeRunGraph`, `writeStepRecord`, event append/read, scheduler-state persistence, and step-attempt persistence under `missions/sessions/<scope>/runs/<runId>/`.
- `lib/durable-runtime/scheduler.ts` exports `runDurableGraphScheduler({ store, ref, backends, holderId, inputForStep })`. It accepts only `RunGraphSchedulerBackend = OrchestrationBackend<SchedulerStepInput, StepResult>`, reconciles persisted graph/step records, blocks potentially committed running steps, leaves fresh external running work alone, retries only within `effectiveMaxAttempts`, and finalizes runs from persisted step records.
- `lib/durable-runtime/controller.ts` exposes read-only `runStatus` and `runWatch`; `domains/shared/extensions/orchestration/run-control-tools.ts` registers only read APIs.

Drive already has compatibility behavior that must be preserved:

- `lib/driver/driver.ts` exposes `runInline` and `startDetached`; detached mode prepares a workdir, writes `spec.json` and `task-queue.txt`, copies or compiles `bin/cosmonauts-drive-step`, launches `run.sh`, and waits for `run.completion.json`.
- `lib/driver/run-step.ts` is the frozen detached entry today; it reads `spec.json`, creates the backend/task manager, runs `runRunLoop`, and writes completion.
- `lib/driver/run-run-loop.ts` emits legacy `DriverEvent`s, iterates `spec.taskIds` sequentially, stops on blocked/finalization-failed outcomes, and performs the terminal state commit.
- `lib/driver/run-one-task.ts` contains the current preflight, backend invocation, postflight, report parsing, `D-006` unknown-vs-success inference, commit, and task-status behavior.
- `lib/driver/durable-steps.ts` already projects Drive events into task/finalizer step records and defines the finalizer ID convention: `finalizer-source-commit-<taskId>`, `finalizer-task-status-<taskId>`, and `finalizer-state-commit`.
- `lib/driver/event-stream.ts` writes legacy `events.jsonl`, publishes Drive bus events, and can dual-write normalized events for the legacy loop path; it currently needs an explicit graph activity-only durable sink mode so graph runs do not duplicate scheduler lifecycle events.
- `cli/drive/subcommand.ts` owns Drive CLI compatibility, including `--resume`, dirty-worktree refusal, pending-finalization retry, external state-commit acceptance, `status`, and `list` classification. Its current resume path slices `spec.taskIds` to the remaining queue; graph resume must keep the original selected IDs separately authoritative.
- `domains/shared/extensions/orchestration/driver-tool.ts` owns the `run_driver` tool surface and default inline/detached mode selection.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` reads legacy `events.jsonl`; this tool's response shape must remain compatible.

Chains already expose the narrow graphable shapes without parser changes:

- `lib/orchestration/chain-parser.ts` parses sequential stages, bracket groups, and fan-out into `ChainStep[]`.
- `lib/orchestration/chain-steps.ts` provides `isParallelGroupStep`, prompt injection, and formatting helpers.
- `lib/orchestration/chain-runner.ts` owns the legacy inline runner, including loop execution in `runLoopStage`/`evaluateLoopState`, and emits `ChainEvent` variants whose `agent_*` events require `role`, `sessionId`, and `SpawnEvent` payloads.
- `lib/orchestration/types.ts` confirms `ChainEvent` requires those agent-event fields, while `lib/durable-runtime/types.ts` normalized `OrchestrationEvent` does not carry them except through opaque `step_tool_activity.details`.
- `domains/shared/extensions/orchestration/chain-tool.ts` parses and runs `chain_run` through `runChain`.
- `cli/main.ts` handles `-w/--workflow` in `handleWorkflowMode`; there is no `--chain` flag.

Missing Plan-4 pieces:

1. No chain compiler writes a durable run graph.
2. No Drive graph compiler writes a graph for a selected `DriverRunSpec`.
3. The Drive backend adapter in `lib/driver/backends/orchestration-adapter.ts` is intentionally not assignable to the scheduler backend type; Plan 4 must add the `BackendInvocation` builder bridge.
4. No runnable scheduler `shell-command` backend exists for Drive finalizers.
5. No shared `runDriveOnGraph` entry exists for inline and frozen-detached Drive.
6. The current wrappers still call `runChain` or `runRunLoop` directly.

## Behaviors

### B-001 - Sequential chain stages compile into durable dependencies

- Source: AC-003, D-008
- Context: a loop-free chain expression parses to two sequential stages, for example `planner -> reviewer`.
- Action: the chain compiler folds the parsed `ChainStep[]` into a `RunGraph`.
- Expected: the graph contains one agent step per stage, in declaration order, with the second step depending on the first and no parser behavior changed.
- Seam: `lib/orchestration/durable-chain-compiler.ts` > `compileChainToGraph`
- Test: `tests/orchestration/chain-compiler.test.ts` > `compiles sequential stages into a dependency chain`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-001

### B-002 - Bracket groups compile as parallel siblings with a joined frontier

- Source: AC-003, D-008
- Context: a loop-free expression parses to a sequential stage, a bracket group, and a following stage, for example `planner -> [task-manager, reviewer] -> quality-manager`.
- Action: the compiler lowers the bracket group.
- Expected: bracket members are sibling agent steps sharing the previous frontier as dependencies, and the following step depends on all bracket members.
- Seam: `lib/orchestration/durable-chain-compiler.ts` > `compileChainToGraph`
- Test: `tests/orchestration/chain-compiler.test.ts` > `compiles bracket groups as sibling steps and joins the next frontier`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-002

### B-003 - Fan-out compiles as same-role sibling steps

- Source: AC-003, D-008
- Context: a loop-free expression contains fan-out syntax, for example `reviewer[3]`.
- Action: the compiler lowers the parsed fan-out `ParallelGroupStep`.
- Expected: the graph contains exactly three sibling agent steps with the same role and prompt options, all sharing the prior frontier dependencies and all contributing to the next frontier.
- Seam: `lib/orchestration/durable-chain-compiler.ts` > `compileChainToGraph`
- Test: `tests/orchestration/chain-compiler.test.ts` > `compiles fan-out as same-role sibling steps`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-003

### B-004 - Chain step options preserve prompt and model resolution inputs

- Source: AC-003, AC-007
- Context: the caller supplies a prompt, model/thinking defaults, and project/domain runtime context before compilation.
- Action: prompt injection runs before compilation and the compiler records stage execution options in each graph step's backend options.
- Expected: the first executable stage(s) receive the injected user prompt, and each durable agent step carries enough persisted role/prompt/model/thinking/domain metadata for the scheduler backend to run the same stage the inline runner would have run.
- Seam: `lib/orchestration/chain-steps.ts` > `injectUserPrompt`; `lib/orchestration/durable-chain-compiler.ts` > `compileChainToGraph`
- Test: `tests/orchestration/chain-compiler.test.ts` > `persists chain stage options for prompt injection model and thinking`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-004

### B-005 - Unsupported chain semantics stay on the legacy inline path

- Source: AC-004, D-008
- Context: parsed chain steps include a loop stage, any stage has a `completionCheck`, or the caller supplies `completionLabel`.
- Action: the chain wrapper evaluates the inline-fallback predicate after `injectUserPrompt`.
- Expected: `hasLoop = steps.some(s => !isParallelGroupStep(s) && s.loop)` or any completion-check/completion-label condition routes to `runChain`; no durable graph is written for coordinator loops or completion-waiting flows.
- Seam: `lib/orchestration/durable-chain-compiler.ts` > `shouldRunChainInline`; `lib/orchestration/chain-runner.ts` > `runChain`
- Test: `tests/orchestration/chain-routing.test.ts` > `keeps loop and completion-check chains on the legacy inline runner`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-005

### B-006 - Durable chain events preserve existing progress UX

- Source: AC-002, AC-003, AC-007
- Context: a loop-free chain runs through `runDurableGraphScheduler`; the chain scheduler backend appends normalized scheduler events plus chain-specific agent evidence in `step_tool_activity.details`.
- Action: the chain event adapter observes normalized run/step events, compiler metadata, and the durable agent evidence records.
- Expected: existing `ChainEvent` consumers receive equivalent `chain_start`, `stage_start`, `parallel_start`, `stage_end`, `parallel_end`, `chain_end`, and `error` progress lines from scheduler metadata; `agent_spawned`, `agent_completed`, `agent_turn`, and `agent_tool_use` are reproduced only from persisted detail records carrying role, Pi `sessionId`, and `SpawnEvent` payloads. The adapter must not fabricate agent session IDs from compiler metadata when evidence is absent; the negative proof emits no `agent_*` event and records a diagnostic/error path rather than a type-invalid placeholder.
- Seam: `lib/orchestration/chain-event-adapter.ts` > `adaptOrchestrationEventToChainEvents`; `lib/orchestration/chain-scheduler-backend.ts` > durable chain agent evidence append
- Test: `tests/orchestration/chain-event-adapter.test.ts` > `maps durable chain spawn evidence to ChainEvents and refuses to fabricate missing session ids`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-006

### B-007 - `chain_run` routes supported chains through the durable graph

- Source: AC-002, AC-003, AC-004
- Context: an agent calls the `chain_run` tool with either a loop-free supported expression or a loop/completion expression.
- Action: `domains/shared/extensions/orchestration/chain-tool.ts` parses, injects prompt, evaluates the fallback predicate, and chooses the durable or legacy path.
- Expected: supported sequential/bracket/fan-out chains compile and run through the scheduler while preserving the tool's final result/progress response shape; unsupported loop/completion chains still call `runChain` inline.
- Seam: `domains/shared/extensions/orchestration/chain-tool.ts` > `registerChainTool`
- Test: `tests/extensions/orchestration-chain-tool-durable.test.ts` > `routes loop-free chain_run through the durable graph and loop chains inline`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-007

### B-008 - `-w/--workflow` uses the same durable-or-inline chain routing

- Source: AC-002, AC-003, AC-004, AC-007
- Context: a user invokes `cosmonauts -w <workflow-or-dsl> <prompt>`; named workflows have already resolved to a chain expression.
- Action: `handleWorkflowMode` parses, injects prompt, evaluates the fallback predicate, and chooses the durable or legacy path.
- Expected: loop-free raw DSL and loop-free named workflows run through the durable chain path, while workflows containing a loop role or completion label remain on the legacy inline runner; no `--chain` flag is introduced.
- Seam: `cli/main.ts` > `handleWorkflowMode`; `cli/main.ts` > `resolveWorkflowExpression`
- Test: `tests/cli/workflow-durable-routing.test.ts` > `routes loop-free -w workflows through the durable graph and loop workflows inline`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-008

### B-009 - Drive task selection compiles into a sequential graph

- Source: AC-001
- Context: a `DriverRunSpec` contains selected `taskIds`, including an explicit `--task-ids` order when provided.
- Action: the Drive graph compiler emits task graph steps.
- Expected: the graph contains one `kind: drive` task step per originally selected task ID, uses the task ID as the step ID, preserves the exact selected order, and — to keep the legacy per-task backend → source-commit → task-status → next ordering — sets each task step after the first to depend on the previous selected task's task-status finalizer (`finalizer-task-status-<prevTaskId>`) rather than on the previous task step directly. (A direct task→task dependency would let task N+1's backend start before task N's source-commit/task-status finalizers run, interleaving commits.)
- Seam: `lib/driver/drive-graph-compiler.ts` > `compileDriveRunToGraph`
- Test: `tests/driver/drive-graph-compiler.test.ts` > `compiles selected task ids into sequential drive task steps`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-009

### B-010 - Drive finalizer steps are policy-gated and executable in current phase order

- Source: AC-001, AC-002
- Context: a `DriverRunSpec` has a commit policy and optional state-commit policy.
- Action: the Drive graph compiler adds finalizer steps and seeds matching `StepRecord`s.
- Expected: source-commit finalizers are emitted only when `commitPolicy === "driver-commits"`; task-status finalizers are emitted where task-state mutation is needed; the terminal state-commit finalizer is emitted only when `resolveStateCommitPolicy(spec) === "final-state-commit"`; IDs reuse `durable-steps.ts` conventions and dependencies preserve the current `backend/report -> source commit -> task status -> final state commit` ordering.
- Seam: `lib/driver/drive-graph-compiler.ts` > `compileDriveRunToGraph`; `lib/driver/types.ts` > `resolveStateCommitPolicy`
- Test: `tests/driver/drive-graph-compiler.test.ts` > `adds only policy-enabled drive finalizer steps in executable order`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-010

### B-011 - The Drive scheduler bridge builds real backend invocations

- Source: AC-001, AC-002
- Context: the scheduler starts a Drive task step with only `SchedulerStepInput` and the persisted graph step.
- Action: `createDriveSchedulerBackend(...).prepare` closes over the Drive run context and renders the task prompt.
- Expected: `prepare` calls `renderPromptForTask`, writes `prompts/<taskId>.md`, and assembles a full `BackendInvocation` containing `runId`, `promptPath`, `workdir`, `projectRoot`, `taskId`, `parentSessionId`, `planSlug`, `eventSink`, and the scheduler signal; task ID validation uses the authoritative original selected task set, not a resume remaining-queue slice; no generic durable-runtime module imports Drive backend invocation types.
- Seam: `lib/driver/drive-scheduler-backend.ts` > `createDriveSchedulerBackend`; `lib/driver/prompt-template.ts` > `renderPromptForTask`
- Test: `tests/driver/drive-scheduler-backend.test.ts` > `builds BackendInvocation from scheduler input and rendered task prompts`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-011

### B-012 - Drive task execution preserves preflight, postflight, report, and inference behavior

- Source: AC-002, AC-008, D-006
- Context: a Drive task runs through the scheduler bridge with configured preflight/postflight commands and backend stdout.
- Action: the bridge backend `start` runs preflight, invokes the selected backend, runs postflight, parses the report, applies the existing unknown-vs-success inference rule, and returns a scheduler `StepResult` or compatible blocking/finalization outcome.
- Expected: preflight failure blocks before backend invocation; postflight failure blocks even if the backend exits zero; malformed/missing reports remain unknown/blocked unless the existing inference conditions pass; partial mode and unchecked acceptance-criteria handling match current Drive behavior.
- Seam: `lib/driver/drive-scheduler-backend.ts` > `start`; `lib/driver/report-parser.ts` > `parseReport`; `lib/driver/run-one-task.ts` current `deriveOutcome`/`canInferUnknownSuccess` behavior to relocate or share
- Test: `tests/driver/drive-scheduler-backend.test.ts` > `runs preflight backend postflight and report inference before returning StepResult`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-012

### B-013 - Drive scheduler backend map registers only the selected backend plus finalizers

- Source: AC-006, AC-007, Scenario 1
- Context: a Drive graph run has already resolved exactly one selected production backend from `spec.backendName`; detached mode still rejects `cosmonauts-subagent` before construction.
- Action: the Drive graph runner builds the scheduler backend map for that run.
- Expected: the map contains the selected Drive backend wrapped as `RunGraphSchedulerBackend` using its entry in `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES`, plus `shell-command` for finalizers. It does not construct/register all three Drive backends in one production run. Across parametrized tests, `codex` remains isolated/non-committing, `claude-cli` remains isolated/commit-capable, `cosmonauts-subagent` remains shared-worktree/commit-capable, and all stay non-resumable/non-cancellable for wave 1.
- Seam: `lib/driver/drive-scheduler-backend.ts` > `createDriveSchedulerBackendMap`; `lib/driver/backends/orchestration-adapter.ts` > `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES`
- Test: `tests/driver/drive-scheduler-backend.test.ts` > `registers only the selected drive backend with production recovery capabilities`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-013

### B-014 - Shell-command finalizers perform source commits and task-status updates

- Source: AC-001, AC-002
- Context: a completed Drive task reaches its finalizer steps under `driver-commits`.
- Action: the scheduler runs the `shell-command` backend for source-commit and task-status finalizer steps.
- Expected: source changes are committed with the same subject/exclusion behavior as today's `maybeCommit`; task status transitions to `Done` with the same legacy `finalize`, `commit_made`, and `task_done` events; the finalizer `StepResult` includes commit artifacts when commits are created.
- Seam: `lib/driver/shell-command-finalizer.ts` > `createDriveShellCommandBackend`; `lib/driver/drive-finalization.ts` shared finalization helpers
- Test: `tests/driver/shell-command-finalizer.test.ts` > `commits source changes and marks task status through shell finalizer steps`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-014

### B-015 - Retryable finalizer failures map to current Drive finalization_failed state

- Source: AC-002, AC-008, scheduler finalization rule
- Context: a source-commit, task-status, or state-commit finalizer fails after task work has otherwise reached the finalization phase.
- Action: the `shell-command` backend records pending finalization and returns a retryable failed finalizer result; the seeded finalizer `StepRecord` has the explicit Drive finalizer retry policy so the scheduler does not normalize the first retryable result to blocked.
- Expected: `pending-finalization.json` is written with the same phase-specific fields as today; the latest finalizer attempt result and persisted `StepRecord.result` both retain `nextAction: "retry"` after scheduler transition; `runDriveOnGraph` reloads those persisted records plus `pending-finalization.json` and maps to `outcome: "finalization_failed"` with today's `finalizationPhase`, `finalizationReason`, optional task/commit fields, and `pendingFinalizationPath`. The mapping is driven by persisted finalizer evidence, not by an in-memory scheduler `nextAction`, and the task step is not converted into a behavioral task failure.
- Seam: `lib/driver/shell-command-finalizer.ts` > `createDriveShellCommandBackend`; `lib/driver/run-state.ts` > `writePendingFinalization`; `lib/driver/durable-steps.ts` > `recordDurableFinalizerRetryFailure`; `lib/driver/drive-graph-runner.ts` > `readRetryableDriveFinalizerFailure`
- Test: `tests/driver/shell-command-finalizer.test.ts` > `records retryable finalizer failures from persisted attempt evidence as finalization_failed`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-015

### B-016 - Inline Drive runs execute the graph scheduler in the host process

- Source: AC-002, AC-005, D-010
- Context: Drive is started in `mode: inline` through the CLI or tool path.
- Action: the Drive wrapper calls the shared `runDriveOnGraph` entry directly.
- Expected: the run workdir, `spec.json`, `task-queue.txt`, `events.jsonl`, `run.inline.json`, durable `graph.json`, step records, and final `run.completion.json` are produced with the current inline CLI/tool response behavior; `runRunLoop` remains available only as the legacy/debug path, not the production graph path.
- Seam: `lib/driver/drive-graph-runner.ts` > `runDriveOnGraph`; `lib/driver/driver.ts` > `runInline`
- Test: `tests/driver/drive-on-graph-routing.test.ts` > `runs inline Drive through runDriveOnGraph in the host process`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-016

### B-017 - Detached Drive runs execute the scheduler inside the frozen child

- Source: AC-005, Scenario 5, D-010
- Context: Drive is started in `mode: detached` with `codex` or `claude-cli`.
- Action: the host prepares the run workdir and frozen `bin/cosmonauts-drive-step` exactly as today, then the child entry calls `runDriveOnGraph` instead of `runRunLoop`.
- Expected: scheduler execution happens in-process inside the frozen child; the host does not load mutable orchestration code after spawn and only waits on `run.completion.json`; `compile:drive-step`, `run.pid`, `run.sh`, copied/prebuilt runner behavior, and detached unsupported `cosmonauts-subagent` behavior remain compatible.
- Seam: `lib/driver/run-step.ts` > `runWithLock`; `lib/driver/driver.ts` > `startDetached`; `bin/cosmonauts-drive-step`
- Test: `tests/driver/drive-on-graph-routing.test.ts` > `runs detached Drive by executing runDriveOnGraph inside the frozen runner`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-017

### B-018 - `run_driver` preserves tool response, watch_events, and non-duplicated graph events

- Source: AC-002, AC-007
- Context: an agent starts a graph-backed Drive run with the existing `run_driver` parameters.
- Action: the driver tool builds the same `DriverRunSpec`, starts the graph-backed Drive handle, and uses the graph activity-only durable event sink mode while scheduler events own normalized lifecycle.
- Expected: the response still includes `runId`, `planSlug`, `workdir`, and `eventLogPath`; `watch_events` still pages legacy `events.jsonl` with the same cursor semantics and compact summaries; normalized `run_watch` remains available separately through the read-only controller; `orchestration-events.jsonl` contains scheduler lifecycle once and any Drive backend/activity details without duplicate `run_*` or `step_*` lifecycle events projected from legacy Drive events.
- Seam: `domains/shared/extensions/orchestration/driver-tool.ts` > `registerDriverTool`; `domains/shared/extensions/orchestration/watch-events-tool.ts` > `registerWatchEventsTool`; `lib/driver/event-stream.ts` > `createEventSink`
- Test: `tests/extensions/orchestration-driver-tool-graph.test.ts` > `preserves run_driver watch_events and avoids duplicate graph lifecycle events`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-018

### B-019 - Drive CLI status, list, and completion files remain compatible for graph runs

- Source: AC-002, AC-007
- Context: a user starts graph-backed Drive through `cosmonauts drive run`, then calls `cosmonauts drive status <runId>` or `cosmonauts drive list`.
- Action: the CLI reads the run workdir state.
- Expected: `run.completion.json`, `run.pid`, and `run.inline.json` continue to drive `completed`, `blocked`, `finalization_failed`, `running`, `dead`, and `orphaned` classification; status/list JSON shapes remain compatible; graph-specific files do not break existing run discovery.
- Seam: `cli/drive/subcommand.ts` > `runDrive`; `cli/drive/subcommand.ts` > `classifyRunDir`; `cli/drive/subcommand.ts` > `listDriveRuns`
- Test: `tests/cli/drive/graph-run.test.ts` > `preserves drive run status list and completion files for graph runs`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-019

### B-020 - Drive resume rehydrates graph state and retries pending finalization first

- Source: AC-002, AC-006, Scenario 1
- Context: a graph-backed Drive run is resumed with `--resume`, and the previous workdir may include completed step records, a legacy remaining-queue slice, or `pending-finalization.json`.
- Action: `cli/drive/subcommand.ts` loads the existing spec/run state, keeps the original selected task IDs authoritative, applies the existing dirty-worktree guard, retries pending finalization before backend work, and resumes the graph scheduler from persisted records.
- Expected: `loadResumeDefaults` returns both the original selected IDs and the legacy remaining IDs; `createRunSpec` and `runDriveOnGraph` keep `spec.taskIds`/`RunRecord.metadata.driveTaskIds` as the original selected set for graph compilation, finalizer dependencies, backend validation, and all-task completion accounting; the remaining slice is used only as a compatibility queue view. Completed task/finalizer steps are not duplicated; pending finalization remains authoritative until cleared; external state-commit acceptance still works; `--resume-dirty` keeps its current override behavior.
- Seam: `cli/drive/subcommand.ts` > `loadResumeDefaults`; `cli/drive/subcommand.ts` > `createRunSpec`; `cli/drive/subcommand.ts` > `prepareResume`; `cli/drive/subcommand.ts` > `retryPendingFinalization`; `lib/driver/drive-graph-runner.ts` > `runDriveOnGraph`
- Test: `tests/cli/drive/graph-resume.test.ts` > `resumes graph runs without rewriting original selected task ids`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-020

### B-021 - A large Drive graph survives session death and resumes cleanly

- Source: AC-006, AC-007, Scenario 1
- Context: a Drive run has many sequential task steps and finalizers, and the observing host/session dies after some steps finish.
- Action: a later invocation resumes the same run from the file-backed store and run workdir.
- Expected: the scheduler reconstructs ready/running/completed state from persisted `graph.json`, `step.json`, attempt records, heartbeats, original selected task IDs, and pending-finalization state; no completed task or commit is duplicated; the run eventually reaches the same terminal DriverResult shape as the legacy surface.
- Seam: `lib/driver/drive-graph-runner.ts` > `runDriveOnGraph`; `lib/durable-runtime/scheduler.ts` > `runDurableGraphScheduler`; `lib/durable-runtime/scheduler-state.ts` > `reconcileSchedulerState`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `survives scheduler host death and resumes a large sequential drive graph`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-021

### B-022 - Drive backends exercise committed-work-block and leave-running recovery paths

- Source: AC-006, AC-007, Plan-3 B-014 and B-015
- Context: graph-backed Drive runs are restarted while a selected production Drive backend step is recorded as running without terminal attempt evidence.
- Action: parametrized tests construct the production Drive scheduler backend map once per selected backend and let the scheduler reconcile the persisted running step using that backend's capabilities.
- Expected: each production run constructs only its selected backend plus `shell-command`, but recovery coverage exercises all three capability profiles across separate test cases. Commit-capable backends (`claude-cli`, `cosmonauts-subagent`) take the conservative potentially-committed-work block path when stale with no terminal evidence; fresh non-resumable externally owned work takes the leave-running / `waiting_for_fresh_external_work` path without starting a duplicate; these paths are verified against production Drive backend adapter capability code rather than only hand-built scheduler fixtures.
- Seam: `lib/driver/drive-scheduler-backend.ts` > `createDriveSchedulerBackendMap`; `lib/durable-runtime/scheduler.ts` > `blockPotentiallyCommittedRunningSteps` and running external work handling
- Test: `tests/driver/drive-on-graph-recovery.test.ts` > `applies committed-work block and leave-running recovery paths to selected drive backends`
- Marker: @cosmo-behavior plan:durable-frontend-migration#B-022

## Design

### Module boundaries and dependency direction

Keep the generic durable runtime inward and frontend-agnostic:

- `lib/durable-runtime/*` remains generic. It must not import Drive, chain runner, CLI renderers, prompt templates, or backend-specific invocation types.
- `lib/orchestration/*` owns chain-specific compilation, chain scheduler backend construction, durable chain agent-event evidence, and chain event adaptation.
- `lib/driver/*` owns Drive-specific graph compilation, the `BackendInvocation` bridge, finalizer execution, legacy Drive event compatibility, resume compatibility, and `runDriveOnGraph`.
- `cli/*` and `domains/shared/extensions/*` remain wrappers. They parse user/tool parameters, call the appropriate graph-or-inline entry, and render existing response shapes.

The stable core is the already-merged `RunStore`/`RunGraph`/`StepRecord`/`RunGraphSchedulerBackend` contract. The volatile edges are chain/Drive compilation and compatibility event rendering; isolate those in frontend modules.

### Group A — durable chain compiler and routing

Add chain-specific modules under `lib/orchestration/`:

- `durable-chain-compiler.ts`
  - Responsibility: lower parsed `ChainStep[]` into a `RunGraph` plus metadata needed to seed `StepRecord`s and reconstruct `ChainResult` ordering.
  - Exports: `CompileChainToGraphOptions`, `CompiledChainGraph`, `shouldRunChainInline(steps, options)`, and `compileChainToGraph(options)`.
  - Dependency rule: imports only chain types/helpers and durable-runtime types. It does not create Pi sessions and does not call `runDurableGraphScheduler`.
  - Compiler algorithm: left fold over `ChainStep[]` with a `frontier: string[]`. Sequential stage creates one step depending on the current frontier, then frontier becomes that step. Parallel group/fan-out creates sibling steps each depending on the current frontier, then frontier becomes all siblings. No parser changes.
  - Step backend: chain steps use persisted backend `{ name: cosmonauts-subagent, options: { source: chain, stage, stepIndex, memberIndex?, syntax?, model?, thinking?, domainContext? } }` and `kind: agent`.

- `durable-chain-runner.ts`
  - Responsibility: implement the internal chain `run_start` compatibility wrapper: create/load a run record, write the graph, seed step records, register the chain scheduler backend, loop `runDurableGraphScheduler` until terminal/drained, and return a `ChainResult` reconstructed from persisted step records.
  - It wraps `FileRunStore.appendEvent` or otherwise observes appended normalized events so `chain-event-adapter.ts` can stream adapted `ChainEvent`s live.
  - It must reconstruct final `ChainResult.stageResults` from persisted step records and graph metadata, not from an in-memory-only latest-result map.

- `chain-scheduler-backend.ts`
  - Responsibility: adapt a single durable chain agent step to `RunGraphSchedulerBackend`.
  - It closes over the same `ChainConfig` inputs used by `runChain`, creates a `createPiSpawner` instance, runs one non-loop `ChainStage`, and returns a `StepResult` derived from the `StageResult`.
  - Loop stages must never reach this backend because `shouldRunChainInline` gates them first.
  - It owns the durable event-evidence contract needed for `agent_*` ChainEvents. It appends normalized events with `type: step_tool_activity`, the graph `runId`, the chain `stepId`, and one of these details shapes:
    - `{ kind: chain_agent_lifecycle, lifecycle: spawned, role, sessionId }`
    - `{ kind: chain_agent_lifecycle, lifecycle: completed, role, sessionId }`
    - `{ kind: chain_spawn_event, role, sessionId, event }`, where `event` is the existing `SpawnEvent` payload from Pi and `sessionId` must equal `event.sessionId`.
  - The backend emits the `spawned` lifecycle record when it first observes a Pi session ID, emits `chain_spawn_event` records for turn/tool/compaction `SpawnEvent`s, and emits `completed` after the stage result succeeds. These details are the only source for adapted `agent_spawned`, `agent_completed`, `agent_turn`, and `agent_tool_use` events.

- `chain-event-adapter.ts`
  - Responsibility: convert normalized `OrchestrationEvent`s plus compiler metadata into existing `ChainEvent` variants.
  - Preserve current renderers: `cli/chain-event-logger.ts`, `domains/shared/extensions/orchestration/rendering.ts`, and the `chain_run` tool should not need to learn normalized runtime events.
  - Stage and parallel events are reconstructed from scheduler lifecycle plus compiler metadata. Agent events are reconstructed only from the durable `chain_agent_lifecycle` and `chain_spawn_event` detail records above. If a detail record is missing `role`, `sessionId`, or `event` where required, the adapter emits no `agent_*` event for that record and records a diagnostic/error event for tests; it must not invent a session ID.

Routing seams:

- In `domains/shared/extensions/orchestration/chain-tool.ts`, keep parsing and `injectUserPrompt`, then branch:
  - inline when `shouldRunChainInline(steps, { completionLabel })` is true;
  - otherwise `runDurableChain(...)`.
- In `cli/main.ts` `handleWorkflowMode`, do the same after `resolveWorkflowExpression`, `parseChain`, and `injectUserPrompt`.
- Preserve `--profile` behavior for inline chains. For durable chains, profile output may be driven by adapted `ChainEvent`s; if that is not immediately equivalent, degrade explicitly in the test/implementation notes rather than changing CLI flags.

### Group B — Drive graph compiler

Add `lib/driver/drive-graph-compiler.ts` with `compileDriveRunToGraph(options)` returning `CompiledDriveGraph`.

Rules:

- Drive run scope is `spec.planSlug`; run ID is `spec.runId`.
- The compiler must preserve the authoritative original selected task IDs exactly. There is no new topological sort in this plan.
- Task step IDs are the task IDs themselves, matching `durable-steps.ts` and existing step records.
- Task steps are sequential: `spec.taskIds[i]` depends on the previous task's
  task-status finalizer (`finalizer-task-status-<taskIds[i-1]>`) when `i > 0`, so
  the prior task's source-commit and task-status finalizers run before the next
  task starts (preserving the legacy per-task backend → commit → status → next
  ordering). A direct task→task dependency is insufficient because the scheduler
  would start the next task as soon as the prior backend finished, before its
  finalizers ran.
- Finalizer step IDs reuse the existing projector convention:
  - `finalizer-source-commit-<taskId>`
  - `finalizer-task-status-<taskId>`
  - `finalizer-state-commit`
- Finalizer dependencies must make the executable graph preserve current phase order, even where the old projector only reacted to events after the fact: backend/report phase before source commit, source commit before task status, all task-status finalizers before final state commit.
- Finalizer emission is policy-gated:
  - source-commit finalizers only for `commitPolicy: driver-commits`;
  - task-status finalizers wherever Drive must mutate task state after a task reaches a terminal Drive outcome;
  - state-commit finalizer only when `resolveStateCommitPolicy(spec) === final-state-commit`.
- Seed every graph step with a persisted `StepRecord` in `pending` status before running the scheduler; do not rely on reactive projection to create executable step records.
- Seed every Drive finalizer `StepRecord` with `retryPolicy: { maxAttempts: Number.MAX_SAFE_INTEGER }` (or a named constant equal to that value). This policy exists to keep scheduler `stepTransitionFromResult` from rewriting retryable finalization failures to blocked/wait-for-human. `runDriveOnGraph` stops and returns `finalization_failed` after reading persisted finalizer evidence, so this is not an automatic retry loop.

### Group B — Drive scheduler bridge

Add `lib/driver/drive-scheduler-backend.ts`.

Contracts:

- `DriveSchedulerBackendContext` carries `spec`, `taskManager`, the already selected `backend`, the selected backend name from `spec.backendName`, and the legacy `eventSink`.
- `createDriveSchedulerBackend(context)` returns a `RunGraphSchedulerBackend` for exactly that selected Drive backend.
- `createDriveSchedulerBackendMap(context)` returns a `ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>` containing exactly two entries for production runs: `spec.backendName` and `shell-command`. Tests may call the function separately for `codex`, `claude-cli`, and `cosmonauts-subagent`, but a single production run does not construct all three.
- The selected Drive backend's scheduler capabilities come from `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[spec.backendName]`. The detached `cosmonauts-subagent` rejection remains in CLI/driver startup before this map is built.

`prepare` is the `BackendInvocation` builder:

- Validate that the scheduler step is a Drive task step and that the task ID belongs to the authoritative original selected task IDs (`spec.taskIds` as preserved from `RunRecord.metadata.driveTaskIds` on resume), not a legacy remaining queue.
- Render the prompt through `renderPromptForTask(taskId, { ...spec.promptTemplate, workdir: spec.workdir }, taskManager, { runExpectations })` so prompts live under `spec.workdir/prompts/` in both inline and detached modes.
- Build the full `BackendInvocation` with the scheduler signal and the legacy Drive event sink.

`start` preserves current Drive task execution semantics:

- Emit legacy Drive events needed by `watch_events`.
- Run preflight before backend work.
- Invoke the selected existing backend implementation (`codex`, `claude-cli`, or `cosmonauts-subagent`).
- Run postflight after a zero-exit backend.
- Parse the report with `parseReport`.
- Relocate/share the existing `deriveOutcome` and unknown-success inference rules from `run-one-task.ts` so `D-006` remains identical.
- Preserve acceptance-criteria verification, contradicted-block retry, timeout, `partialMode`, and current status classification. Where scheduler dependency semantics cannot run finalizers after a blocked task, keep the non-success compatibility side effects in the bridge and document them in tests; do not silently drop task Blocked/In Progress updates.
- Return `StepResult` values that make the scheduler block/retry/continue consistently with current Drive behavior.

Capability registration:

- Wrap only the selected real Drive backend with a scheduler backend using its row in `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES`.
- Register `shell-command` separately for finalizers.
- Do not make the existing `createDriveBackendOrchestrationAdapter` assignable to `RunGraphSchedulerBackend`; the Plan-3 type-seam test should continue to prove the bridge is load-bearing.

### Group B — shell-command finalizer backend

Add `lib/driver/shell-command-finalizer.ts` and `lib/driver/drive-finalization.ts`.

- `shell-command-finalizer.ts` implements `OrchestrationBackend<SchedulerStepInput, StepResult>` with `name: shell-command` and capabilities `{ canResume:false, canCancel:false, canCommit:true, isolatedFromHostSource:false, emitsMachineReport:true }` for Drive finalizers.
- It closes over `DriverRunSpec`, `TaskManager`, and the legacy Drive `EventSink`.
- It dispatches by `step.backend.options.drivePhase` and step ID:
  - `commit`: perform the source commit behavior currently in `maybeCommit`.
  - `task_status`: perform success/partial/blocked task status updates currently in `transitionTaskStatus`, using persisted task-step report evidence and commit artifacts.
  - `state_commit`: call shared `commitFinalState` behavior.
- `drive-finalization.ts` should contain shared finalization helpers used by both legacy compatibility code and the shell finalizer so behavior does not fork. Do not create a generic framework abstraction for one frontend; keep it Drive-specific.
- On retryable finalizer failure, write `pending-finalization.json`, emit legacy `finalize`/`task_finalization_failed` or `run_finalization_failed` evidence, return `StepResult` with `outcome: failed`, `nextAction: retry`, and include the pending-finalization artifact.
- The finalizer failure contract is preserved by the compiler's explicit finalizer retry policy plus the graph runner's persisted-evidence mapping. The shell backend must not rely on the scheduler's default retry limit, because the default would normalize the step to blocked on the first attempt.

### Group B — shared Drive graph entry, resume state, and Architecture X

Add `lib/driver/drive-graph-runner.ts` with `runDriveOnGraph(spec, context): Promise<DriverResult>`.

Responsibilities:

1. Create or load the durable run record under `missions/sessions/<planSlug>/runs/<runId>/` with `eventsPath: orchestration-events.jsonl`, metadata matching today's `driveDurableEventSinkOptions`, and policy including `defaultBackend`, timeout, worktree mode, and retry settings.
2. Persist `RunRecord.metadata.driveTaskIds` as the original ordered selected task IDs on first run. On resume, read that metadata first, validate it is a string array, and use it as the authoritative task set for graph compilation, finalizer dependencies, backend validation, all-task completion accounting, and completion summaries. If old graph metadata is absent during migration, fall back to `spec.json.taskIds`; never replace this authoritative set with the legacy remaining queue.
3. Write the compiled graph and seed step records if they are missing. On resume, never fabricate missing in-memory defaults for correctness-critical state; load `graph.json`, `step.json`, attempts, heartbeats, `RunRecord.metadata.driveTaskIds`, and `pending-finalization.json` from disk.
4. Append normalized `run_started` when starting a new graph run and legacy `run_started` to `events.jsonl` for `watch_events`.
5. Run `runDurableGraphScheduler` in a local scheduler-drain loop until terminal, blocked/finalization-failed, or waiting for fresh external work. After each scheduler invocation and before invoking it again, call a Drive-specific `readRetryableDriveFinalizerFailure` helper that reloads finalizer `StepRecord`s, latest `StepAttemptRecord.result`, and `pending-finalization.json`; if the evidence indicates a retryable finalization failure, write/return today's `DriverResult` with `outcome: finalization_failed` and do not let the scheduler loop consume another retry in the same process.
6. Map terminal scheduler state and finalizer evidence to the current `DriverResult` union and write `run.completion.json` at the same points the current driver does.
7. Keep legacy `events.jsonl` and normalized `orchestration-events.jsonl` coherent without duplicate normalized lifecycle events. For graph runs, scheduler events are authoritative normalized lifecycle events; the Drive event sink may append only non-duplicative backend/activity evidence that the scheduler does not already emit.

CLI resume boundary:

- Extend the internal `ResumeDefaults` shape in `cli/drive/subcommand.ts` to carry `originalTaskIds` and `remainingTaskIds` separately.
- `loadResumeDefaults` reads `spec.json`, legacy `events.jsonl`, and, for graph runs, `RunRecord.metadata.driveTaskIds` from `missions/sessions/<planSlug>/runs/<runId>/run.json`. `originalTaskIds` comes from metadata when present and valid, otherwise from `spec.json.taskIds`; `remainingTaskIds` is the legacy slice computed from completed/blocking legacy events against the original set.
- `createRunSpec` writes `taskIds: resume.originalTaskIds` for graph resume. `applyTaskLimit` and the legacy remaining queue must not rewrite the authoritative set for an existing run.
- `prepareResume` uses `remainingTaskIds` only to decide whether any legacy backend queue work remains after pending finalization is retried. It must still allow `runDriveOnGraph` to run when finalizer/graph state is incomplete even if the remaining queue is empty.
- `runDriveOnGraph` guards the boundary again by loading metadata before compiling or validating task steps, so a stale caller cannot accidentally resume a graph against a shortened `spec.taskIds` slice.

Routing:

- `lib/driver/driver.ts` `runInline` creates the legacy event sink and calls `runDriveOnGraph` directly in the host process.
- `lib/driver/driver.ts` `startDetached` still prepares the frozen workdir and child process exactly as today.
- `lib/driver/run-step.ts` reads `spec.json`, creates the selected backend/task manager/event sink, and calls `runDriveOnGraph` inside the frozen child.
- `domains/shared/extensions/orchestration/driver-tool.ts` and `cli/drive/subcommand.ts` keep their parameter parsing and response shapes; they start the graph-backed handle through the same `runInline`/`startDetached` surface.
- `runRunLoop` stays in the codebase for legacy/debug tests and as a fallback if implementation needs an emergency compatibility switch, but the production path for supported Drive runs is graph-backed.

### Compatibility event strategy

Drive graph runs need two event streams:

- **Legacy `events.jsonl`** remains the source for `watch_events`, Drive activity bus rendering, CLI status `lastEventAt`, and existing external habits.
- **Normalized `orchestration-events.jsonl`** remains the source for `run_status` and `run_watch`.

Define the event-stream API contract in `lib/driver/event-stream.ts` so runner and event-stream workers share the same boundary:

- Extend `DurableDriverEventSinkOptions` with `mode?: DurableDriverEventSinkMode`.
- `DurableDriverEventSinkMode = legacy-loop-projector | graph-activity-only`.
- Omitted mode defaults to `legacy-loop-projector`, preserving current `runRunLoop` behavior: create the durable run if missing, normalize legacy Drive lifecycle/activity, and use `createDriveStepProjector` to write step/finalizer records.
- `graph-activity-only` is required for Drive graph runs. It still writes every legacy `DriverEvent` to `events.jsonl` and publishes bus activity, but its durable side assumes `runDriveOnGraph` and the scheduler own run/step lifecycle and step records. It must not create a `DriveStepProjector`, and it must filter normalized events to non-lifecycle evidence only: `step_tool_activity`, `step_output`, `artifact_written`, plus diagnostics. It must never append duplicate normalized `run_started`, `run_completed`, `run_failed`, `run_blocked`, `step_ready`, `step_started`, `step_completed`, `step_failed`, or `step_blocked` events for graph runs.
- Omitting the `durable` option remains the explicit legacy-JSONL-only mode for callers that only need `events.jsonl` and bus publication.

Do not let graph runs double-project task/step lifecycle state through both scheduler events and the legacy dual-write projector. The graph runner owns normalized run/step lifecycle; the Drive event sink may append only non-duplicative backend details such as driver activity, preflight/postflight evidence, report evidence, commit artifacts, and finalization diagnostics.

## Files to Change

- `lib/orchestration/durable-chain-compiler.ts` (new)
- `lib/orchestration/durable-chain-runner.ts` (new)
- `lib/orchestration/chain-scheduler-backend.ts` (new)
- `lib/orchestration/chain-event-adapter.ts` (new)
- `lib/orchestration/chain-runner.ts`
- `domains/shared/extensions/orchestration/chain-tool.ts`
- `cli/main.ts`
- `lib/driver/drive-graph-compiler.ts` (new)
- `lib/driver/drive-graph-runner.ts` (new)
- `lib/driver/drive-scheduler-backend.ts` (new)
- `lib/driver/shell-command-finalizer.ts` (new)
- `lib/driver/drive-finalization.ts` (new)
- `lib/driver/driver.ts`
- `lib/driver/run-step.ts`
- `lib/driver/run-run-loop.ts`
- `lib/driver/run-one-task.ts`
- `lib/driver/durable-steps.ts`
- `lib/driver/event-stream.ts`
- `lib/driver/prompt-template.ts`
- `lib/driver/state-commit.ts`
- `lib/driver/run-state.ts`
- `lib/driver/types.ts`
- `lib/driver/backends/orchestration-adapter.ts`
- `domains/shared/extensions/orchestration/driver-tool.ts`
- `domains/shared/extensions/orchestration/watch-events-tool.ts`
- `cli/drive/subcommand.ts`
- `tests/orchestration/chain-compiler.test.ts` (new)
- `tests/orchestration/chain-routing.test.ts` (new)
- `tests/orchestration/chain-event-adapter.test.ts` (new)
- `tests/extensions/orchestration-chain-tool-durable.test.ts` (new)
- `tests/cli/workflow-durable-routing.test.ts` (new)
- `tests/driver/drive-graph-compiler.test.ts` (new)
- `tests/driver/drive-scheduler-backend.test.ts` (new)
- `tests/driver/shell-command-finalizer.test.ts` (new)
- `tests/driver/drive-on-graph-routing.test.ts` (new)
- `tests/extensions/orchestration-driver-tool-graph.test.ts` (new)
- `tests/cli/drive/graph-run.test.ts` (new)
- `tests/cli/drive/graph-resume.test.ts` (new)
- `tests/driver/drive-on-graph-acceptance.test.ts` (new)
- `tests/driver/drive-on-graph-recovery.test.ts` (new)

## Risks

- **Executable finalizer ordering can regress Drive behavior.** The old `durable-steps.ts` projector observed events after execution; the new graph is executable. If tests show commit/status/state-commit ordering differs from current Drive behavior, stop and adjust dependencies or finalizer payloads before routing production Drive.
- **Finalizer retry normalization can erase Drive recovery evidence.** If finalizer `StepRecord`s are created without the explicit retry policy, the scheduler default can rewrite `nextAction: retry` into blocked/wait-for-human on the first failure. Treat any test showing normalized finalizer retry evidence as a blocker.
- **Partial/unknown report semantics are subtle.** The scheduler's generic blocked-step semantics may not directly express every Drive `partialMode` path. The bridge/finalizer split must be tested against current `run-one-task.ts` behavior; do not silently drop Blocked/In Progress updates or unknown-report blocking.
- **Event duplication can confuse status/watch.** Graph runs must avoid double-writing normalized lifecycle events through both scheduler and legacy event normalization. If duplicate terminal or step lifecycle events appear, treat it as a blocker, not harmless noise.
- **Resume task selection can corrupt graph recovery.** The legacy CLI remaining-queue slice must never replace the graph's original selected task set. If a resume path rewrites `spec.taskIds` to the remaining slice for graph runs, pause and fix the state boundary before running finalizers.
- **Detached frozen-runner safety is load-bearing.** Any design that runs graph scheduling in the mutable host for detached Drive violates Scenario 5. If `run-step.ts` cannot call `runDriveOnGraph` from the compiled binary, pause Group B rather than introducing per-step frozen runners.
- **Real-backend recovery tests can be slow or environment-sensitive.** Use production backend adapter code with deterministic fake CLI binaries where possible, and keep one dogfood/manual acceptance note if a real provider binary is unavailable. Do not replace B-014/B-015 recovery coverage with scheduler-only fixtures.
- **Scope creep into deferred controller/loop work.** Do not add durable coordinator loops, mutating run-control tools, nested lifecycle policy, default per-step worktrees, merge finalizers, daemon mode, SQLite, or remote coordinator.

## Quality Contract

All Group A tasks, all Group B tasks, and the final integrated branch use the same gate ladder. Per-task gates may run targeted test subsets first, but the final gate must cover the whole project. The project binding for the artifact-conformance gate is the plan artifact check for `durable-frontend-migration` (currently exposed as `cosmonauts plan check-artifacts durable-frontend-migration`), while the ladder itself stays tool-agnostic.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests for the touched behavior pass; final integration runs the full project test step | project-discovered | hard fail |
| 2 | `boundary-conformance` | universal | bound | Project-native lint and typecheck steps pass | project-discovered | hard fail |
| 3 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for `durable-frontend-migration` | artifact evidence | hard fail |
| 4 | `mutation` | bindable | unbound | Critical negative paths are covered by targeted tests for loop fallback, missing chain agent evidence, unknown report handling, finalization failure evidence, resume original IDs, duplicate lifecycle filtering, and frozen-runner preservation | pending | unbound mechanically; reviewer judgment required |
| 5 | `boundary-conformance` | bindable | bound | Durable runtime modules remain frontend-agnostic; Drive and chain bridge code stays at frontend edges | reviewer evidence | hard fail for dependency inversion |

## Implementation Order

### Task Groups

- **Group A behaviors:** B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008.
- **Group B behaviors:** B-009, B-010, B-011, B-012, B-013, B-014, B-015, B-016, B-017, B-018, B-019, B-020, B-021, B-022.
- **Shipping rule:** Group A ships independently before Group B. Group B must start from a green main after Group A and should not require changes to Group A except shared test helpers or bug fixes.

### Group A — durable chain compiler first

1. **RED B-001/B-002/B-003:** create `tests/orchestration/chain-compiler.test.ts` for sequential, bracket group, and fan-out graph shapes, including exact behavior markers. Implement `compileChainToGraph` with deterministic step IDs and frontier folding.
2. **RED B-004:** extend the compiler tests for prompt/model/thinking/domain metadata. Implement persisted backend options and prompt injection ordering without changing `parseChain`.
3. **RED B-005:** create `tests/orchestration/chain-routing.test.ts` for the inline-fallback predicate. Implement `shouldRunChainInline` with the exact loop predicate and completion-check/completion-label handling.
4. **RED B-006:** create `tests/orchestration/chain-event-adapter.test.ts`. Implement durable chain agent evidence in the scheduler backend, then implement the normalized-to-chain event adapter. Include the negative proof that missing role/sessionId/spawn payload evidence cannot produce fabricated `agent_*` events.
5. **RED B-007:** create the chain tool routing test. Add `runDurableChain` and wire `chain-tool.ts` so supported chains use the scheduler and unsupported chains call `runChain`.
6. **RED B-008:** create the CLI workflow routing test. Wire `cli/main.ts handleWorkflowMode` through the same durable-or-inline branch after workflow resolution.
7. Run the Group A quality gates. If loop-free chains pass but named workflows with loop roles route durable by accident, stop and fix the predicate before shipping Group A.

### Group B — Drive-on-graph after Group A is green

8. **RED B-009/B-010:** create `tests/driver/drive-graph-compiler.test.ts`. Implement `compileDriveRunToGraph`, finalizer emission, explicit finalizer retry policy, graph persistence helpers, and seeded pending `StepRecord`s.
9. **RED B-011/B-012/B-013:** create `tests/driver/drive-scheduler-backend.test.ts`. Implement the `BackendInvocation` builder, task execution bridge, report inference relocation/sharing, selected-backend-plus-shell capability registration, and timeout/preflight/postflight compatibility.
10. **RED B-014/B-015:** create `tests/driver/shell-command-finalizer.test.ts`. Extract Drive-specific finalization helpers, implement the shell-command finalizer backend, and verify success plus retryable failure/pending-finalization behavior. Assert that latest attempt evidence and `StepRecord.result.nextAction` remain `retry` after scheduler transition and that `finalization_failed` is reconstructed from persisted evidence.
11. **RED B-016/B-017:** create `tests/driver/drive-on-graph-routing.test.ts`. Implement `runDriveOnGraph`, switch `runInline` to call it in host mode, and switch `run-step.ts` to call it inside the frozen child while preserving detached workdir/binary/completion contracts.
12. **RED B-018/B-019:** create tool and CLI surface tests. Wire `run_driver`, `cosmonauts drive run`, `watch_events`, status, and list compatibility over graph-backed runs. Implement the event sink `graph-activity-only` mode and assert normalized lifecycle events are not duplicated while legacy `events.jsonl` still drives `watch_events`.
13. **RED B-020:** create graph resume tests. Preserve `--resume`, dirty-worktree refusal, pending-finalization retry before backend work, external state-commit acceptance, no-duplicate-step behavior, and the original selected task ID boundary. Include a resume case with a completed task plus pending final state commit where `remainingTaskIds` is empty but the authoritative original IDs remain in `spec.taskIds`/`RunRecord.metadata.driveTaskIds`.
14. **RED B-021/B-022:** create acceptance/recovery tests. Verify large sequential graph resume and production Drive backend recovery capability paths, parametrized across selected backends using real adapter capability code and deterministic binaries/stubs where needed.
15. Run the final quality gates. If any Plan-1 characterization test fails because legacy Drive UX changed, treat it as a regression unless the failing assertion is explicitly replaced by an equivalent graph-backed compatibility assertion in this plan.

## Reviewer Resolution

- **PR-001 — finalizer retry vs blocked normalization.** Resolution: finalizer `StepRecord`s now explicitly carry the Drive finalizer retry policy so scheduler retry results survive `stepTransitionFromResult`; `runDriveOnGraph` maps Drive `finalization_failed` from persisted finalizer `StepRecord`/latest attempt evidence plus `pending-finalization.json`, not from an in-memory scheduler transition. Plan changes: Architecture Context scheduler constraint, B-015 Expected/Test, Drive compiler rules, shell finalizer design, graph runner responsibility 5, risk entry, and Implementation Order step 10.
- **PR-002 — chain `agent_*` event fidelity.** Resolution: chose the precise durable evidence contract. The chain scheduler backend must append `step_tool_activity.details` records carrying `kind`, `role`, Pi `sessionId`, and `SpawnEvent` payloads; the adapter only emits `agent_*` events from that evidence and refuses to fabricate missing session IDs. Plan changes: B-006 Expected/Test, Group A `chain-scheduler-backend.ts` contract, `chain-event-adapter.ts` contract, Quality Contract mutation notes, and Implementation Order step 4.
- **PR-003 — event-stream sink mode.** Resolution: defined `DurableDriverEventSinkMode` with `legacy-loop-projector` and `graph-activity-only`; graph runs must use `graph-activity-only`, which writes legacy JSONL/bus events but filters durable writes to non-lifecycle evidence only. Plan changes: B-018 Expected/Test, Compatibility event strategy API contract, event duplication risk, Quality Contract mutation notes, and Implementation Order step 12.
- **PR-004 — resume taskIds boundary.** Resolution: graph resume now has an explicit state boundary between authoritative original selected IDs and the legacy remaining queue. `RunRecord.metadata.driveTaskIds`/`spec.taskIds` preserve the original set, while `remainingTaskIds` is only a compatibility queue view. Plan changes: B-011 validation note, B-020 Expected/Test, B-021 Expected, Drive graph runner resume responsibilities, CLI resume boundary, resume risk, and Implementation Order step 13.
- **PR-005 — backend over-registration.** Resolution: narrowed production construction to the selected Drive backend from `spec.backendName` plus `shell-command`; recovery coverage is parametrized across selected backends using production capability code without requiring all three backends in one run. Plan changes: B-013 renamed and rewritten, B-022 rewritten, Drive scheduler bridge contracts/signature notes, capability registration notes, and Implementation Order steps 9 and 14.
- **PR-006 — AC source links.** Resolution: added `## Acceptance Criteria` to `spec.md` with AC-001 through AC-008 and updated every behavior `Source:` field to include relevant AC IDs while retaining scenario/decision references where useful. Plan changes: spec acceptance criteria and all B-001 through B-022 Source fields.
- **Missing coverage — finalizer persisted evidence.** Folded into B-015 and Implementation Order step 10: tests must assert latest attempt evidence and `StepRecord.result.nextAction` remain `retry` after scheduler transition and that mapping uses persisted evidence plus `pending-finalization.json`.
- **Missing coverage — resume original IDs.** Folded into B-020 and Implementation Order step 13: tests must cover a resume with completed work plus pending final state commit where the legacy remaining queue is empty but original selected IDs remain authoritative.
- **Missing coverage — no duplicate lifecycle events.** Folded into B-018 and Implementation Order step 12: tests must prove `orchestration-events.jsonl` has scheduler lifecycle once while `watch_events` still reads legacy `events.jsonl`.
- **Missing coverage — chain agent fidelity proof/degradation.** Folded into B-006 and Implementation Order step 4: tests must prove durable role/sessionId/spawn evidence adapts to `agent_*` events and missing evidence is not fabricated.
- **Missing coverage — Quality Contract concrete command.** Cleaned up the artifact-conformance row so the ladder threshold is tool-agnostic; the project binding command is named once in prose before the table.
