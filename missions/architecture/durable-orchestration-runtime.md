# Durable Orchestration Runtime — Architecture Record

## Purpose

Define the durable architecture track for unifying Cosmonauts chains and Drive
under one persisted orchestration runtime.

**This record is the single source of truth for the durable orchestration
track.** It is self-contained: the four implementation plans and their tasks
should be derivable from this record alone, without depending on any other
design document. Child plans should link back through an `## Architecture
Context` section and keep their local implementation details in their own
`plan.md` files.

This record supersedes the earlier standalone design draft: all durable,
decision-bearing content now lives here. Any new decision is recorded in the
Decision Log below.

The intended delivery shape is four implementation plans, roughly eight to ten
PRs, across the first production delivery wave:

1. `durable-run-store-events`
2. `durable-backend-step-model`
3. `durable-graph-scheduler`
4. `durable-frontend-migration`

Post-production follow-up work — durable coordinator loops, full nested run
lifecycle policy, worktree isolation, merge finalizers, broader approval gates,
and daemon/SQLite exploration — stays out of the first wave unless a child plan
discovers a blocking dependency. See `## Out of Scope / Post-Production
Follow-ups`.

## Decision Log

- `D-001 - One runtime, multiple frontends`
  - Decision: Chains, workflows, and Drive should compile into a shared durable
    run graph instead of maintaining separate state and scheduler models.
  - Alternatives: Keep chains and Drive separate; make chains call Drive as a
    special case.
  - Why: "Chains call Drive" keeps two state models and does not cover arbitrary
    agent topology. A shared runtime gives every frontend the same execution,
    event, result, and control contracts.
  - Decided-by: durable orchestration design.

- `D-002 - File-backed first`
  - Decision: The first runtime store is file-backed and inspectable, with
    interfaces that can later support SQLite or a remote coordinator.
  - Alternatives: Start with SQLite; start with a daemon service.
  - Why: Drive already has useful file-backed debuggability. Keeping that shape
    lowers migration risk while contracts settle.
  - Decided-by: durable orchestration design.

- `D-003 - Drive compatibility before chain migration`
  - Decision: Extract run store, normalized events, backend adapter, step, and
    finalization concepts from Drive before routing chains through the runtime.
  - Alternatives: Build a generic scheduler first; migrate chains first.
  - Why: Drive already has durable runs, event logs, backend contracts, status
    classification, resume behavior, and finalization recovery. Reusing that
    concrete substrate avoids designing an abstract runtime without evidence.
  - Decided-by: implementation delivery recommendation.

- `D-004 - No default hard timeout for durable runs`
  - Decision: Durable runs do not require a global wall-clock timeout. Hard
    timeout, idle timeout, stale heartbeat detection, retry limits, cost caps,
    and approval gates are explicit policy.
  - Alternatives: Keep current chain/Drive timeout defaults as runtime
    invariants; require every step to set a hard timeout.
  - Why: Hard timeouts are operational policy, not a correctness requirement.
    Durable execution needs stale detection without forcing long useful work to
    die at an arbitrary ceiling.
  - Decided-by: durable orchestration design.

- `D-005 - Normalized events with backend details`
  - Decision: Use one top-level orchestration event model while preserving
    backend-specific detail payloads and raw artifacts.
  - Alternatives: Expose only raw Drive/chain/backend logs; compress every
    backend into a minimal common-denominator stream.
  - Why: Operators need stable lifecycle observability without losing useful
    backend-native evidence.
  - Decided-by: durable orchestration design.

- `D-006 - Step results must distinguish unknown from success`
  - Decision: External backend reports that are malformed, missing, or
    ambiguous must produce `unknown` or blocked outcomes unless policy
    explicitly allows inference from objective checks.
  - Alternatives: Treat zero exit code or plausible prose as success.
  - Why: Durable scheduling and finalization depend on trustworthy terminal
    results. Unknown prose must not silently advance a run.
  - Decided-by: durable orchestration design.

- `D-007 - First scheduler is local and sequential-first`
  - Decision: The initial scheduler should be local, file-backed,
    single-host, and sequential-first, adding bounded parallelism only after
    leases, heartbeats, stale detection, and terminal states are stable.
  - Alternatives: Build distributed scheduling or broad parallelism in v1.
  - Why: Scheduler correctness is the riskiest part of the track. Parallel
    mutable work should wait for stronger worktree isolation.
  - Decided-by: implementation delivery recommendation.

- `D-008 - Durable chains start narrow`
  - Decision: The first durable chain migration covers simple sequential,
    bracket-parallel, and fan-out graph compilation. Coordinator loops and
    nested run lifecycle policy remain follow-up scope.
  - Alternatives: Port every chain behavior and loop to the graph runtime in
    the first wave.
  - Why: The existing loop/waiting behavior is the fragile part, but it is also
    the hardest part. A narrow compiler proves compatibility before changing
    coordinator semantics.
  - Decided-by: implementation delivery recommendation.

- `D-009 - Wave-1 controller surface is read-only`
  - Decision: The first wave ships only the read-only control surface
    (`run_status`, `run_watch`). The mutating controls (`run_pause`,
    `run_resume`, `run_cancel`, `run_intervene`) are post-production scope.
  - Alternatives: Ship the full controller tool set in the first wave.
  - Why: Read paths are low risk and immediately useful for dogfooding and
    tests. Mutating controls depend on stable lease/cancellation semantics that
    the scheduler plan only just establishes.
  - Decided-by: implementation delivery recommendation.

- `D-010 - Scheduler runs in-process for wave 1`
  - Decision: The first scheduler is an in-process library invoked by CLI tools
    and the Drive runner, not a separate child process or daemon.
  - Alternatives: Child-process scheduler; daemon-like long-running supervisor.
  - Why: In-process keeps the first implementation simple and debuggable on a
    single host (consistent with `D-002`/`D-007`). The store and scheduler
    interfaces must not assume in-process execution, so a later child-process or
    daemon move stays open.
  - Decided-by: implementation delivery recommendation.

- `D-011 - Consolidated orchestration surface (Wave 2 umbrella)`
  - Decision: Unify run **creation, control, and observation** under one spine
    while keeping the authoring concepts distinct. Concretely: (a) introduce a
    single internal run-creation entry — the `runStart` seam — that owns the
    create-run-graph, seed-events, and drive-to-terminal envelope both graph
    runners duplicate today; (b) make a durable **`runId` the universal currency**
    for every frontend, including `chain_run`/workflows (which create a
    `RunRecord` but never surface its id); (c) make `run_status`/`run_watch` the
    **single normalized observation surface** for all scopes (chain, drive,
    adhoc), with `watch_events` demoted to a compatibility view (see `D-014`).
    Control and observation unify; authoring stays differentiated (`D-012`).
  - Alternatives: keep each frontend's bespoke create/observe path (status quo);
    or collapse authoring too into a single generic `run(graph)` surface.
  - Why: post-Plan-4 the runtime is one system at the *scheduler* but not at
    *run-creation* — `runStart` does not exist as code; `durable-chain-runner`
    and `drive-graph-runner` each rebuild the same envelope, and three authoring
    tools expose three different control/observation models. The fragmentation is
    in the surface, not the engine. Collapsing authoring would discard the DSL,
    the plan-task derivation, and one-line spawn ergonomics — the concepts are the
    value. This realizes the post-production "prompt/capability evolution so
    agents prefer `run_start`/`run_watch`/`run_status`" item.
  - Decided-by: orchestration-surface-consolidation spike + human review
    (`missions/architecture/spikes/orchestration-surface-consolidation.md`).

