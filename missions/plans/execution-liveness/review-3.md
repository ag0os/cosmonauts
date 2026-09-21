# Plan Review: execution-liveness

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: high
  title: "Drive's default cap makes the configured hard ceiling inert for ordinary Drive tasks"
  plan_refs: B-005, B-006, D-003, Design §1 “Resolved policy and frontend composition”
  code_refs: lib/driver/run-one-task.ts:45-46, cli/drive/subcommand.ts:213-222, domains/shared/extensions/orchestration/driver-tool.ts:179-185, lib/driver/drive-scheduler-backend.ts:227-235
  description: |
    B-005 says `liveness.hardCeilingMs` selects the hard ceiling through either Drive launch surface, but the precedence table gives a Drive task only `explicit taskTimeoutMs → existing 30-minute Drive default`; project config is absent. Both current surfaces make `taskTimeoutMs` optional, and the backend substitutes `DEFAULT_TASK_TIMEOUT_MS` when omitted, so a project can record a two-hour configured ceiling while ordinary Drive tasks still stop at thirty minutes.

    This conflicts with ratified AC-006. AC-007 preserves the task cap, but the spec does not say the built-in fallback outranks an operator's configured value. Reconcile the precedence; if AC-007 is intended to make that fallback unoverrideable, the collision is in ratified acceptance ground and must be escalated rather than resolved by implementation.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "No component enforces the hard ceiling after the owning scheduler stops making progress"
  plan_refs: B-001, B-004, B-008, D-007, D-008, Design §§4, 5, 7, 11
  code_refs: lib/durable-runtime/run-start.ts:102-151, lib/durable-runtime/controller.ts:11-58, lib/orchestration/durable-chain-runner.ts:58-86, lib/driver/run-step.ts:87-132
  description: |
    The proposed watchdog lives in the owning scheduler process, while D-008 explicitly declines an always-on daemon and repairs state only when somebody later invokes status/watch. If that process crashes and nobody observes the run, the persisted attempt remains `running` indefinitely past its ceiling. If the process is alive but its event loop is wedged, Design §7's `alive` probe row preserves `expired-held` forever and never applies the stated ranking that INV-002 wins over INV-004. A host suspended beyond the ceiling has the same timing gap: D-007 advances hard elapsed, but no process can request stop or expire grace while the host is asleep.

    Observation-dependent eventual repair is not ratified INV-002/AC-001's bounded durable outcome. Define an enforcement/reconstruction authority for crash, suspension, and live-but-stalled ownership, or escalate the literal bound in ratified ground; the current design cannot satisfy it.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "The plan changes Chain `timeoutMs` from a whole-chain budget into a per-step budget"
  plan_refs: D-003, Design §1 hard-ceiling precedence, Overview AC-018 deferral
  code_refs: lib/orchestration/types.ts:118-129, domains/shared/extensions/orchestration/chain-tool.ts:111-122, lib/orchestration/chain-runner.ts:55-56, lib/orchestration/chain-runner.ts:248-302, docs/orchestration.md:47-53
  description: |
    The existing contract calls `ChainConfig.timeoutMs` a global safety cap, the tool describes it as a global chain timeout, and the inline runner applies one deadline from `chainStart` across all stages. The plan instead maps that same input to each durable Chain step. A ten-step chain given a thirty-minute timeout could therefore run for roughly five hours rather than thirty minutes.

    This is a public semantic break, not merely a new internal policy field. It also touches ratified AC-018's preservation requirement. Specify how the global chain budget composes with per-attempt ceilings; changing the existing input's meaning requires human approval rather than a later preservation proof.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "The claimed exhaustive state space omits caller cancellation and normal/start completion races"
  plan_refs: Design §2 `AttemptStopState`, Design §5 “Deadline watchdog and settlement”, Design §11 “State-space and exit audit”, Files to Change
  code_refs: lib/durable-runtime/scheduler.ts:1089-1268, lib/driver/driver.ts:174-230, lib/driver/driver.ts:707-711, lib/driver/run-step.ts:20-40
  description: |
    `AttemptStopState.reason` includes `caller`, and the attempt signal is linked to the caller, but only deadline crossings are specified to persist `requested`. The state table has no caller-stop row, ordinary `running → completed/failed` row, or prepare/start-failure row, despite calling itself exhaustive. It does not define what wins when caller cancellation and completion race or whether caller stop receives the same descendant settlement and grace.

    These paths are live today: the scheduler races the caller signal against the result, detached Drive has its own TERM/KILL grace, and `run-step` has a ten-second hard exit. `lib/driver/driver.ts` and `lib/driver/run-step.ts` are not file owners even though they can terminate execution before the proposed thirty-second transition completes. Ratified AC-011/INV-005 apply to a stop, not only a deadline stop; add the missing transitions and owners.

