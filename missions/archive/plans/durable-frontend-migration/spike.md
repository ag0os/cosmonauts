# Spike — durable-frontend-migration (Plan 4)

Read-only de-risking pass feeding the planner. Grounded in the installed
substrate (Plans 1–3, merged) and the architecture record
`missions/architecture/durable-orchestration-runtime.md`. All file:line anchors
verified against the working tree on `main`.

**Bottom line:** the plan's two-group shape (A = durable chain compiler, B =
Drive-on-graph) holds. Plans 1–3 delivered the store, scheduler, event
normalization, and step/attempt projection. What Plan 4 must build is exactly
the **B-020 bridge** plus two compilers. Nothing in Pi 0.75.3 obsoletes any of
it. One real design decision needs confirming before Group B: how the in-process
scheduler coexists with the frozen detached runner (Scenario 5). Recommendation
below.

---

## Angle (a) — Pi 0.75.3 API re-audit: nothing obsoletes planned custom work

Ground truth: `node_modules/@earendil-works/pi-coding-agent@0.75.3` dist types +
docs, cross-checked against context7 `/earendil-works/pi` (no material drift;
only a cosmetic stale `@mariozechner/...` scope in one changelog snippet).

- **Pi IS the single-session engine** and the `cosmonauts-subagent` backend
  already rides it: `createAgentSession` (`dist/core/sdk.d.ts`),
  `AgentSession.prompt`/`sendUserMessage`/`subscribe`,
  `getSessionStats().cost`, `Agent.waitForIdle()` (via `session.agent`),
  `AgentSessionRuntime` handoff. Cosmonauts consumes exactly this in
  `lib/orchestration/session-factory.ts` + `lib/driver/backends/cosmonauts-subagent.ts`.
  → **Keep, don't rebuild.**
- **Pi provides NO durable-run / scheduler / graph / step-record / cross-run
  event-stream / agent-worker-spawner / frozen-child primitive.** Confirmed by
  exhaustive grep over `pi-*/dist/**` (`docs/usage.md:275` states Pi
  "intentionally does not include built-in … sub-agents"). The one child-process
  util (`spawnProcess`) is internal and unexported.
  → `lib/durable-runtime/*` and `bin/cosmonauts-drive-step` stay cosmonauts-owned.

**Verdict:** no planned Plan-4 custom work is obsoleted. Pi is the leaf
single-session executor; the durable graph layer sits above it, unchanged.

---

## Angle (b) — Drive's current model → graph mapping

Entry seam is narrow: CLI (`cli/drive/subcommand.ts`) and the `run_driver` tool
(`domains/shared/extensions/orchestration/driver-tool.ts`) both converge on
`runInline`/`startDetached` (`lib/driver/driver.ts:84,127`) → `runRunLoop`
(`lib/driver/run-run-loop.ts:49`). Drive-on-graph only has to intercept here.

- **Loop / selection.** `task-selection.ts:3` `listPendingPlanTaskIds` is the
  whole "dependency" logic — there is **no topological sort**; order is the task
  list order, or verbatim `--task-ids` order. `runRunLoop` iterates
  `spec.taskIds` strictly sequentially (`run-run-loop.ts:67`), `runOneTask` each,
  break on first `blocked`/`finalization_failed`.
  → **Graph:** one task step per `taskIds[i]`, `dependsOn=[taskIds[i-1]]`
  (sequential chain). This is already what the projector encodes
  (`durable-steps.ts:688`).
- **Finalization (3 phases)** `FinalizationPhase = "commit" | "task_status" |
  "state_commit"` (`types.ts:12`): source commit (`run-one-task.ts:685`
  `maybeCommit`, driver-commits only), task-status (`:963`
  `transitionTaskStatus`), final state-commit (`run-run-loop.ts:159`
  `finalizeRunState` → `state-commit.ts:44`). Failures write
  `pending-finalization.json` (`run-state.ts:13`) and surface as the run-level
  `finalization_failed` outcome.
  → **Graph:** the projector already maps these to finalizer step IDs
  (`durable-steps.ts:865`): per-task `finalizer-source-commit-<id>` and
  `finalizer-task-status-<id>` (dependsOn the task), plus one terminal
  `finalizer-state-commit` (dependsOn all tasks), all backend `shell-command`.
