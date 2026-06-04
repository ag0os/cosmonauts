# Plan Review: durable-graph-scheduler

## Findings

- id: PR-001
  dimension: risk-blast-radius
  severity: high
  title: "No-duplicate committed work is only proven after terminal evidence is already persisted"
  plan_refs: plan.md:157-165, plan.md:177-185, plan.md:392-393, plan.md:444, missions/architecture/durable-orchestration-runtime.md:571-573
  code_refs: lib/durable-runtime/backends.ts:33-38, lib/driver/backends/orchestration-adapter.ts:26-38, lib/driver/backends/orchestration-adapter.ts:100-107, lib/durable-runtime/file-store.ts:221-244
  description: |
    The architecture requires scheduler-crash recovery to resume "without duplicating committed work", and the plan says B-009/B-011 prove that guarantee. But B-009 starts after `StepRecord.result`, output/commit evidence, and the attempt result are already persisted; B-011 starts after `attempt-001` already has `endedAt` and a terminal `result`. The event/store order likewise writes the terminal attempt result only after the backend has returned a terminal result.

    The existing backend contract exposes terminal output as an in-memory `BackendHandle.result: Promise<Result>`. The current Drive orchestration adapter returns `backend.run(prepared.input)` as that promise, and two existing Drive adapters are `canCommit: true`. A scheduler process can therefore die after the backend committed external work but before `FileRunStore.writeStepAttemptRecord` writes the terminal attempt/result evidence. Recovery would have no terminal attempt to promote and could later retry a stale running step, duplicating committed work.

    Fix: add an explicit behavior and contract for this ambiguous commit window before tasking. The plan should either require `canCommit` backends to durably record terminal evidence before externally visible commits, or require recovery to block/diagnose non-idempotent `canCommit` steps that lack persisted terminal evidence rather than retrying them. The fake-backend counter test must simulate a commit side effect before the scheduler's terminal store write, not only after persisted terminal attempts.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "Fresh-heartbeat recovery with non-resumable backends is not concretely proven"
  plan_refs: plan.md:127-135, plan.md:315-322, plan.md:365-367, plan.md:449
  code_refs: lib/driver/backends/orchestration-adapter.ts:18-40, lib/driver/backends/orchestration-adapter.ts:109-113, lib/durable-runtime/file-store.ts:29-33, lib/durable-runtime/types.ts:61-68
  description: |
    B-006 tests stale recovery and includes a prose clause that a fresh persisted heartbeat does not start a duplicate attempt. The design also says a fresh running step whose backend cannot resume should wait for stale detection or terminal evidence. That path is correctness-critical because all current Drive orchestration adapters have `canResume: false` and their `resume`/`cancel` operations throw, while the current default policy has no `staleHeartbeatMs` field.

    As written, the plan does not name a test that starts a fresh process with a persisted fresh heartbeat, a non-resumable backend, and a fake backend start counter, then proves the scheduler neither fabricates a fresh in-memory heartbeat nor starts a duplicate attempt and later transitions only after an explicit stale policy is exceeded. If `staleHeartbeatMs` is absent, the plan does not define whether the run is deliberately left running, blocked as missing policy, or handled some other way.

    Fix: add or expand a B-### recovery behavior for fresh heartbeat + non-resumable backend. It should assert zero `backend.start` calls, no new attempt, no fabricated heartbeat from empty memory, an explicit return/diagnostic state while fresh, and a defined outcome when `staleHeartbeatMs` is absent or when persisted heartbeat age later exceeds the configured threshold.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "Shared-worktree mutable concurrency guard is design-only, not separately testable"
  plan_refs: plan.md:187-195, plan.md:373-383, plan.md:450, plan.md:459
  code_refs: lib/durable-runtime/file-store.ts:29-33, lib/durable-runtime/types.ts:51-68, lib/driver/backends/orchestration-adapter.ts:26-38
  description: |
    B-012's concrete setup uses fake pending handles and checks only the numeric cap/default. It includes one expected clause about not enabling concurrent mutable shared-worktree steps, but the named test and mutation row only require active-count failures. A worker could satisfy B-012 with two non-mutating fake handles while still allowing `maxParallelSteps: 2` to run two committing backends in the default shared worktree.

    The current store default is `worktree: { mode: "shared" }`, and existing backend capabilities include `canCommit: true` adapters. The architecture boundary explicitly forbids parallel mutable execution without an explicit worktree policy, so this cannot remain only design prose.

    Fix: add a distinct behavior or make B-012's named test cover shared-worktree mutable work. Use two independent ready steps, `maxParallelSteps: 2`, and backend capabilities such as `canCommit: true`/not explicitly safe; assert the scheduler caps effective concurrency to one or blocks with a diagnostic. Also include the positive isolated/non-mutating case if the plan wants to permit parallelism there.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "RunGraph duplicates mutable StepRecord state across graph.json and step.json"
  plan_refs: plan.md:251-254, plan.md:279-288, plan.md:360-365, plan.md:406-408
  code_refs: lib/durable-runtime/types.ts:140-152, lib/durable-runtime/file-store.ts:77-78, lib/durable-runtime/file-store.ts:193-203, missions/architecture/durable-orchestration-runtime.md:519-525
  description: |
    The proposed `RunGraph` stores `steps: StepRecord[]`, while the existing store separately persists each mutable `StepRecord` under `steps/<stepId>/step.json`. `StepRecord` contains mutable scheduler state today (`status`, `result`, `latestAttemptId`) and the plan adds `lease`/`heartbeat`/`retryPolicy`, so this creates two persisted sources for correctness-critical fields.

    The recovery algorithm says persisted `step.json` records override graph-embedded mutable fields, but also says graph definitions provide missing steps. If `graph.json` contains stale terminal/running state and `step.json` is missing/corrupt, a worker must infer whether to trust graph state, default it, or block. That ambiguity directly affects no-duplicate recovery and stale detection.

    Fix: make the graph contract explicitly topological/immutable, or state that all mutable `StepRecord` fields embedded in `graph.json` are ignored/defaulted during recovery and that missing/conflicting `step.json` records are diagnosed before execution. The behavior tests should include a conflicting graph-vs-step record case.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "Scheduler backend registry erases backend-specific input contracts"
  plan_refs: plan.md:297-306, plan.md:317-322, plan.md:436-438
  code_refs: lib/durable-runtime/backends.ts:16-23, lib/durable-runtime/backends.ts:25-38, lib/durable-runtime/backends.ts:41-53, lib/driver/backends/types.ts:8-17, lib/driver/backends/orchestration-adapter.ts:64-79, lib/driver/backends/orchestration-adapter.ts:91-107
  description: |
    The proposed scheduler API accepts `ReadonlyMap<KnownBackendName, OrchestrationBackend<unknown, unknown>>` plus `inputForStep` returning `unknown`. The actual Drive orchestration adapter implements `OrchestrationBackend<BackendInvocation, BackendRunResult>`, and `BackendInvocation` requires `runId`, `promptPath`, `workdir`, `projectRoot`, `taskId`, `parentSessionId`, `planSlug`, and `eventSink`. Its `start` path passes the prepared input directly to `backend.run(prepared.input)`.

    If Plan 3 is meant to compose existing backend adapters without changing Drive invocation semantics, the erased `unknown` input boundary is unsafe: scheduler code can prepare/start a Drive adapter with an arbitrary value that does not satisfy `BackendInvocation`. If Plan 3 intentionally supports only fake/generic StepResult-producing backends and leaves Drive adapter invocation to Plan 4, the plan should make that boundary explicit.

    Fix: either type the scheduler registration around backend-specific input resolvers, or state that Drive adapters are not registered with the Plan-3 scheduler until Plan 4 supplies a `BackendInvocation` builder. Add a contract test that would fail if a Drive adapter can be started without its required invocation fields.