- id: PR-005
  dimension: constraint-ownership
  severity: medium
  title: "The conditional store API leaves required writes and existing lifecycle bypasses unowned"
  plan_refs: Architecture Context boundary rules, Design §§2, 3, 5, 6, 9, Design §12 review-1 PR-008 disposition, Files to Change
  code_refs: lib/durable-runtime/types.ts:299-355, lib/durable-runtime/scheduler-state.ts:32-71, lib/durable-runtime/run-start.ts:418-447, lib/driver/durable-steps.ts:48-113, lib/driver/durable-steps.ts:124-216
  description: |
    The proposed methods own claim, renewal, activity, stop, owner observation, block, and result settlement, but the design also requires atomic shadow-episode marking/clearing, descendant registration/settlement, clock-discontinuity progress, and the first absorbing terminal-run transition. No signatures or result variants own those writes. The current `RunStore` still exposes raw `updateRun`, `writeStepRecord`, `writeStepAttemptRecord`, and `appendEvent`; scheduler-state, the scheduler wrapper, and the Drive compatibility projector use them directly.

    The plan neither removes/narrows those raw methods nor states which callers may retain them. `lib/driver/durable-steps.ts` is an existing lifecycle writer and is absent from Files to Change. Review-1 PR-008 is therefore only partly dispositioned: define every conditional transition and explicitly route or retire every raw writer, or fenced and unfenced lifecycle paths can coexist.

- id: PR-006
  dimension: state-sync
  severity: medium
  title: "Persisted monotonic samples lack an epoch and restart contract"
  plan_refs: Architecture Context reconstruction rule, D-007, Design §4, Implementation Order stage 4
  code_refs: lib/durable-runtime/scheduler.ts:18-31, lib/durable-runtime/run-start.ts:12-28, lib/durable-runtime/types.ts:86-102
  description: |
    The plan persists wall and monotonic samples and tells a fresh process to continue from them, but defines neither a `Clock`/`ClockSample` contract nor the epoch identity and fallback when samples come from another process or a reboot. The current runtime exposes only an ISO-wall `now` callback, and `RunStartOptions` has no clock dependency.

    Process-relative monotonic readings cannot safely be subtracted across an arbitrary restart. Comparing them can fabricate or erase host-unavailable time; discarding them without a specified conservative rule can reset idle or hard elapsed time. Define the exact sample identity and reconstruction outcome needed to preserve ratified AC-005, INV-002, and INV-003.

- id: PR-007
  dimension: user-experience
  severity: medium
  title: "A hanging Chain does not reveal the run identity needed by its status/watch entry point"
  plan_refs: B-001 through B-004, B-007 through B-009, Design §10
  code_refs: cli/chain-execution.ts:54-82, lib/orchestration/durable-chain-runner.ts:58-86, lib/orchestration/durable-chain-runner.ts:92-171, domains/shared/extensions/orchestration/chain-tool.ts:133-218
  description: |
    The durable Chain runner mints `runId` internally and returns it only after `runStart` finishes. The CLI prints the result after that await, and `chain_run` exposes the identity only in final tool details. In the silent/hung case these behaviors target, the operator or coordinator therefore has no exact ID to pass to status/watch.

    `run list --scope chain` can show candidates, but the plan does not define it as a correlation procedure and concurrent chains make newest-run guessing unsafe. Require an early durable run-ID announcement or an exact documented correlation path; otherwise the named behavior entry points are not reliably reachable.

