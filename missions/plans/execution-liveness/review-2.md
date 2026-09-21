# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: high
  title: "Drive's default cap makes the configured hard ceiling inert for Drive tasks"
  plan_refs: B-005, B-006, D-003, Design §1 “Resolved policy and frontend composition”
  code_refs: lib/driver/run-one-task.ts:45-46, cli/drive/subcommand.ts:213-222, domains/shared/extensions/orchestration/driver-tool.ts:179-185, lib/driver/drive-scheduler-backend.ts:227-235
  description: |
    B-005 promises that `liveness.hardCeilingMs` selects the hard ceiling when a run is started through either Drive surface. The precedence table instead gives a Drive task only `explicit taskTimeoutMs → existing 30-minute Drive default`; project config is absent. Because both current Drive surfaces make `taskTimeoutMs` optional and the backend supplies `DEFAULT_TASK_TIMEOUT_MS` when it is omitted, a project can record `liveness.hardCeilingMs = 7_200_000` while every ordinary Drive task still receives 1_800_000 ms.

    That contradicts ratified AC-006's config-selected hard ceiling. AC-007 requires the existing task cap to remain enforced, but the spec also says a default applies when no value is set; it does not make the default outrank an operator's project value. The planner must reconcile the precedence so B-005 and B-006 can both be true. If AC-007 is instead being interpreted to make the built-in Drive default unoverrideable, this is a collision in ratified acceptance ground and must be escalated rather than chosen during implementation.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "The hard ceiling has no process-boundary enforcer after the owning process stops making progress"
  plan_refs: D-007, D-008, B-001, B-004, B-008, Design §§4, 5, 7, 11
  code_refs: lib/durable-runtime/run-start.ts:102-151, lib/durable-runtime/run-start.ts:437-445, lib/durable-runtime/controller.ts:11-58, lib/orchestration/durable-chain-runner.ts:58-86, lib/driver/run-step.ts:87-132
  description: |
    The design places deadline evaluation in the owning scheduler watchdog and explicitly rejects an always-on daemon. After that process crashes, no component runs at the hard ceiling; D-008 can repair the record only if a later human or coordinator invokes status/watch. A run that is never observed therefore remains durably `running` past its ceiling, contrary to ratified INV-002 and AC-001's time bound. Current Chain execution is owned by the foreground invocation, and detached Drive's graph scheduler is owned by `run-step`; neither has another process that survives owner death to enforce the proposed timer.

    Even when an observer does arrive, §7 reconciles only lease expiry. Its `alive` row always preserves `running/expired-held`, with no branch for an already-elapsed hard ceiling, despite the explicit ranking “INV-002 wins over INV-004.” The same gap is exposed by a host suspended beyond the ceiling: D-007 counts the discontinuity toward hard elapsed, but no process can request stop or finish grace while the host is asleep. The planner must define who enforces/reconstructs a deadline across crash, suspension, and a live-but-stalled owner, or escalate the literal wall-time promise in ratified INV-002; observation-dependent eventual repair is not the promised hard bound.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "The plan changes Chain `timeoutMs` from a whole-chain budget into a per-step budget"
  plan_refs: D-003, Design §1 hard-ceiling precedence, Files to Change `lib/orchestration/types.ts`
  code_refs: lib/orchestration/types.ts:118-129, domains/shared/extensions/orchestration/chain-tool.ts:111-122, lib/orchestration/chain-runner.ts:55-56, lib/orchestration/chain-runner.ts:248-302
  description: |
    The existing public contract calls `ChainConfig.timeoutMs` a “Global safety cap,” the `chain_run` tool describes it as a “global chain timeout,” and the inline runner computes one `chainStart + timeoutMs` deadline shared by all stages. The plan maps that same input to every durable Chain step's hard ceiling. A ten-step chain with an explicit 30-minute timeout could consequently run for roughly five hours instead of being bounded to 30 minutes.

    D-003 says the existing input “remains” a frontend input, but does not acknowledge this semantic conversion or preserve a run-level budget alongside the attempt ceiling. This is a user-facing interface break and conflicts with the spec's statement that current Chain policy shape is kept; AC-018's later proof slice does not authorize changing the behavior now. The planner must specify how the global budget and per-attempt hard ceiling compose. Changing the meaning of the existing timeout would touch ratified scope/preservation ground.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "The claimed exhaustive state space omits caller cancellation and ordinary completion"
  plan_refs: Design §2 `AttemptStopState`, Design §5 “Deadline watchdog and settlement”, Design §11 “State-space and exit audit”, Files to Change
  code_refs: lib/durable-runtime/scheduler.ts:1089-1268, lib/driver/driver.ts:174-230, lib/driver/driver.ts:707-711, lib/driver/run-step.ts:20-40
  description: |
    `AttemptStopState.reason` includes `caller`, and §5 links the attempt controller to the caller signal, but only deadline crossings are defined to win `requestStepStop`. The state table has no caller-stop row, no normal `running → completed/failed` result row, and no prepare/start-failure row, while still calling itself exhaustive. It therefore does not say whether a caller abort is first persisted as `requested`, whether it receives the same settlement/descendant grace, or what wins when completion and caller cancellation race.

    This is not hypothetical: the current scheduler races a caller signal against the backend result, while detached Drive also has 2-second/1-second launcher reaping and a 10-second runner hard-exit path. `lib/driver/driver.ts` and `lib/driver/run-step.ts` are not listed as owners even though those paths can terminate execution before the proposed 30-second attempt grace records `settled` or `stop-unconfirmed`. Ratified AC-011/INV-005 apply to a stop, not only deadline stops. Add the missing transitions and exact ownership rather than letting each adapter invent the race semantics.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The conditional store contract still leaves known lifecycle bypasses and unnamed transitions"
  plan_refs: Architecture Context boundary rules, Design §§2, 3, 5, 6, 9, Files to Change, Design §12 disposition of review-1 PR-008
  code_refs: lib/durable-runtime/types.ts:299-355, lib/durable-runtime/scheduler-state.ts:32-71, lib/durable-runtime/run-start.ts:418-447, lib/driver/durable-steps.ts:48-113, lib/driver/durable-steps.ts:124-216
  description: |
    The proposed `RunStore` additions cover claim, renew, activity, stop, owner observation, block, and result settlement, but the design also requires atomic shadow-episode marking/clearing, descendant registration/settlement, persisted clock-discontinuity updates, and an absorbing first terminal run transition. No signatures or result variants own those writes. At the same time, the actual `RunStore` exposes raw `updateRun`, `writeStepRecord`, `writeStepAttemptRecord`, and `appendEvent` operations; the scheduler-state reconciler, scheduler wrapper, and Drive compatibility projector currently use those raw mutations.

    Adding the seven methods without prescribing which raw methods are removed, narrowed to initialization, or hidden from scheduler/backend collaborators does not establish the stated “store owns every conditional authority check” boundary. `lib/driver/durable-steps.ts` is a known lifecycle writer but is absent from Files to Change. This only partially answers review-1 PR-008: the plan must define the remaining state-transition contracts and give every existing writer an explicit disposition, or fenced and unfenced paths can coexist.