- **Resume** (`subcommand.ts:215`→`prepareResume`): reads `events.jsonl` for the
  highest completed task, **retries `pending-finalization.json` FIRST before any
  backend work** (`:913`), refuses a dirty worktree unless `--resume-dirty`, then
  re-runs the remaining `taskIds` slice. External-evidence acceptance
  (`acceptExternalStateCommit`) lets a human-finished commit count.
- **Commit policies.** `--commit-policy` enforced in `maybeCommit`
  (`run-one-task.ts:692`) and rendered into the prompt
  (`prompt-template.ts:183`); `--state-commit-policy` via `resolveStateCommitPolicy`
  (`types.ts:15`, default `final-state-commit` iff driver-commits).
  → The up-front compiler must **replicate `resolveStateCommitPolicy`** to decide
  which finalizer steps to emit (today they appear reactively when `finalize`
  events fire).
- **Report contract / D-006.** `report-parser.ts:7` parses fenced-JSON then the
  `OUTCOME:` line, else `unknown`. The **unknown-vs-success inference** lives in
  `run-one-task.ts` not the parser: `canInferUnknownSuccess` (`:469`) =
  unknown report AND postflight passed AND (driver-commits ⇒ committable
  changes). The durable side already preserves `unknown`
  (`durable-steps.ts:791`, `stepResultFromReport`).
- **Crash-recovery capability flags** are declared twice — legacy
  `backends/types.ts:3` (`canCommit`,`isolatedFromHostSource` only) and the
  durable `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES`
  (`orchestration-adapter.ts:18`): codex `canCommit:false/isolated:true`;
  claude-cli `canCommit:true/isolated:true`; cosmonauts-subagent
  `canCommit:true/isolated:false`; **all `canResume:false/canCancel:false`.**
  The scheduler already consumes these: `blockPotentiallyCommittedRunningSteps`
  (`scheduler.ts:557`) conservatively **blocks** crashed `canCommit:true`
  running steps (claude/subagent) for manual recovery (B-014 path), and the
  `canResume:false` steps take the "leave running / wait for fresh heartbeat"
  path (`scheduler.ts:202,215`, B-015). `isSafeForSharedWorktreeConcurrency`
  (`:963`) caps shared-worktree concurrency to 1 for anything except codex.
  → Under real Drive backends these become **production** recovery paths — must
  be verified against real runs, not only fixtures (acceptance bar).

### What Plans 1–3 already give us (reuse) vs. what's missing (build)

Already present and reusable:
- `OrchestrationEvent` normalization (`durable-events.ts`) +
  `StepRecord`/`StepAttemptRecord` projection (`durable-steps.ts createDriveStepProjector`)
  + `RunRecord`/policy plumbing (`event-stream.ts driveDurableEventSinkOptions`,
  scope = `planSlug`, eventsPath `orchestration-events.jsonl`,
  `metadata.driveTaskIds`).
- `FileRunStore` CRUD incl. `writeRunGraph`/`writeStepRecord`/scheduler-state
  (`file-store.ts`); the in-process scheduler `runDurableGraphScheduler`
  (`scheduler.ts:37`); `runStatus`/`runWatch` read APIs (`controller.ts`).

Missing — **this is Plan 4's actual surface**:
1. **No graph is ever written for a Drive run.** `writeRunGraph` is called only
   in tests (verified). A compiler must emit the `RunGraph` (task steps +
   policy-gated finalizers) and persist it.
2. **The `BackendInvocation` builder / `inputForStep` bridge (B-020).** See
   Angle (c) — load-bearing.