- id: PR-008
  dimension: constraint-ownership
  severity: medium
  title: "Deferring AC-018 postpones preservation until after this slice can already break it"
  plan_refs: Overview AC-014–AC-018 slices, D-001, Design §6, Implementation Order stage 8
  code_refs: lib/orchestration/assistant-text.ts:27-38, lib/orchestration/spawn-tracker.ts:102-132, lib/driver/types.ts:30-58, docs/orchestration.md:47-53
  description: |
    AC-014 through AC-017 have dependency-based follow-up seams: current adapters must satisfy the first-slice contract or R-004 stops shipment; waiter delivery follows the ceiling; complete evidence and the Quality Manager proof follow their prerequisites. AC-018 is different: it is a ratified preservation criterion for the 200-character summary, spawn rejection limits, non-AC-007 Drive policy, and coordinator neutrality, all on paths this plan changes.

    A later “proof/preservation slice” cannot make a regression safe after this slice ships, and the behavior spine carries no AC-018 owner into task decomposition. Carry those preservation outcomes in this slice or obtain a human amendment to AC-018. This finding touches the letter of ratified acceptance ground.

- id: PR-009
  dimension: constraint-ownership
  severity: medium
  title: "Chain policy materialization is assigned to a compiler that has no file owner"
  plan_refs: Design §1 “pass the resolved snapshot into compilation”, Files to Change
  code_refs: lib/orchestration/durable-chain-compiler.ts:14-34, lib/orchestration/durable-chain-compiler.ts:65-157, lib/orchestration/durable-chain-compiler.ts:181-227, lib/orchestration/durable-chain-runner.ts:96-146
  description: |
    Design §1 requires Chain compilation to freeze effective policy onto each step. The current compiler options and emitted `RunGraphStep` contain no policy, but `lib/orchestration/durable-chain-compiler.ts` is absent from Files to Change. Only the frontend, types, and runner are named.

    An isolated worker must therefore expand scope ad hoc, bypass the stated compilation seam, or leave Chain steps without the required snapshot. Add the compiler as an explicit owner or amend the design to name the actual materialization boundary.

- id: PR-010
  dimension: risk-blast-radius
  severity: medium
  title: "Four hours is correctly human-gated but not evidence-derived from completed in-scope work"
  plan_refs: D-002, R-001, Design §1 framework default
  code_refs: knowledge/drive-process-reaping.md:21-28, knowledge/analysis-gate-coverage.md:130-132, missions/reviews/improvements/living-memory-implementation.md:22-29, missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md:27-34
  description: |
    The cited evidence establishes that thirty minutes can be too short and that host sleep must not count as idle, but it does not select four hours over two hours or another finite value. The 3m29s task completed well below thirty minutes; TASK-547 has no completed duration; the 60/120-minute cases spent most wall time asleep and then finished in about ten active minutes; and the 45-minute Quality Manager case was a silent failure, not legitimate completed work. Doubling the longest configured failed interval is a risk-tolerance multiplier, not a measured safety margin.

    D-002 and R-001 do correctly withhold implementation until a human decides, so the gate itself is sound. Present four hours as a policy choice with unknown false-stop and diagnosis-delay rates, or gather representative completed Chain/finalizer durations before describing the exact value as repository-evidenced.

- id: PR-011
  dimension: behavior-spec
  severity: low
  title: "B-010 leaves the terminal result as ‘appropriate’"
  plan_refs: B-010, Design §§9, 11
  code_refs: lib/durable-runtime/scheduler.ts:1310-1385, lib/durable-runtime/status.ts:4-37
  description: |
    B-010 has Source, Observer, Entry point, and Outcome, but “the appropriate durable terminal status” does not identify whether its failed-non-final example ends `failed`, `blocked`, `cancelled`, or `stale`. Design §9 contains a priority order, yet that load-bearing result mapping is absent from the behavior spine that task decomposition preserves.

    State concrete cause-to-run outcomes, including AC-012's failed-non-final case, or explicitly say that any terminal status is acceptable.