- id: PR-006
  dimension: state-sync
  severity: medium
  title: "Persisted clock samples have no epoch contract for fresh-process reconstruction"
  plan_refs: Architecture Context cache/reconstruction rule, D-007, Design §4, Implementation Order stage 4
  code_refs: lib/durable-runtime/scheduler.ts:18-31, lib/durable-runtime/run-start.ts:12-28, lib/durable-runtime/types.ts:86-102
  description: |
    The plan says an injected clock returns wall and monotonic samples, persists them, and lets a fresh process continue from them, but it never defines the clock interface, sample shape, monotonic epoch, or the transition when the epoch is not comparable after process restart or host reboot. The current runtime exposes only an ISO-wall `now?: () => string`, and `runStart` does not currently carry any clock dependency at all.

    A process-relative monotonic value cannot safely be subtracted from a sample written by another process. Treating it as comparable can fabricate or erase host-unavailable time; discarding it without a prescribed conservative rule can reset idle or hard elapsed time. Define the exact `Clock`/`ClockSample` contract and reconstruction outcome so fresh-process behavior protects ratified AC-005, INV-002, and INV-003 rather than leaving the central process-boundary calculation to workers.

- id: PR-007
  dimension: user-experience
  severity: medium
  title: "A hanging Chain does not expose its run identity before the observer needs status/watch"
  plan_refs: B-001 through B-004, B-007 through B-009, Design §10
  code_refs: cli/chain-execution.ts:54-82, lib/orchestration/durable-chain-runner.ts:58-86, lib/orchestration/durable-chain-runner.ts:92-171, domains/shared/extensions/orchestration/chain-tool.ts:133-218
  description: |
    The Chain runner mints its random `runId` internally, awaits the entire durable execution, and only then returns it in `ChainResult`. The CLI prints that result after the await, and `chain_run` places the run identity only in the final tool details. If the attempt is the silent/hung case this plan exists to diagnose, neither initiating surface tells the operator or coordinator which exact run to pass to status/watch.

    `run list --scope chain` can expose candidates, but the plan does not name it as the correlation procedure and concurrent chains make “pick the newest” unsafe. The status/watch behaviors therefore have no reliable reachable handoff from active Chain launch to observation. Require an early durable run-identity announcement or an exact documented discovery/correlation path, with an owning file and observable behavior.