- id: PR-006
  dimension: quality-contract
  severity: low
  title: "Quality Contract binding notes name concrete runnable commands"
  plan_refs: plan.md:453-464
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:43-57, package.json:28-35
  description: |
    The Quality Contract table uses the required abstract gate columns, but the binding notes immediately below it name concrete commands (`bun run test`, `bun run lint`, `bun run typecheck`, and a concrete artifact-check command). The work-artifact gate contract says generic artifact references must not name project tools, runnable commands, or project-specific bindings.

    Fix: remove the concrete command sentence from `plan.md` or move it to non-contract local task instructions. Keep the plan's threshold as project-native correctness evidence and leave the concrete binding to project configuration or implementation-task verification notes.

## Missing Coverage

- `RunGraphSchedulerOptions.signal` and the design's "cancelled by signal" exit path have no B-### behavior proving backend cancellation, lease release/preservation, attempt evidence, and run/step terminal status. Add a behavior for signal cancellation or remove `signal` from the Plan-3 public contract.
- B-004 names `tests/durable-runtime/graph-scheduler.test.ts`, but the Files to Change entry for that file lists only B-003 and B-013. Add B-004 to that file ownership line or move the lease test to a separately listed test file.
- Current pre-implementation test files for B-001 through B-013 do not exist yet, so exact marker presence in executable tests cannot be mechanically verified until implementation. The plan does define all 13 behavior entries with Source, Context, Action, Expected, Seam, Test, and Marker fields under `tests/durable-runtime/`.