3. **No runnable `shell-command` backend.** Finalizer steps name backend
   `shell-command` (`durable-steps.ts:990`) but there is **no
   `OrchestrationBackend` impl** — it must perform the source-commit /
   task-status / state-commit git ops currently embedded in
   `maybeCommit`/`transitionTaskStatus`/`commitFinalState`, emitting a retryable
   failed finalizer on error (maps to legacy `finalization_failed`).
4. **No routing.** `subcommand.ts`/`driver-tool.ts` still call `runRunLoop`. A
   new path must compile→seed→schedule while preserving legacy observation
   (`watch_events`, `drive status/list`) and `--resume`.
5. **Pre/postflight + report inference relocation.** These run in
   `run-one-task.ts`; the scheduler only runs `backend.run`, so they must move
   into the bridge backend's `start` (or pre/post steps).

---

## Angle (c) — The B-020 bridge + frozen-runner reconciliation (the crux)

### The type seam (verified)

The scheduler is **hard-typed** to
`RunGraphSchedulerBackend = OrchestrationBackend<SchedulerStepInput, StepResult>`
(`backends.ts:58`). Its loop: `inputForStep(step,run) ⇒ SchedulerStepInput`
(`scheduler.ts:28,1107`) → `backend.prepare(step,{input})` (`:1108`) →
`backend.start(prepared) ⇒ BackendHandle<StepResult>` (`:1116`).

The Drive adapter (`orchestration-adapter.ts:82`) is
`OrchestrationBackend<BackendInvocation, BackendRunResult>` — **non-assignable on
both axes**, and a `@ts-expect-error` contract test pins that
(`tests/durable-runtime/scheduler-contracts.test.ts:207`). `SchedulerStepInput`
is only `{runId, stepId, inputArtifacts, backendOptions?}` (`types.ts:150`) — it
carries **none** of `BackendInvocation`'s
`{promptPath, workdir, projectRoot, taskId, parentSessionId, planSlug, eventSink}`
(`backends/types.ts:8`).

### Recommended bridge shape

A `createDriveSchedulerBackend(driveCtx)` factory returning a real
`RunGraphSchedulerBackend`, closing over the Drive run context (taskManager,
projectRoot, parentSessionId, planSlug, workdir, eventSink factory, policies):

- **`prepare(step, ctx)`** = the **BackendInvocation builder**: from
  `ctx.input: SchedulerStepInput` + `step` + closure, render the prompt via
  `renderPromptForTask` (`prompt-template.ts:64`, writes `prompts/<task>.md`,
  returns `promptPath`), assemble the full `BackendInvocation`, delegate to the
  existing `createDriveBackendOrchestrationAdapter` internally (keeps its
  capability table) or inline it.
- **`start(prepared)`** = run preflight → `backend.run(invocation)` → postflight
  → `parseReport` → `deriveOutcome`/`canInferUnknownSuccess` (D-006) → return
  `BackendHandle<StepResult>`. Source-commit/task-status/state-commit do **not**
  belong here — they are the `shell-command` finalizer steps.

This decomposition exactly matches the projector's existing step graph (task
step → source-commit finalizer → task-status finalizer; terminal state-commit).
Register codex / claude-cli / cosmonauts-subagent into the scheduler `backends`
map with `DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES` so the recovery/concurrency
paths in Angle (b) behave correctly.

### Frozen-runner reconciliation — **DECISION POINT**

The architecture record (Scenario 5, D-010) demands two things that seem to
pull apart: the scheduler is **in-process** (D-010), yet Drive-on-graph must
**preserve the existing detached frozen runner** `cosmonauts-drive-step` so a
self-modifying cosmonauts run cannot load mutated orchestration code mid-flight.
"A generic frozen runner / packaged backend for all backends is
post-production."