- id: PR-008
  dimension: constraint-ownership
  severity: medium
  title: "Chain policy is assigned to compilation, but the compiler has no file owner"
  plan_refs: Design §1 “The Chain CLI ... pass the resolved snapshot into compilation”, Files to Change
  code_refs: lib/orchestration/durable-chain-compiler.ts:14-34, lib/orchestration/durable-chain-compiler.ts:65-157, lib/orchestration/durable-chain-compiler.ts:181-227, lib/orchestration/durable-chain-runner.ts:96-146
  description: |
    Design §1 explicitly assigns the frozen snapshot to Chain compilation and requires an effective attempt policy on each step. The actual compiler's options and emitted `RunGraphStep` contain no policy, yet `lib/orchestration/durable-chain-compiler.ts` is absent from Files to Change. Only the frontend, durable runner, and orchestration types are listed.

    A worker must therefore either expand file scope ad hoc, bypass compilation and materialize policy somewhere else, or leave Chain steps without the required frozen attempt policy. Add the compiler as an explicit owner or amend the design to name the actual materialization seam; R-011's instruction to discover owners during implementation is not a substitute for exact handoff ownership when this owner is already known.

- id: PR-009
  dimension: risk-blast-radius
  severity: medium
  title: "Four hours is transparently proposed, but not supported as the repository-derived default"
  plan_refs: D-002, R-001, Design §1 default policy
  code_refs: knowledge/drive-process-reaping.md:21-28, knowledge/analysis-gate-coverage.md:87-91, missions/reviews/improvements/living-memory-implementation.md:22-29, missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md:27-34
  description: |
    The evidence supports “30 minutes can be too short” and “host suspension must not be mistaken for idle,” but not the choice of four hours over two or another finite value. The 3m29s run completed well below 30 minutes; TASK-547 proves only that one coherent task exceeded the cap, without a completed duration; the 60- and 120-minute runs spent most of their interval asleep and then completed in about ten active minutes; and the 45-minute Quality Manager observation is a silent failure, not a legitimate completed duration. Doubling the longest configured failed interval is a policy multiplier, not a measured percentile or safety margin.

    The plan is honest that the sample is not representative and correctly blocks implementation pending a human decision. It is not honest, however, to characterize four hours as repository-supported merely because it is twice a configured timeout—especially when the precedence table keeps the 30-minute default for the Drive tasks that provide most of the cited evidence. Present the value to the human as an explicit risk-tolerance choice with unknown false-stop/diagnosis-delay rates, or gather evidence from completed in-scope Chain/finalizer runs before calling it evidence-derived.

- id: PR-010
  dimension: behavior-spec
  severity: low
  title: "B-010 leaves the terminal outcome as ‘appropriate’ instead of observable"
  plan_refs: B-010, Design §9, Design §11
  code_refs: lib/durable-runtime/scheduler.ts:1310-1385, lib/durable-runtime/status.ts:4-37
  description: |
    B-010 has the required Source/Observer/Entry point/Outcome fields, but “the appropriate durable terminal status” does not tell a worker or observer whether the example graph ends `blocked`, `failed`, `cancelled`, or `stale`. Design §9 contains a specific priority order, but that load-bearing result mapping is not carried by the behavior spine.

    Replace the placeholder with concrete cause-to-run outcomes (including the failed-non-final example from AC-012), or explicitly make any terminal status acceptable. Otherwise task decomposition can preserve “terminal” while losing the plan's chosen projection semantics.