## Assessment

The plan is viable with revisions. I verified the current durable-runtime types do not yet define `StepLease`, `StepHeartbeat`, `RetryPolicy`, `SchedulerState`, or `RunGraph`; the existing `RunStatus`/`StepStatus` unions exclude `queued`, `waiting`, and `leased`; `FileRunStore` already has the stated graph/scheduler scaffolds, terminal run monotonicity guard, atomic/path-safe writes, and attempt listing behavior; and `DriveStepProjector` is not a scheduler. The most important issue to fix first is the unproven committed-backend crash window before terminal attempt evidence is persisted.

## Re-Review (verification pass)

Verdict: REVIEW-CLEAN. The reviewer-resolution changes genuinely address PR-001 through PR-006 and the missing-coverage items; I found no remaining or newly introduced substantive findings.

Re-verified:

- PR-001: B-014, the crash-recovery algorithm, event/store write order, and `RunPolicy.retryPotentiallyCommittedSteps` now block a stale/nonterminal `running` step with `canCommit: true`, `canResume: false`, and no persisted terminal latest-attempt result. B-014's fake commit counter is explicitly performed before `BackendHandle.result` settlement and before terminal attempt storage, so the named test targets the crash-after-commit-before-terminal-evidence window. Current Drive capabilities match the plan: `claude-cli` and `cosmonauts-subagent` are `canCommit: true`; `codex` is `canCommit: false`.
- PR-002: B-015 now separately specifies fresh externally owned non-resumable recovery with zero `prepare`/`start` calls, no new attempt, no fabricated heartbeat/lease, and `exitReason: "waiting_for_fresh_external_work"`; absent `staleHeartbeatMs` leaves the step running because staleness cannot be inferred.
- PR-003: B-016 plus revised B-012 make shared-worktree mutable concurrency testable: committing shared-worktree backends are capped/diagnosed to sequential, while isolated non-committing fake backends are the positive parallel case.
- PR-004: `RunGraph` is now immutable/topological (`RunGraphStep[]`) and `step.json` is the sole mutable authority. `ReadRunGraphResult { graph, diagnostics }` is consistent with the existing `FileRunStore.createRun` scaffold of `graph.json` as `{ steps: [], edges: [] }`; empty existing scaffolds have no migration problem. B-017 covers graph-vs-step conflicts and B-018 blocks missing/corrupt step records before execution.
- PR-005: `RunGraphSchedulerBackend = OrchestrationBackend<SchedulerStepInput, StepResult>` is not assignable from the current Drive adapter type `OrchestrationBackend<BackendInvocation, BackendRunResult>`. I verified this with a temporary TypeScript assignability check: the assignment fails, and an `@ts-expect-error` guard is consumed. Deferring Drive registration and the `BackendInvocation` builder to Plan 4 is coherent.
- PR-006: the Quality Contract no longer names concrete runnable commands; it remains an ordered abstract gate ladder with binding/degradation states.
- Missing coverage: B-019 defines signal cancellation evidence and unsupported-cancellation preservation; `tests/durable-runtime/graph-scheduler.test.ts` now explicitly owns B-003, B-004, and B-013.
- Whole-plan checks: all 20 behavior entries have Source, Context, Action, Expected, Seam, root-relative Test, and exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers in the plan; executable marker presence remains the post-implementation artifact-conformance gate. The revised plan preserves current `RunStatus`/`StepStatus` unions, does not introduce `queued`/`waiting`/`leased`, avoids daemon/distributed/Drive-compiler/chain-compiler/worktree-merge/mutating-controller scope creep, and keeps recovery/safety and cancellation before bounded parallelism in the implementation order.