## Missing Coverage

- A hard-deadline authority that remains reachable when the owner process crashes, the host is suspended, or an alive owner has a stalled watchdog.
- Exact race outcomes for caller cancellation, backend prepare/start failure, normal completion, deadline stop, descendant settlement, and Drive launcher hard exits.
- Store contracts for shadow episodes, descendant state, clock progress, and first terminal-run absorption, plus dispositions for every raw lifecycle writer.
- A cross-process monotonic epoch/reboot rule and conservative reconstruction behavior.
- An early, unambiguous Chain `runId` handoff to normalized observation.
- First-slice preservation coverage for AC-018.
- Representative completed-duration data for populations receiving the framework default.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared policy precedence with both Drive launch surfaces, Chain `timeoutMs` semantics, compiler inputs, `RunStore`, backend handles, finalizers, and current cancellation adapters.
  findings: PR-001, PR-003, PR-005, PR-009

- dimension: duplication
  status: unchecked
  checked: The duplication capability is unbound (`fallow`, `execution-not-consented`) per `analysis_status`; manual reading was used only for orientation and no capability-backed duplication claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced attempt authority, policy snapshots, raw lifecycle writers, timers, clock samples, descendant handles, late results, and fresh-process reconstruction.
  findings: PR-002, PR-004, PR-005, PR-006

- dimension: risk-blast-radius
  status: checked
  checked: Walked owner crash/suspension, Drive timer replacement, caller abort and launcher exit, Chain timeout compatibility, preservation deferral, backend settlement, and default-duration evidence.
  findings: PR-002, PR-003, PR-004, PR-008, PR-010

- dimension: user-experience
  status: checked
  checked: Walked Chain and Drive launch, config selection, active-run discovery, status/watch, lapsed ownership, blocked replacement, and late-result inspection through shipped commands/tools.
  findings: PR-001, PR-003, PR-007, PR-011

- dimension: behavior-spec
  status: checked
  checked: Verified all eleven entries have Source/Observer/Entry point/Outcome, trace AC-001 through AC-013, and use shipped surfaces; then checked precision, reachability, edge cases, and AC-014 through AC-018 deferral.
  findings: PR-001, PR-007, PR-008, PR-011

- dimension: architecture-record
  status: unchecked
  checked: Textually compared `orchestration-future.md` D-001/D-007/D-009/D-010/D-011, its Boundary Model and universal envelope with the plan. D-011 correctly recognizes the stale optional-timeout wording, but runtime dependency conformance could not be capability-checked because `boundary-conformance` is unbound (`fallow`, `execution-not-consented`) per `analysis_status`.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables, predicted gate bindings, separate QC lists, pre-named test files/titles, and prose assertions.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked hard/idle deadlines, owner lapse, crash/suspension, caller stop, normal/start completion, settlement grace, terminal absorption, descendant drain, and no-runnable-work exits.
  findings: PR-002, PR-004, PR-006

- dimension: constraint-ownership
  status: checked
  checked: Traced Decision Log provenance, prior-review disposition, architecture boundaries, load-bearing design rules, ratified preservation ground, and Files to Change into current writers and composition roots.
  findings: PR-004, PR-005, PR-008, PR-009, PR-011

- dimension: scope-size
  status: checked
  checked: Counted eleven behavior clusters, confirmed the explicit follow-up slices, and assessed the coupled ownership/settlement/concurrency state machine against the at-most-12 guidance.
  findings: none

## Assessment

The plan is structurally much stronger than review-1: the human-ratified Intent is explicit, AC-001 through AC-013 are fully traced, most prior findings are honestly dispositioned, and the four-hour value is properly human-gated. It is not implementation-ready because INV-002 still lacks a process-boundary enforcer; fix that first, then reconcile Drive/Chain timeout semantics and complete the store/file ownership contracts. AC-014 through AC-017 are conditionally safe to defer under the stated stop conditions, but AC-018 preservation is not.