- `D-012 - Frontends are named compilers; execution-mode is the axis`
  - Decision: `chain` (ad-hoc or named — see `D-015`), `drive`, and `spawn` remain
    distinct authoring frontends, each a named compiler that emits a `RunGraph` and
    feeds `runStart` (`D-011`). `spawn` is an **agent-only** tool, not a CLI verb
    (`D-016`). The execution axis is **`mode: inline | durable`**, where `inline`
    means the non-durable, session-coupled path (chain loops only, `D-008`) and
    `durable` means graph-backed. Drive's existing in-host-vs-detached choice is a
    **durable-location** sub-axis, *not* the mode axis, and must be documented as
    such (no flag rename required this wave).
  - Alternatives: treat inline/detached and inline/durable as one axis (status
    quo, where "inline" is overloaded across two unrelated meanings).
  - Why: the input models genuinely differ, so authoring stays differentiated;
    but "inline" today means "non-durable" for chains and "in-host but still
    durable" for Drive, which misleads any unified surface. Naming the two axes
    apart removes that ambiguity without churn.
  - Decided-by: spike + human review.

- `D-013 - 'cosmonauts run' is the sole orchestration CLI surface`
  - Decision: `cosmonauts run` is **the** CLI surface for orchestration —
    `run chain` (ad-hoc or named, `D-015`) and `run drive`, plus a unified read
    surface (`run status|watch|list`) backed by `run_status`/`run_watch`. There is
    **no `run spawn`** (spawn is agent-only, `D-016`); the single-agent CLI path
    stays `-p`/`--print`. Every `run` subcommand is **JSON-native on stdout** (the
    result/summary, carrying `runId` + `scope` so it composes with `run watch`);
    human progress goes to **stderr** (full spec: "CLI output contract" under
    `## Wave 2`). Because cosmonauts is single-user dogfood
    today, **back-compat is not a constraint** (revises the original non-goal): the
    legacy `-w/--workflow` flag and bare `cosmonauts drive` subcommand are
    **migrated** onto `cosmonauts run` and their agent/skill/prompt/doc callers
    updated in lockstep (Group E) — thin temporary aliases are allowed to ease the
    transition but are not a compatibility commitment.
  - Alternatives: keep `-w`/`drive` as permanent additive aliases (the earlier
    C1-additive reading, dropped now that back-compat is not required); or add
    nothing to the CLI (two systems, no observation verb for chains).
  - Why: one front door gives the external story a single verb and a uniform,
    scriptable, `runId`-keyed surface; with no third-party callers, a clean
    migration beats carrying deprecated aliases indefinitely.
  - Decided-by: spike + human review (back-compat relaxation: 2026-06-05).

- `D-014 - 'spawn' is the inline-default 1-node compiler; nested-run deferred; run-explosion policy`
  - Decision: model `spawn_agent` as the **minimal compiler** —
    `compileSpawnToGraph` produces a 1-node `agent`-step graph on the
    `cosmonauts-subagent` backend — and default it to **inline** execution. The
    **durable escalation (a top-level spawn becoming a child `RunRecord` with
    parent linkage and a `nested-run` backend) is deferred** to post-production:
    the shipped `RunRecord` carries no `parentRunId`/`parentStepId`, `nested-run`
    is not a known backend, and the `child_run_started` event is defined but
    unused, so the escalation is net-new, not "scaffolding to switch on." Run
    explosion is governed by policy: spawns **inside** a run are steps (cheap);
    ad-hoc **top-level** spawns are lightweight inline 1-node runs; durability is
    opt-in. Also collapse the legacy `watch_events` tool into a compatibility view
    over the normalized `run_watch` stream (preserving its shape and line cursor,
    marked deprecated), gated on a normalized-vs-legacy parity check.
  - Alternatives: leave `spawn_agent` entirely outside the runtime (document only);
    or route every spawn through the durable machinery now (full 1-node graph on
    the hottest interactive path).
  - Why: modeling spawn as the degenerate 1-node case completes the
    "every frontend is a compiler" thesis without putting durable run machinery on
    the latency-sensitive coordinator fan-out path. Deferring nested-run keeps the
    boundary honest (`D-007`/post-production worktree + lifecycle work gates it).
  - Decided-by: spike + human review.