There are two distinct "children" today (do not conflate):
- **A — run-level frozen detached process** `bin/cosmonauts-drive-step` (built by
  `bun run compile:drive-step` from `lib/driver/run-step.ts`; copied/compiled
  into each workdir, `driver.ts:339`). Used **only in detached mode**; it runs
  the whole `runRunLoop` in-process and writes `run.completion.json`. *This* is
  the frozen runner Scenario 5 names.
- **B — per-task external agent CLI** (codex/claude) shelled out per task in
  **both** modes (`run-one-task.ts:577`→`codex.ts`/`claude-cli.ts`). External to
  cosmonauts code; never loads cosmonauts modules.

**Recommended design (Architecture X — scheduler-inside-frozen-child):** keep
exactly one run-level frozen child. Refactor the shared Drive entry to
`runDriveOnGraph(spec, ctx)` = compile graph → `writeRunGraph` + seed steps →
`runDurableGraphScheduler(...)`. Then:
- **inline mode:** host calls `runDriveOnGraph` directly (in-process; the
  debug/small/loop path, no freezing — same exposure as inline Drive today).
- **detached mode:** host still spawns the frozen `bin/cosmonauts-drive-step`;
  inside it `run-step.ts` calls `runDriveOnGraph` instead of `runRunLoop`. The
  scheduler runs **in-process within the frozen child** — satisfying D-010
  ("in-process") *and* Scenario 5 (orchestration code + spec + prompts are
  frozen into the binary/workdir; the host can self-modify freely while only
  watching `run.completion.json`). Per-task backends (B) shell out as today.

This is low-churn (`run-step.ts` swaps one call), keeps `compile:drive-step`,
keeps the `run.completion.json` contract, and avoids the post-production
"generic per-step frozen runner." The alternative (Architecture Y —
per-step frozen child binaries driven by an in-host scheduler) is more faithful
to a literal reading of "each adapter shells out to the frozen binary" but
requires a per-step runner binary and is closer to the explicitly-deferred
generic frozen runner. **Recommend X; flagging for confirmation.**

---

## Angle (d) — Chain parser/runner → exactly three graph shapes

`parseChain` (`chain-parser.ts:225`) returns an ordered `ChainStep[]`
(`types.ts:54`), `ChainStep = ChainStage | ParallelGroupStep`. The compiler sits
**between parse and run**: consume `ChainStep[]`, emit a `RunGraph`, drive with
`runDurableGraphScheduler`; legacy `runChain` stays as the inline fallback.

- **`a -> b`** ⇒ `[{name:"a"}, {name:"b"}]` ⇒ `b.dependsOn=[a]`.
- **`[a, b]`** ⇒ one `ParallelGroupStep{syntax:{kind:"group"}}` ⇒ sibling steps;
  the next step depends on both (frontier = all members).
- **`reviewer[3]`** ⇒ one `ParallelGroupStep{syntax:{kind:"fanout",count:3}}`
  with 3 cloned sibling stages ⇒ 3 sibling steps, same role/prompt.

Compile = a left fold tracking the previous "frontier" (set of step IDs); each
new step `dependsOn` the whole previous frontier. **No parser change needed** —
ordering (array index), grouping (`isParallelGroupStep`), fan width
(`syntax.count`), per-stage role (`name`) and prompt (`prompt` + resolver) are
all already exposed.

- **Inline-fallback predicate (verified):** a loop is *not* DSL syntax — it is
  `ChainStage.loop === true`, resolved from the registry at parse time
  (`chain-parser.ts:60`). Parser already forbids loops inside parallel groups.
  So: `hasLoop = steps.some(s => !isParallelGroupStep(s) && s.loop)` → inline;
  else compile. Also treat a present `completionCheck` / `completionLabel` as
  inline. The loop executor that must **stay** on legacy is
  `runLoopStage` (`chain-runner.ts:757`, branch at `:623`) +
  `evaluateLoopState` (`:801`) — no graph analog (D-008). Most named workflows
  contain `coordinator` (a loop role) so they naturally route inline; loop-free
  expressions compile.