## Missing Coverage

- A deadline transition that remains reachable at the promised time when the owner process has crashed, the host is suspended, or an alive owner has passed the hard ceiling without running its watchdog.
- Explicit race outcomes for caller cancellation versus normal completion, backend prepare/start failure, deadline stop, and descendant settlement.
- Exact store operations for shadow-episode evidence, descendant registration/settlement, clock progress, and the first absorbing terminal run transition, plus dispositions for existing raw lifecycle writers.
- A cross-process clock sample identity/epoch rule and a conservative host-reboot/restart outcome.
- An early, unambiguous Chain `runId` handoff to the normalized observation surfaces.
- Representative completed-duration evidence for the populations that would actually receive the four-hour framework default.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared policy precedence with both Drive launch surfaces and current timeout application; compared Chain `timeoutMs`, `RunStore`, backend handle/capability contracts, compiler inputs, and all named production Chain/Drive backend/finalizer seams.
  findings: PR-001, PR-003, PR-005, PR-008

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`). Manual reading confirmed the two policy writers already named by the plan, but no capability-backed project/scope duplication claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced attempt authority, policy snapshots, timers, clock samples, descendant state, late results, raw store writers, and fresh-process reconstruction through persisted records.
  findings: PR-002, PR-004, PR-005, PR-006

- dimension: risk-blast-radius
  status: checked
  checked: Walked owner crash/suspension, Drive timeout replacement, caller abort, obsolete completion, backend settlement, finalizer promotion, legacy resume, and default-duration evidence.
  findings: PR-002, PR-003, PR-004, PR-009

- dimension: user-experience
  status: checked
  checked: Walked Chain and Drive launch, config selection, active-run discovery, status/watch, lapsed ownership, blocked replacement, and late-result inspection from operator/coordinator entry points.
  findings: PR-001, PR-003, PR-007, PR-010

- dimension: behavior-spec
  status: checked
  checked: Verified all eleven behaviors have Source/Observer/Entry point/Outcome fields, trace AC-001 through AC-013, use shipped surfaces, and include material negative outcomes; then checked precision and reachability against current composition roots.
  findings: PR-001, PR-007, PR-010

- dimension: architecture-record
  status: unchecked
  checked: Textually compared `orchestration-future.md` D-001/D-007/D-009/D-010/D-011, its Boundary Model, current exceptions, and universal execution envelope with Architecture Context and D-011. The planned source synchronization is consistent, but runtime dependency-direction conformance could not be capability-checked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`).
  findings: none

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, predicted bindings, separate QC lists, test-file/test-title prescriptions, and authored-prose assertions. The revision carries work-specific quality through behaviors, risks, and implementation order instead.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked hard/idle deadline ranking, owner lapse, host suspension, process loss, caller stop, normal completion, settlement grace, terminal absorption, descendant drain, and no-runnable-work exits against every persisted state and write.
  findings: PR-002, PR-004, PR-006

- dimension: constraint-ownership
  status: checked
  checked: Traced Decision Log provenance, architecture boundaries, every load-bearing design rule, prior-review dispositions, and Files to Change into concrete current writers and composition roots.
  findings: PR-004, PR-005, PR-008, PR-010

- dimension: scope-size
  status: checked
  checked: Counted eleven behavior clusters for AC-001 through AC-013, confirmed the explicit AC-014 through AC-018 follow-up slices, and evaluated the coupled ownership/settlement/concurrency state machine against the at-most-12 guidance.
  findings: none

## Assessment

The revision fully answers review-1 PR-003, PR-005 through PR-007, PR-009 through PR-012, and structurally replaces the human-resolved PR-001/PR-002/PR-004 collisions; review-1 PR-008 is only partially answered because conditional transition contracts and exact owners remain incomplete. The plan is viable with substantial revision, but it is not implementation-ready while the hard ceiling lacks a process-boundary enforcer, Drive config precedence contradicts B-005/AC-006, and D-002 remains unratified. Fix the INV-002 enforcement/reconstruction model first because every later watchdog, owner, and settlement task depends on it.