- `D-015 - "workflow" is not a distinct concept; collapse it into "chain"`
  - Decision: a cosmonauts "workflow" is exactly a **named chain** —
    `WorkflowDefinition` is `{ id, description?, chain: string }`, the chain field
    being a chain-DSL expression run through the same `compileChainToGraph`. There
    is no richer construct. Drop "workflow" as a separate concept name: there is
    one concept, **chain**, where the saved/registered ones are called **named
    chains** and the rest are ad-hoc expressions. Rename the surface accordingly —
    `lib/workflows/` → named-chain registry (e.g. `lib/chains/`),
    `WorkflowDefinition` → `NamedChain` (`.chain` expression field kept),
    `domains/*/workflows.ts` → `chains.ts`, `--list-workflows` → `chain list`, and
    `RunRecord.kind: "workflow"` folds into `"chain"`. Agent skills/prompts/docs that say "workflow" are updated in lockstep
    (Group E). If a genuinely richer construct (branching/conditional pipelines) is
    ever built, it earns a new name then — we do not reserve "workflow" for a
    hypothetical.
  - Alternatives: keep both names (status quo — two words for one thing); or keep
    "workflow" as the user-facing name and drop "chain".
  - Why: one concept with two names is a persistent source of confusion ("is a
    chain a workflow?"); collapsing to the more accurate primitive ("chain") and
    treating named pipelines as saved chains is simpler and truthful to the code.
  - Decided-by: human review (2026-06-05). Enabled by back-compat being a non-constraint.

- `D-016 - Parallel agent execution is a sequenced capability, not wave-2 scope`
  - Decision: the system is intended to run agents in parallel, sequenced as two
    distinct problems with very different cost/risk: **(a) read-only fan-out** —
    an agent spawning N analyzers that don't mutate source — is safe and already
    works via `spawn_agent` (capped at `DEFAULT_MAX_CONCURRENT_SPAWNS = 5`, depth
    2); the only gap is tuning/exposing the cap. This ships as a **standalone
    near-term item**, independent of both wave 2 and wave 3 — it is *not* folded
    into the surface-consolidation plan (it is a behavior change that would muddy
    that plan's preserve-semantics discipline, and being independent means it is
    not gated by the surface work). **(b)
    parallel mutation** — independent implementation tasks running at once — is
    gated behind worktree isolation and stays post-production (wave 3): it needs a
    parallel-wave compiler (Drive currently linearizes tasks for commit ordering),
    `maxParallelSteps > 1`, per-step/per-task worktrees, and a merge finalizer. The
    durable substrate already exists (the graph encodes parallel branches; the
    scheduler dispatches up to `maxParallelSteps` per pass; the shared-worktree
    guard `shared_worktree_mutable_concurrency_capped` is the deliberate safety
    brake) — what is missing is the isolation layer, not the engine. Wave 2 keeps
    parallel mutable execution a **non-goal**, and is in fact a prerequisite for it
    (`runId` + `run_watch` + run/step-tree observability are needed to operate many
    concurrent steps).
  - Alternatives: pull parallel mutation into wave 2 (bloats a clean surface
    change and ships unsafe concurrency without isolation); or treat all
    parallelism as out of scope (ignores that read-only fan-out is nearly free).
  - Why: read/analysis parallelism is cheap and safe and can land soon; mutation
    parallelism is genuinely hard (conflict-safe isolation + merge) and deserves
    its own track. Separating them keeps each honest.
  - Decided-by: human review (2026-06-05).

## Boundary Model

The first delivery wave should preserve these zones and dependency directions.

- `lib/driver/*`
  - Current Drive implementation, event stream, backend wrappers, run loop,
    status classification, resume behavior, and finalization recovery.
  - May depend on the new durable runtime contracts during migration.
  - Should keep current CLI/tool behavior compatible until a child plan
    explicitly routes Drive through graph scheduling.

- `lib/orchestration/*`
  - Existing chain parser, runner, agent spawner, activity bus, and chain event
    contracts.
  - May adapt chain events into normalized orchestration events.
  - Should not own durable execution lifetime once graph scheduling is in use.

- `lib/durable-runtime/*` or equivalent new module namespace
  - Proposed home for generic run records, step records, graph definitions,
    normalized events, file-backed store, backend adapter contracts, scheduler,
    leases, heartbeats, result contracts, and controller read APIs.
  - Must not depend on CLI rendering, agent prompts, or Drive-specific task
    management details.

- `cli/*` and `domains/shared/extensions/*`
  - Human and agent-facing control surfaces.
  - May call runtime APIs and compatibility wrappers.
  - Must not duplicate scheduler, event parsing, or status classification logic.

- `missions/*`
  - Durable work artifacts and run/session storage.
  - Runtime storage should remain inspectable and should not overwrite plan,
    task, archive, or memory artifacts except through existing owned paths.

Allowed dependency direction:

```text
CLI / extensions / tools
        -> durable runtime interfaces
        -> file store / scheduler / backend contracts
        -> backend adapters
        -> Drive or chain compatibility code during migration
```

Disallowed direction:

- Generic runtime modules must not import prompt personas, CLI renderers, or
  plan/task command handlers.
- Store and event contracts must not depend on a specific backend.
- Scheduler logic must not assume the live interactive session remains alive.
- Scheduler logic must not assume it runs in-process with its caller (`D-010`
  is a wave-1 choice, not a contract).
- Child plans must not add parallel mutable execution without an explicit
  worktree policy.

## Current Architecture

Cosmonauts currently has two overlapping orchestration surfaces:

- Chains describe topology and execute through one live chain runner lifetime.
  Current chains support sequential stages, parallel groups, fan-out, loops,
  event callbacks, child spawn waiting, and a global timeout policy.
- Drive executes plan-linked tasks with more durable mechanics: run
  directories, event logs, backend abstraction, verification, commits,
  detached mode, status classification, resume, and finalization recovery.

This split creates the central failure mode addressed by the design: chains are
expressive but session-coupled, while Drive is durable but task-shaped. Broad
implementation plans can outgrow a chain even when the underlying agents could
have completed the work given durable scheduling and resumable state.

Important existing context and likely extraction seams for planners:

- `lib/driver/README.md` documents current Drive behavior and recovery states.
- `domains/shared/capabilities/drive.md` documents current Drive tool rules and
  timeout defaults.
- `lib/orchestration/types.ts`, `lib/orchestration/chain-runner.ts`, and
  `lib/orchestration/spawn-completion-loop.ts` document current chain runtime
  limits and event contracts.
- `lib/driver/event-stream.ts`, `lib/driver/types.ts`, and
  `cli/drive/subcommand.ts` are the key seams for run store, event, status,
  and resume extraction.

## Target Architecture

The target architecture introduces a durable orchestration runtime where:

- A `RunRecord` is the durable unit of execution.
- A `StepRecord` is an executable graph node with inputs, outputs, status,
  lease, heartbeat, retry policy, result, and optional worktree policy.
- A normalized `OrchestrationEvent` stream covers run, step, backend activity,
  artifact, child run, and terminal lifecycle events.
- `OrchestrationBackend` adapters execute steps through internal Cosmonauts
  agents, Codex CLI, Claude Code CLI, package binaries, nested runs, shell
  commands, or approval gates.
- The scheduler owns graph execution, leases, heartbeats, stale detection,
  retries, blocking, and finalization. The live session is a controller and
  observer, not the execution owner — this is what removes the session-coupled
  chain limitation.
- Live agents and CLIs interact through controller APIs in three tiers: **run
  creation** (`run_start`) — an internal runtime API the Plan-4 compatibility
  wrappers call; **observation** (`run_status`, `run_watch`) — the read-only
  surface wave 1 ships; and **lifecycle mutation** (`run_pause`, `run_resume`,
  `run_cancel`, `run_intervene`) — post-production (`D-009`). `run_start` is
  delivered in Plan 4 as the wrapper entry point, not part of the deferred
  mutating set. The existing `cosmonauts drive run --resume` stays supported
  throughout as Drive-native compatibility; only the *generic* `run_resume`
  controller is post-production.
- Existing `chain_run`, workflows, `cosmonauts --chain`, `run_driver`, and
  `cosmonauts drive` surfaces remain compatible wrappers during migration.

The first production wave should end with:

- Drive and `run_driver` routable through graph-backed runtime behavior.
- A simple durable chain compiler for sequential, bracket-parallel, and fan-out
  chains.
- Compatibility paths for current Drive and chain behavior.
- Normalized read APIs for status and event watching.

The first production wave should **not** include: full durable coordinator
loops; full nested cancellation/pause/resume policy; per-step worktrees by
default; merge finalizer production workflow; distributed scheduling, daemon
mode, SQLite store, or remote coordinator.

## Core Contracts

These are the canonical contracts every plan builds toward. Treat the field
sets as the target shape; a plan may introduce a subset first (e.g. Plan 1 may
land `RunRecord`/`StepRecord`/`OrchestrationEvent` without `lease`/`heartbeat`
behavior, which Plan 3 activates). Field names and union members are the stable
vocabulary across plans and events.

### Undefined types and ownership

A few referenced types are intentionally named placeholders, owned by the plan
that needs them first. They are still canonical *names* — plans must use them,
not invent synonyms, and may extend (never rename) their fields:

- **Plan 1** — `ArtifactRef` (`{ id; kind; path; stepId?; createdAt }`, a
  reference into the run's `artifacts/` store); `RunResult` (a run-level summary:
  a terminal `RunRecord` status as `outcome`, plus `summary`, `tasksDone?`,
  `tasksBlocked?`); and the thin Drive-report mirrors `FileChangeSummary` /
  `VerificationResult` / `CommitRef`.
- **Plan 2** — `BackendSpec` (`{ name: BackendName; ...backend opts }`); the
  adapter plumbing types `BackendCapabilities`, `BackendContext`,
  `PreparedStep`, `BackendHandle`; and `StepAttemptRecord`
  (`{ attemptId; startedAt; endedAt?; result? }`) — Plan 2 writes the first
  attempt; Plan 3 adds the retry path that appends more.
- **Plan 3** — `StepHeartbeat` (`{ at; note? }`), `RetryPolicy`
  (`{ maxAttempts; backoffMs? }`), and `SchedulerState` (persisted ready-set,
  leases, and cursor).
- **Post-production** — `ApprovalGate` is a documented name only; not wave 1.

### Run record

```ts
interface RunRecord {
  id: string;
  kind: "chain" | "drive" | "workflow" | "adhoc";
  title: string;
  projectRoot: string;
  createdAt: string;
  updatedAt: string;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "blocked"
    | "completed"
    | "failed"
    | "cancelled"
    | "stale";
  parentRunId?: string;
  parentStepId?: string;
  policy: RunPolicy;
  graphPath: string;
  eventsPath: string;
  artifactsDir: string;
  schedulerStatePath: string;
}
```

### Step record

```ts
interface StepRecord {
  id: string;
  runId: string;
  title: string;
  kind: "agent" | "drive" | "chain" | "command" | "approval" | "finalizer";
  backend: BackendSpec;
  dependsOn: string[];
  status:
    | "queued"
    | "ready"
    | "leased"
    | "running"
    | "waiting"
    | "blocked"
    | "completed"
    | "failed"
    | "cancelled"
    | "stale";
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  worktree?: WorktreeSpec;
  lease?: StepLease;
  heartbeat?: StepHeartbeat;
  retryPolicy?: RetryPolicy;
  result?: StepResult;
  latestAttemptId?: string;
}
```

Step status must be **monotonic** except for explicit retry/resume transitions.
A retry must produce a new `StepAttemptRecord` — defined in Plan 2, with Plan 3
adding the scheduler retry path that appends further attempts — not erase the old
one: each attempt is stored under `steps/<stepId>/attempts/<attemptId>/` with its
own `result.json`, while `step.json` keeps the step's current status and a
`latestAttemptId` pointer.

### Backend adapter

```ts
interface OrchestrationBackend {
  name: string;
  capabilities: BackendCapabilities;
  prepare(step: StepRecord, ctx: BackendContext): Promise<PreparedStep>;
  start(prepared: PreparedStep): Promise<BackendHandle>;
  resume?(step: StepRecord, ctx: BackendContext): Promise<BackendHandle>;
  cancel?(handle: BackendHandle): Promise<void>;
}
```

| Backend | Role |
|---|---|
| `cosmonauts-subagent` | Run an internal agent through Pi session creation. |
| `codex` | Run Codex as an external CLI worker. |
| `claude-cli` | Run Claude Code as an external CLI worker. |
| `package-cli` | Run an exported packaged agent binary. |
| `nested-run` | Start a child durable run and wait for its terminal status. |
| `shell-command` | Run bounded verifier/build commands. |
| `approval` | Wait for human or policy approval. |

Every backend must emit normalized events and a terminal `StepResult`.

Backend identifiers are persisted contract values, so wave 1 keeps the names the
code already uses — `codex`, `claude-cli`, and `cosmonauts-subagent` — and adds a
new `shell-command` backend for verification/finalizer steps. The remaining
table rows (`package-cli`, `nested-run`, `approval`) are **documented future
names only**: do not build stub adapters for them in wave 1, since stubs add
contract and test surface before they serve any wave-1 goal. Any later rename is
a deliberate migration with aliases, not informal drift.

Single-adapter extensibility is the load-bearing flexibility property: adding a
backend must mean implementing one `OrchestrationBackend` adapter and
registering it — with no changes to the store, scheduler, event model, or
compilers. Because each `StepRecord` carries its own `backend`, one run graph
can mix backends across steps (e.g. a planner step on `codex`, a worker step
on `cosmonauts-subagent`). Exposing per-stage backend selection in the chain DSL
is a natural additive follow-up, not wave-1 scope.

### Normalized events

One event stream for every backend. Backend-specific detail lives in `details`;
top-level lifecycle is stable. Legacy Drive/chain event types remain available
for compatibility while the shared model matures.

```ts
type OrchestrationEvent =
  | { type: "run_started"; runId: string }
  | { type: "run_completed"; runId: string; result: RunResult }
  | { type: "run_blocked"; runId: string; reason: string }
  | { type: "step_ready"; runId: string; stepId: string }
  | { type: "step_started"; runId: string; stepId: string; backend: string }
  | { type: "step_heartbeat"; runId: string; stepId: string }
  | { type: "step_output"; runId: string; stepId: string; chunk: string }
  | { type: "step_tool_activity"; runId: string; stepId: string; details: unknown }
  | { type: "artifact_written"; runId: string; stepId?: string; artifact: ArtifactRef }
  | { type: "step_completed"; runId: string; stepId: string; result: StepResult }
  | { type: "step_failed"; runId: string; stepId: string; reason: string }
  | { type: "step_blocked"; runId: string; stepId: string; reason: string }
  | { type: "child_run_started"; runId: string; stepId: string; childRunId: string }
  | { type: "run_failed"; runId: string; reason: string }
  | { type: "run_cancelled"; runId: string }
  | { type: "run_stale"; runId: string }
  | { type: "step_cancelled"; runId: string; stepId: string }
  | { type: "step_stale"; runId: string; stepId: string };
```

Every event is persisted inside a stable envelope — `{ seq, timestamp, runId,
event }` — where `seq` is a monotonic per-run integer and `timestamp` is
ISO-8601 (matching today's Drive `DriverEventBase.timestamp`). `run_watch`,
status summaries, and crash recovery order events by `seq`, not by JSONL line
position. There must be a terminal event variant for every terminal `RunRecord`
/ `StepRecord` status so the event stream alone can reconstruct final state.

### Step result

Every step result must answer: did the backend complete; did the intended work
complete; what artifacts prove it; what changed; what should the scheduler do
next.

```ts
interface StepResult {
  outcome:
    | "success"
    | "blocked"
    | "partial"
    | "failed"
    | "unknown"
    | "cancelled";
  summary: string;
  artifacts: ArtifactRef[];
  files?: FileChangeSummary[];
  verification?: VerificationResult[];
  commits?: CommitRef[];
  nextAction?: "continue" | "retry" | "wait_for_human" | "abort_run";
}
```

Per `D-006`, external backends must emit machine-readable reports. A malformed
or missing report records `unknown`; the runtime must not treat unknown prose
as success unless `RunPolicy.reportInference` explicitly allows inference from
objective checks. Wave 1 accepts the existing report contract verbatim as
machine-readable evidence — the current fenced-JSON report and the `OUTCOME:`
marker parsed by `lib/driver/report-parser.ts`; stricter report hardening is
post-production.

### Leases, heartbeats, retry

```ts
interface StepLease {
  holderId: string;
  acquiredAt: string;
  expiresAt?: string;
  renewable: boolean;
}
```

For no-artificial-timeout operation (`D-004`), leases may be renewable without a
fixed deadline, but they still require heartbeats so dead processes are
detectable as `stale`. `StepHeartbeat` and `RetryPolicy` shapes are defined by
Plan 3; a retry yields a new attempt record (see step-record monotonicity rule).

### Policy

```ts
interface RunPolicy {
  maxParallelSteps?: number;
  maxCostUsd?: number;
  maxTokens?: number;
  idleTimeoutMs?: number;
  hardTimeoutMs?: number;        // optional — never a framework default (D-004)
  staleHeartbeatMs?: number;
  retryLimit?: number;
  requireApprovalFor?: ApprovalGate[];
  defaultBackend: BackendSpec;
  worktree: WorktreeSpec;
  reportInference: "never" | "from-passing-checks";
}
```

### Worktree isolation

```ts
interface WorktreeSpec {
  mode: "shared" | "run-worktree" | "step-worktree" | "external";
  branch?: string;
  baseRef?: string;
  path?: string;
  mergePolicy?: "manual" | "fast-forward" | "merge-commit" | "patch";
}
```

Wave-1 default is `shared` for sequential stages and read-only verification.
`run-worktree`/`step-worktree` creation and merge finalization are
post-production (`D-007`, see `## Out of Scope`). The type ships early so the
model is explicit, but concurrent mutable execution must not be enabled without
an explicit worktree policy (Boundary Model).

## Storage Layout

Runtime storage is file-backed and inspectable (`D-002`). Initial layout:

```text
missions/sessions/<scope>/runs/<runId>/
  run.json          # RunRecord
  graph.json        # steps + edges
  scheduler.json    # SchedulerState
  events.jsonl      # normalized OrchestrationEvent stream
  artifacts/        # ArtifactStore
  steps/<stepId>/
    step.json              # StepRecord: current status + latestAttemptId
    heartbeat.json         # StepHeartbeat
    attempts/<attemptId>/
      output.md
      result.json          # StepResult for this attempt
```

`<scope>` is the run's namespace: Drive runs use the `planSlug` (matching
today's `missions/sessions/<planSlug>/runs/...` layout and `watch_events`);
chain and workflow runs use a stable chain/workflow scope; ad-hoc runs use
`adhoc`.

Plan-1 Drive compatibility note: the target layout above still reserves
`events.jsonl` for the normalized `OrchestrationEvent` stream in generic runtime
storage. During Plan 1 only, legacy Drive continues to own the run-root
`events.jsonl` consumed by existing `watch_events` plus Drive resume/status
compatibility, so Drive normalized events are written to
`orchestration-events.jsonl` in the same run directory and `RunRecord.eventsPath`
points there. This is an authorized wave-1 compatibility exception, not a
target-architecture change; a later frontend migration may make legacy
`watch_events` a compatibility view over normalized events.

This lives under the already-gitignored `missions/sessions/` tree (high-volume,
regenerable transcripts). The store interface must not bake in the file layout
so a later SQLite or remote-coordinator store stays possible. Runtime storage
must not overwrite plan/task/archive/memory artifacts except through existing
owned paths (Boundary Model).

## Scheduler Model

The scheduler owns graph execution and is **not** the live agent (`D-007`,
`D-010`).

Responsibilities:

- Load run graph and state.
- Mark steps `ready` when dependencies are satisfied.
- Acquire leases for ready steps.
- Enforce max parallelism and isolation constraints.
- Start backend adapters; record heartbeats and output.
- Detect stale leases.
- Retry or block according to policy.
- Finalize the run when terminal conditions are met.

Terminal-state and recovery rules:

- Step status is monotonic except for explicit retry/resume.
- A restarted scheduler must reconcile from durable state: detect heartbeats,
  stale leases, or terminal process state and resume **without duplicating
  committed work** (see acceptance scenario "scheduler crash").
- A finalization failure is modeled as a `finalizer` step that fails with
  `result.nextAction: "retry"` plus enough evidence to resume safely — never as
  a behavioral task failure. The generic run/step status enums add no
  `finalization_failed` member; the Drive compatibility layer (Plan 4) maps a
  retryable failed finalizer step onto today's Drive `finalization_failed`
  outcome.

Policy can express: no timeout with only stale-heartbeat detection; idle
timeout after no output/heartbeat for N minutes; hard timeout for bounded
commands; or human approval before retrying stale work.

## Compilers

Chains and Drive become graph compilers over the shared runtime.

### Chain compiler

| Chain syntax | Graph translation |
|---|---|
| `a -> b` | `b.dependsOn = [a]` |
| `[a, b]` | `a` and `b` share dependencies; the next step depends on both |
| `reviewer[3]` | three sibling steps with the same role and prompt |
| loop stage | **deferred** (`D-008`) — kept on the legacy inline path for wave 1 |

Wave 1 covers `a -> b`, `[a, b]`, and fan-out only. Loop stages (today's
implicit coordinator loop) remain on the legacy inline chain runner behind an
explicit compatibility/debug mode. Making loops durable — via a scheduler-owned
loop controller or by re-expressing the coordinator as a planner of child runs
so a Pi session is not held open just to wait — is post-production scope.

### Drive compiler

First version:

- One step per selected task.
- Respect explicit `taskIds` order when provided; otherwise derive dependency
  waves from task dependencies.
- Add finalizer steps for source commit, task status, and final state commit
  where needed.
- Reuse current Drive prompt rendering and report contract.

Later versions (post-production): parallel-safe waves, per-task worktrees with
merge finalization, mixed backend policies per task label, verification-only and
approval steps.

## Compatibility Surface

Existing commands and tools stay; they route through the runtime over time.

| Current surface | Future behavior |
|---|---|
| `chain_run` | Compile chain DSL to durable graph and start run. |
| `cosmonauts --chain` | Same, with CLI watch by default. |
| named workflows | Compile workflow chain to durable graph. |
| `run_driver` | Compile Drive task run to durable graph. |
| `cosmonauts drive run` | Same backend as `run_driver`; no separate state model. |
| `watch_events` | Compatibility view over normalized event stream. |

`chain_run` and `run_driver` become thin wrappers:

```ts
chain_run({ expression, prompt })
  => compileChain(expression, prompt) => run_start({ graph, mode: "durable" })

run_driver({ planSlug, taskIds, backend })
  => compileDrive(planSlug, taskIds, backend) => run_start({ graph, mode: "durable" })
```

The old inline behavior remains available as `mode: "inline"` for small or
debugging runs (and for chain loops in wave 1), but the default trends toward
durable execution.

## Delivery Plan Breakdown

Four plans, sequential dependencies, ~8–10 PRs. Each child plan links back here
via `## Architecture Context`.

### Plan 1 — `durable-run-store-events`

- **Goal:** Extract a generic file-backed run store shape and normalized events
  while preserving current Drive behavior exactly.
- **Candidate PRs:**
  1. Add generic `RunStore`, run/step/event types, and file-backed storage
     under the runs directory layout above.
  2. Adapt Drive to write normalized `OrchestrationEvent`s alongside its
     existing Drive events (dual-write).
  3. Add compatibility `run_status` and `run_watch` read paths over the
     normalized stream.
- **In scope:** `RunRecord`, `StepRecord`, `OrchestrationEvent` types; the
  file-backed store and its CRUD (including the ability to persist step records,
  even if empty); Drive→normalized event translation; read APIs.
- **Out of scope:** No scheduler; no change to Drive execution or CLI behavior;
  Drive still owns its loop; **populating** Drive task/finalizer step records and
  their results/attempts — Plan 2 owns that; Plan 1 only provides the storage.
- **Key seams:** `lib/driver/event-stream.ts`, `lib/driver/types.ts`,
  `cli/drive/subcommand.ts`.
- **Acceptance:** existing Drive runs behave identically; characterization
  tests document current Drive/chain behavior before extraction; normalized
  events are inspectable on disk; `run_status`/`run_watch` report correct state
  for a real Drive run.
- **Depends on:** nothing (first plan).

### Plan 2 — `durable-backend-step-model`

- **Goal:** Make the runtime model concrete while Drive still uses its current
  loop.
- **Candidate PRs:**
  4. Introduce `OrchestrationBackend` and wrap existing Drive backends.
  5. Add generic `StepRecord` persistence for Drive task execution.
  6. Move Drive finalization phases toward generic finalizer step records
     without changing CLI behavior.
- **In scope:** backend adapter contract; step persistence for Drive tasks;
  finalizer-step modeling; enforce `D-006` `unknown`-vs-success rules in the
  result contract path.
- **Out of scope:** scheduler does not own execution yet; backends are wrapped,
  not replaced; CLI behavior unchanged.
- **Acceptance:** Drive task execution is describable as generic `StepRecord`s;
  finalization phases are represented as finalizer step records; malformed
  backend reports yield `unknown`; CLI behavior unchanged.
- **Depends on:** Plan 1.

### Plan 3 — `durable-graph-scheduler`

- **Goal:** The smallest useful durable scheduler. Riskiest plan.
- **Candidate PRs:**
  7. Sequential graph scheduling: dependencies, leases, heartbeats, terminal
     state.
  8. Retry/block/stale handling and bounded, opt-in parallelism.
- **In scope:** dependency scheduling, leases, heartbeats, stale detection,
  retry/block transitions, monotonic status with new-attempt records, crash
  recovery, bounded parallelism behind an explicit limit.
- **Out of scope:** distributed scheduling; daemon/child-process scheduler
  (`D-010` keeps it in-process); per-step worktrees by default; parallel mutable
  work without a worktree policy.
- **Acceptance:** scheduler advances a graph of generic steps to terminal
  state; lease/heartbeat/stale machinery works; a killed-and-restarted scheduler
  resumes without duplicating committed work; retries create new attempt
  records; parallelism only beyond an explicit `maxParallelSteps`.
- **Depends on:** Plans 1 and 2.

### Plan 4 — `durable-frontend-migration`

- **Goal:** Move user-facing surfaces onto the runtime incrementally.
- **Candidate PRs:**
  9. Compile Drive specs into graph runs; route `cosmonauts drive` and
     `run_driver` through the scheduler.
  10. Add a simple durable chain compiler for `a -> b`, `[a, b]`, and fan-out,
      keeping loop stages / coordinator waiting on the legacy inline path.
- **In scope:** Drive-on-graph; durable chain compiler for the three shapes;
  `chain_run`/`run_driver` as compatibility wrappers around `run_start`;
  `mode: "inline"` retained for loops and debugging.
- **Out of scope:** durable coordinator loops; nested cancellation/pause/resume
  policy; per-step worktrees by default; merge finalization.
- **Acceptance:** Drive runs through the graph runtime with the current CLI
  surface preserved; the chain compiler handles sequential, bracket-parallel,
  and fan-out; loops still run on the legacy path; no regression in existing
  Drive/chain behavior.
- **Depends on:** Plans 1–3.

## Cross-Plan Acceptance Scenarios

These stress tests are the durable acceptance bar for the track. Each maps to
the plan(s) that must satisfy it; scenarios beyond wave 1 are listed so plans do
not silently regress the path toward them.

1. **Large implementation plan** (Plan 4) — ~14 tasks, broad UI tasks, e2e
   postflight. A Drive-like graph survives session death and resumes cleanly.
2. **Scheduler crash** (Plan 3) — kill the scheduler mid-run; the restarted
   scheduler detects heartbeats / stale leases / terminal process state and
   resumes without duplicating committed work.
3. **External backend malformed report** (Plan 2) — backend exits zero but emits
   no report marker; the step outcome is `unknown` unless policy allows
   objective-check inference.
4. **Long idle work** (Plan 3) — a backend produces no output longer than legacy
   chain limits but keeps heartbeating; no hard timeout fires unless policy says
   so (`D-004`).
5. **Self-modifying Cosmonauts run** (Plan 4) — Cosmonauts modifies its own
   orchestration source while a Drive run is active. Wave-1 bar: Drive-on-graph
   **preserves the existing detached frozen runner** (`cosmonauts-drive-step`) so
   a running step does not load mutated code mid-flight. A generic frozen runner
   / packaged backend for all backends is post-production.
6. **Parallel reviewer panel** (post-production) — a step starts reviewers plus
   a verifier concurrently; all child steps visible; the parent waits on durable
   completion.
7. **Concurrent task waves** (post-production) — independent backend tasks run
   in per-step worktrees; a finalizer merges or blocks with clear conflict
   evidence.
8. **Nested cancellation** (post-production) — cancel a parent while a child
   Drive run is active; the configured cancellation policy is followed and
   recorded.

## Major Risks

- **State migration complexity.** Drive has a concrete state model; a generic
  model may be too abstract or force churn. Mitigation: `D-003` reuses Drive's
  substrate; Plan 1 preserves behavior with characterization tests.
- **Worktree conflicts.** Concurrent mutable runs create merge/branch
  complexity. Modeled explicitly (`WorktreeSpec`) and deferred, not bolted on.
- **Backend report quality.** External agents may ignore contracts. The runtime
  blocks unknown results clearly (`D-006`).
- **Scheduler correctness.** Leases, retries, cancellation, and stale detection
  are easy to get subtly wrong — hence sequential-first and crash-recovery
  acceptance (`D-007`, Plan 3).
- **Run explosion.** Free run creation needs policy controls, lineage, and cost
  visibility. Cost caps across nested runs are post-production.
- **Prompt/runtime mismatch.** Agents expect `spawn_agent`, `chain_run`, and
  task tools. Prompts must evolve alongside tools, or agents keep using legacy
  paths.

## Resolved vs Open Questions

Resolved for wave 1 (recorded as decisions):

- Scheduler runtime form → in-process library (`D-010`).
- Minimal controller surface → read-only `run_status`/`run_watch` (`D-009`).
- Chain loops in wave 1 → legacy inline path; durable loops deferred (`D-008`).
- Hard timeout default → none; stale detection + explicit policy (`D-004`).
- Store backing → file-backed first (`D-002`).

Still open (to resolve within the relevant plan or post-production):

- How much of Drive's current state format must remain byte-stable for
  backwards compatibility (Plan 1/2).
- Whether external backends must use packaged-agent prompts or the current Drive
  envelope can remain the first contract (Plan 2 / later).
- Default worktree isolation policy for parallel mutable steps (post-production).
- How cost caps work across nested runs and heterogeneous providers
  (post-production).
- How approval gates surface in non-interactive contexts (post-production).
- Whether the scheduler later moves to a child process or daemon
  (post-production; `D-010` is wave-1 only).

## Out of Scope / Post-Production Follow-ups

Excluded from the first wave unless a child plan hits a blocking dependency:

- Durable coordinator loops — replace long-lived waiting sessions with explicit
  nested runs or a scheduler-owned loop controller.
- Full nested-run lifecycle policy — parent/child cancellation, pause, resume,
  inherited cost caps, tree-shaped status views.
- Worktree isolation for concurrent mutable steps — run-level worktrees before
  per-step worktrees by default.
- Merge finalizer steps for isolated worktrees — conflict evidence, manual merge
  handoff, retryable merge finalization state.
- Broader approval gates for risky operations — high cost, many child runs,
  shared DB migrations, production-impacting commands, merge conflicts.
- Cost/token accounting across nested runs and heterogeneous backends, enforced
  at run and run-tree level.
- Backend report hardening — stricter machine-readable contracts, better
  malformed-report diagnostics, optional objective-check inference.
- Prompt/capability evolution so agents prefer `run_start`/`run_watch`/
  `run_status` over legacy `chain_run`/`spawn_agent`/Drive paths. — **Promoted into
  Wave 2 (`D-011`..`D-014`); the doc/prompt/capability refresh is Group E of the
  Wave-2 plan below.**
- Scheduler form evaluation — in-process vs child process vs daemon.
- SQLite or remote-coordinator store, only after file-backed semantics
  stabilize under real use.

## Wave 2 — Orchestration Surface Consolidation (candidate plan)

Wave 1 (Plans 1–4) unified the **runtime**. Wave 2 unifies the **surface**,
realizing `D-011`..`D-016`. It is a deliberate, spike-first boundary change
(`missions/architecture/spikes/orchestration-surface-consolidation.md`), not an
ad-hoc refactor. It preserves run-state and execution *semantics* (characterization
tests guard the `runStart` refactor), but it does **not** preserve the old
CLI/tool *names* — back-compat is not a constraint (`D-013`); callers move in
lockstep. Candidate plan slug: `orchestration-surface-consolidation`.

Sequenced as five groups; A is the load-bearing refactor every later group leans
on, E is documentation and lands last (after the surface is stable). Group order
is a dependency order, not a hard PR count — the plan/`task` stage refines it.

### CLI output contract (`D-013`)

Every `cosmonauts run` subcommand follows one contract:

- **stdout = machine-readable result only.** Exactly one JSON value, the final
  result/summary. There is **no** `--json`/`--plain` flag on `run` — JSON is
  always-on (matching today's `cosmonauts drive`, which is JSON-native and rejects
  `--json`). The unrelated introspection flags (`--list-agents`, `--list-domains`,
  `chain list`) keep their existing `--json`/`--plain` switches.
  - `run chain` / `run drive`, **inline** (runs to completion): a run summary
    `{ runId, scope, kind, status, ... }` — `run chain` includes per-stage
    outcomes; `run drive` carries the `DriverResult` fields. Final terminal status.
  - `run chain` / `run drive`, **detached** (returns immediately): a start summary
    `{ runId, scope, status: "running", ... }` so the caller can hand `runId` to
    `run watch`.
  - `run status <runId>`: a `RunStatusSummary` object.
  - `run watch <runId>`: an events page `{ events, cursor }` (normalized
    `OrchestrationEvent`s); a future `--follow` may stream one JSON object per line
    (JSONL) instead.
  - `run list`: a JSON array of run summaries.
- **stderr = human progress/logs only.** Live stage/step progress, diagnostics,
  warnings. Never parsed; safe to silence.
- **exit code:** `0` only on terminal success (`completed`); non-zero on
  `failed`/`blocked`/`aborted`/`cancelled` (matches today's `drive` inline exit
  behavior). Detached starts exit `0` once the run is launched.

The agent-facing tools (`run_status`/`run_watch`) already return structured data;
this contract makes the CLI consistent with them and with `runId`-as-universal
-currency (`D-011`).

### Group A — The `runStart` seam (`D-011`, runtime spine)

- **Scope:** extract a single internal `runStart({ store, ref, graph, policy,
  backends, mode, metadata })` owning the create-run + write-graph + init-steps +
  seed-`run_started` + drive-scheduler-to-terminal envelope that
  `lib/orchestration/durable-chain-runner.ts` and
  `lib/driver/drive-graph-runner.ts` duplicate today. Route both runners through
  it; each keeps only its compiler and its result reconstruction. Drive's
  drain-loop, finalizer-failure polling, and `withSafeSchedulerEventWrites` layer
  **above** the shared core (R1).
- **Behaviors seed:** `runStart` advances a compiled graph to terminal and
  returns `{ runId, scope, run, steps }`; chain and Drive produce byte-identical
  on-disk run state and results to today (characterization tests as the guard);
  the detached frozen-runner path (Architecture X, scenario 5) is unchanged.
- **Stays compat-wrapped:** nothing caller-visible changes in this group.

### Group B — One observation surface (`D-011`, `D-014`)

- **Scope:** promote `run_status`/`run_watch` to the canonical read surface across
  all scopes; surface `{ runId, scope }` from `chain_run` and the chain CLI so
  chain runs (ad-hoc or named) are observable like Drive runs; re-implement
  `watch_events` as a **compatibility view** over the normalized stream (same
  legacy shape + line cursor, marked deprecated).
- **Behaviors seed:** a chain run is observable via `run_watch` by its
  returned `runId`; `watch_events` returns data sourced from the normalized stream
  with the legacy fields agents depend on intact (parity check); `run_status`
  reports correct terminal state for chain, drive, and adhoc runs.
- **Stays compat-wrapped:** `watch_events` keeps working unchanged for callers;
  `chain_run` keeps its blocking return of the full `ChainResult` (now *plus*
  `{ runId, scope }`).

### Group C — `cosmonauts run` CLI surface + `workflow`→`chain` rename (`D-013`, `D-015`)

- **Scope:** make `cosmonauts run` the sole orchestration CLI surface — `run chain`
  (ad-hoc expression or named chain), `run drive`, and `run status|watch|list`
  backed by the normalized controller. **No `run spawn`** (`D-016`); single-agent
  CLI stays `-p`. Every `run` subcommand is JSON-native on stdout (summary carries
  `runId` + `scope`); progress to stderr. Migrate `-w/--workflow` and bare
  `cosmonauts drive ...` onto `run` (thin temporary aliases allowed during the
  transition; not a permanent compat commitment — back-compat is not a constraint).
  Fold in the **`workflow`→`chain` rename** (`D-015`): `lib/workflows/` →
  chain-registry, `WorkflowDefinition.chain`, `domains/*/workflows.ts`,
  `--list-workflows` → `chain list`, `RunRecord.kind: "workflow"` → `"chain"`.
- **Behaviors seed:** `cosmonauts run chain "<expr>"` and `cosmonauts run chain
  <name>` both run and emit a `runId`-keyed JSON summary; `cosmonauts run drive
  --plan <slug>` matches today's `drive run` output; `run status|watch <runId>`
  works uniformly for chain and drive runs; named chains list under `chain list`.
- **Caller migration:** agent skills/prompts/docs that invoke `-w`/`workflow` are
  updated in lockstep (Group E) — no permanent alias is relied upon.

### Group D — Spawn as the inline-default 1-node compiler (agent-only) (`D-014`, `D-016`)

- **Scope:** introduce `compileSpawnToGraph` (one `agent` step,
  `cosmonauts-subagent` backend) as the modeled shape for `spawn_agent`; keep
  `spawn_agent` defaulting to **inline** and **agent-only** (no CLI verb); document
  the degenerate-1-node mapping and the run-explosion policy (steps-inside-runs vs
  ad-hoc top-level spawns).
- **Behaviors seed:** `spawn_agent`'s interactive behavior is unchanged; the
  1-node compiler exists and is exercised by a test; docs state the inline default,
  agent-only scope, and the deferred durable nested-run escalation explicitly.
- **Out of scope here:** both halves of `D-016` — read-only fan-out cap tuning
  (a standalone item, shippable independently) and durable parallel mutation +
  worktree isolation (wave 3).

### Group E — Doc / prompt / capability refresh + rename propagation (`D-011`, `D-015`)

- **Scope:** the doc refresh wave 1 deliberately deferred, plus propagating the
  `workflow`→`chain` rename through all prose. Rewrite `docs/orchestration.md`
  (0 durable mentions today) around one-runtime / compilers / `runId` /
  `run_status`/`run_watch` and `cosmonauts run`; teach the normalized surface in
  `domains/shared/skills/drive/SKILL.md` (0 durable mentions) and
  `capabilities/drive.md`; position spawn as the inline, agent-only 1-node
  primitive in `skills/spawning/SKILL.md` + `capabilities/spawning.md`; elevate the
  `lib/driver/README.md` durable section; nudge coordinator/planner/quality-manager
  prompts toward `runId`-aware observation and `cosmonauts run`/`chain` naming;
  update the external `cosmonauts` skill (drop "workflow", use `run chain`/
  `run drive`).
- **Behaviors seed:** the orchestration docs describe the consolidated surface; no
  prompt/skill still says "workflow" as a distinct concept or points at a removed
  flag. Shipped skills/docs stay stack-agnostic (no baked-in `bun run`/`npm test`).

### Non-goals (explicit)

- Do **not** migrate chain loops or the coordinator off the legacy inline path
  (`D-008`).
- Do **not** build the durable nested-run lifecycle — no `parentRunId`/
  `parentStepId` on `RunRecord`, no `nested-run` backend, no parent/child
  cancellation (`D-014`, post-production).
- Do **not** add per-step worktrees, merge finalizers, **parallel mutable
  execution**, or approval gates — the (b) half of `D-016` is wave 3, gated behind
  worktree isolation. Read-only fan-out cap tuning (the (a) half) is **also out of
  this plan** — it ships as a standalone item, not inside the consolidation.
- Back-compat is **no longer** a non-goal: callers are migrated in lockstep rather
  than preserved (`D-013`); the agent tools (`chain_run`, `run_driver`,
  `spawn_agent`, `watch_events`) may be renamed toward the canonical surface as
  long as every internal caller is updated together.

### Acceptance bar

Chain/drive/spawn behavior is preserved where semantics don't change
(characterization tests guard the `runStart` refactor); a chain run and a Drive run
are both observable through one `runId`-keyed `run_status`/`run_watch` surface;
`watch_events` is a passing compat view over the normalized stream; `cosmonauts run
chain|drive` plus `run status|watch|list` work and are JSON-native; no "workflow"
concept or removed flag remains referenced in code, prompts, skills, or docs; the
spawn 1-node compiler is modeled and tested; the test suite and `lint`/`typecheck`/
`check-artifacts` gates stay green.

## Related Work

- `missions/plans/orchestration-consolidation/plan.md` pursued the same goal
  (one engine, chains and Drive as frontends) through a different primitive — a
  per-invocation "capsule" wrapper. It is **superseded** by this track, which is
  the authoritative delivery shape. Its distinct flexibility ideas —
  single-adapter backend extensibility and per-step backend selection — are
  folded into the Core Contracts above; it is retained as historical
  exploration, not active work.