- **Hook points (two call sites):** insert the
  `hasLoop ? runChain(...) : compile→run_start(...)` branch right after
  `injectUserPrompt` in (1) `chain-tool.ts:116` and (2)
  `cli/main.ts handleWorkflowMode` (~`:654`). Note: the CLI flag is
  **`-w/--workflow`** (there is no `--chain` flag); `resolveWorkflowExpression`
  already collapses named workflows to a DSL string, so workflows ride the same
  compiler.
- **Per-step backend** = `cosmonauts-subagent` (`kind:"agent"`); model/thinking
  via existing `model-resolution`. `injectUserPrompt` injects the objective into
  the first step's stage(s) — replicate.
- **Event/watch compat:** the inline runner is push-based
  (`ChainConfig.onEvent`), consumed by `cli/chain-event-logger.ts:91` and the
  `chain_run` tool's `onUpdate`. The durable path is log-based
  (`OrchestrationEvent` via `runWatch`, cursor-based). Preserve UX with **one
  `OrchestrationEvent → ChainEvent` adapter** so the existing logger + tool
  renderer survive unchanged (`step_started`→`stage_start`/`agent_spawned`, etc.).

---

## Impact on the plan & recommended task-group split

The draft two-group shape is correct and **independently shippable** — Group A
touches only `lib/orchestration` + chain entry points; Group B touches only
Drive. Order: **A first** (lower risk, self-contained, no Drive bootstrapping),
then B.

**Group A — durable chain compiler (lower risk, self-contained):**
- A1. `compileChainToGraph(steps): RunGraph` — left-fold for `a->b` / `[a,b]` /
  `reviewer[3]`; `hasLoop`/`completionCheck` predicate → inline fallback.
  Named test for each shape + a loop-falls-back-to-inline test.
- A2. `cosmonauts-subagent` per-step field mapping (role/prompt/model/thinking,
  first-step prompt injection).
- A3. `OrchestrationEvent → ChainEvent` adapter (preserve CLI logger +
  `chain_run` `onUpdate`).
- A4. Wire the compile-or-inline branch into `chain-tool.ts` and
  `handleWorkflowMode`; `chain_run` becomes a thin wrapper around the internal
  `run_start`. No-regression tests for inline loops + existing workflows.

**Group B — Drive-on-graph (higher risk; modifies Drive):**
- B1. `compileDriveToGraph(spec): RunGraph` — one task step per `taskIds[i]`
  (`dependsOn` prior), policy-gated finalizer steps (replicate
  `resolveStateCommitPolicy`), persist via `writeRunGraph` + seed step records.
- B2. **BackendInvocation builder + `createDriveSchedulerBackend`** (the B-020
  bridge): `inputForStep`/`prepare` build the invocation; `start` runs
  preflight→backend→postflight→report-inference→`StepResult`. Register the three
  Drive backends with their durable capabilities.
- B3. **`shell-command` finalizer backend** (source-commit / task-status /
  state-commit; retryable failed finalizer ⇒ `finalization_failed`;
  `pending-finalization.json` preserved).
- B4. Routing + frozen-runner: shared `runDriveOnGraph`; inline calls it
  directly, detached calls it inside the frozen `cosmonauts-drive-step`
  (Architecture X). Preserve `watch_events`/`drive status/list`/`--resume`.
- B5. Real-run acceptance: Scenario 1 (large plan survives session death +
  resume) and Scenario 5 (self-modifying run keeps frozen runner); verify the
  B-014 committed-work-block and B-015 leave-running paths against real codex /
  claude-cli / cosmonauts-subagent runs.

**Nothing in the spike contradicts the architecture record.** The one item
needing a human decision before Group B is the frozen-runner architecture
(X recommended). Group A has no such open question and can proceed straight to
planning/implementation.
