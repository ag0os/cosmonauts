---
title: 'Execution Liveness: bounded, fenced, diagnosable node attempts'
status: active
createdAt: '2026-09-11T13:24:20.117Z'
updatedAt: '2026-09-21T21:09:03.927Z'
---

## Overview

This plan is the first independently deliverable implementation slice of the
human-ratified `spec.md`. It covers AC-001 through AC-013 plus the preservation
criterion AC-018, using twelve behavior clusters. AC-018 travels with this slice
because preservation cannot be proved safely after the paths have already
changed (`review-3.md PR-008`). AC-014 through AC-017 remain later slices.

The ownership, deadline, settlement, terminal-absorption, and concurrent-write
rules are one state machine and cannot ship separately. The cut is safe only if
every current production backend can honour the first-slice contract; discovery
of a backend that cannot do so stops the slice rather than shrinking its
population.

Both human decisions the planner halted on were taken on 2026-09-22: H-001
option 1 (INV-002 amended in the spec) and H-002 four hours. See
`## Human Decisions Required` for the record.

## Architecture Context

This plan implements part of `missions/architecture/orchestration-future.md`.
It is subordinate to the ratified Intent, cited as INV-001, INV-002, INV-003,
INV-004, INV-005, INV-006, and INV-007 without replacing that source text.
Relevant architecture decisions are:

- `orchestration-future.md D-001`: converge in-scope durable populations on one
  graph execution substrate while naming current migration exceptions.
- `orchestration-future.md D-007`: liveness is universal for node attempts. Its
  older optional-hard-timeout wording must be synchronized with the later
  ratified spec before implementation.
- `orchestration-future.md D-009`: coordinator host and worker execution remain
  independently selected.
- `orchestration-future.md D-010`: coordinator context is not authoritative run
  state.
- `orchestration-future.md D-011`: capability incompatibility is explicit and
  never causes hidden backend fallback.

Boundary rules:

- Chain and Drive frontends resolve configuration and compile intent. They do
  not claim steps, accept results, allocate event sequence numbers, or write
  lifecycle state directly.
- The durable scheduler depends only on durable-runtime contracts, backend
  contracts, an injected clock, an injected owner probe, an enforcement
  authority selected by H-001, and `RunStore`.
- Backends execute one attempt, emit useful-activity/evidence signals, and
  settle owned processes or sessions. They never decide whether a result is
  current or which graph work becomes runnable.
- The store owns conditional authority checks and cross-process critical
  sections. `scheduler.json` is reconstructible cache, never authority.
- Process-local maps, timers, coordinator context, and backend handles are
  caches over persisted attempt records. Missing cache state is reconstructed
  or produces a conservative blocked/uncheckable outcome.
- A backend or host adapter that cannot support the resolved contract refuses
  launch visibly; it never substitutes a backend or weakens policy meanings.

Current exceptions remain explicit: coordinator-bearing chains still use the
inline runner; standalone interactive `spawn_agent` is out of scope; the spawn
graph compiler still has no production caller; and Drive retains its task and
finalizer policy. This slice reaches an exception only when it is a registered
descendant of an in-scope durable attempt.

Structural analysis for `lib/durable-runtime`, `lib/driver`,
`lib/orchestration`, `lib/config`, and `cli/run` was requested. Complexity,
duplication, boundary-conformance, and trace were unbound with
`execution-not-consented`. The plan therefore makes no mechanical clean-baseline
claim; this absence remains R-012.

## Decision Log

- **D-001 — Slice ownership/ending with preservation**
  - Decision: Deliver AC-001 through AC-013 and AC-018 here. Defer AC-014 and
    AC-016 to capability/evidence completion, AC-015 to spawn delivery after
    bounded settlement, and AC-017 to the Quality Manager proof after AC-016.
  - Alternatives: all eighteen criteria in one plan; ownership/settlement split
    across independently shippable plans; defer AC-018 with the proof slice.
  - Why: Twelve behavior clusters meet the size checkpoint. Splitting the state
    machine exposes unfenced intermediate states; deferring preservation could
    permit this slice to break it (`review-3.md PR-008`).
  - Decided by: planner-proposed

- **D-002 — Four-hour framework default, awaiting human decision H-002**
  - Decision: `14_400_000 ms` (four hours) when neither project policy nor an
    applicable frontend ceiling supplies a smaller bound.
  - Alternatives: thirty minutes; two hours; another finite value selected by
    the human.
  - Why: Repository evidence shows a successful 3m29s Drive task, a coherent
    task falsely stopped by the 30-minute cap, 60- and 120-minute configured
    intervals dominated by host sleep before roughly ten minutes of resumed
    work, and a silent Quality Manager observed for about 45 minutes. This
    evidence rejects treating thirty minutes as universally safe and requires
    suspension-aware accounting; it does **not** statistically select four
    hours. Four hours is an explicit risk-tolerance proposal with unknown
    false-stop and diagnosis-delay rates, not a measured optimum
    (`review-2.md PR-009`; `review-3.md PR-010`).
  - Decided by: human, 2026-09-22 (H-002; proposed by the planner)

- **D-003 — Freeze a baseline and preserve independent frontend ceilings**
  - Decision: Resolve and persist the project liveness baseline once. Existing
    Chain `timeoutMs` remains a whole-chain wall-clock budget. Each Chain step
    also has the project/default per-attempt ceiling, and stops at the earlier
    applicable deadline. Each Drive task keeps its explicit or default task cap
    as an upper bound and also receives the project/default baseline; its
    effective deadline is the earlier bound. Drive finalizers use the baseline.
    Every component and selected source is persisted.
  - Alternatives: reinterpret Chain `timeoutMs` per step; ignore project policy
    for Drive tasks; replace Drive's task cap; maintain two racing timers.
  - Why: The composition lets project config select policy while preserving
    AC-007 and Chain's current global-budget contract (`review-2.md PR-001,
    PR-003`; `review-3.md PR-001, PR-003`).
  - Decided by: planner-proposed

- **D-004 — Stable opaque authority with no same-run transfer**
  - Decision: A locked store claim allocates the next attempt ID, an unguessable
    token, and exact owner identity. The token remains stable for the attempt;
    lapse never transfers it and liveness failure never creates a replacement
    execution in the same run.
  - Alternatives: rotating renewal tokens; takeover after lapse; scheduler-name
    identity only.
  - Why: Stable fencing permits safe owner resumption without opening takeover.
  - Decided by: planner-proposed

- **D-005 — Retain five-minute lease and one-minute renewal**
  - Decision: Keep a five-minute lease, renew once per minute, and use one lease
    as uncheckable-owner grace. Renewal never counts as useful activity.
  - Alternatives: public tuning; shorter intervals; no lease.
  - Why: The values provide four missed-renewal opportunities, bound evidence
    volume, and add no speculative public surface.
  - Decided by: planner-proposed

- **D-006 — Harden and reuse entity-file locks**
  - Decision: Reuse `lib/entity-file-lock.ts` for initialization, per-step
    transitions, and event/run transitions after adding exact owner checks,
    bounded acquisition, and explicit release uncertainty. Raw lifecycle writes
    are removed from the scheduler-facing store interface and retained only as
    private initialization/recovery primitives inside the file store.
  - Alternatives: unlocked compatibility writers; a second lock; a database.
  - Why: This is the smallest shared critical-section boundary, while the raw
    writer restriction closes the bypass identified by `review-2.md PR-005` and
    `review-3.md PR-005`.
  - Decided by: planner-proposed

- **D-007 — Epoch-aware conservative clock reconstruction**
  - Decision: Persist wall, monotonic, and monotonic-epoch samples. Compare
    monotonic values only within the same declared epoch. On epoch mismatch,
    advance hard elapsed by non-negative wall delta, never decrease prior
    elapsed, and classify the positive gap as host-unavailable for idle
    accounting until better durable evidence exists.
  - Alternatives: compare process-relative values across restart; reset
    elapsed; count every wall gap as idle.
  - Why: The contract gives fresh processes a deterministic conservative rule
    instead of inventing a baseline (`review-2.md PR-006`; `review-3.md PR-006`).
  - Decided by: planner-proposed

- **D-008 — Observation may repair but is not the missing enforcement host**
  - Decision: Normalized status/watch may conditionally reconcile overdue
    deadlines and lapsed owners before rendering, but this is idempotent repair,
    not the proof of a time bound. It never starts work. H-001 must choose the
    authority that remains responsible when observation never occurs.
  - Alternatives: strictly read-only observation; claim that observation alone
    enforces the ceiling; an approved continuously available authority.
  - Why: Repair gives operators a reachable convergent view but does not answer
    `review-2.md PR-002` or `review-3.md PR-002` by itself.
  - Decided by: planner-proposed; enforcement portion resolved by H-001
    (human, 2026-09-22): enforcement happens at the first opportunity any
    framework process has to act on the run, and results past the absolute
    deadline are fenced unconditionally

- **D-009 — Thirty-second settlement grace, pending H-001 compatibility**
  - Decision: Once an available authority durably wins a stop request, allow 30
    seconds for backend settlement and all descendants. Acknowledgement is not
    settlement. Expiry blocks and closes authority; late completion is rejected
    evidence. Caller cancellation uses the same settlement protocol.
  - Alternatives: acknowledgement; five-minute grace; unbounded waiting.
  - Why: Thirty seconds exceeds current process-group TERM/KILL grace while
    remaining bounded. Existing Drive launcher exits must be changed not to
    pre-empt this state machine (`review-2.md PR-004`; `review-3.md PR-004`).
  - Decided by: planner-proposed

- **D-010 — Separate execution settlement from message delivery**
  - Decision: Persist descendant running/settled truth independently of
    `SpawnTracker`'s completion-message buffer. This slice uses it for stop and
    settlement only; AC-015 later changes waiter delivery.
  - Alternatives: waiter timeout means child settlement; defer descendant
    ownership.
  - Why: Delivery and execution answer different questions, and the human
    ordering requires the ceiling before waiter changes.
  - Decided by: planner-proposed

- **D-011 — Synchronize architecture before code**
  - Decision: After H-001, update `orchestration-future.md` D-007 and its
    universal envelope so architecture and ratified ground agree. If disputed,
    stop.
  - Alternatives: silent supersession; implement stale optional wording.
  - Why: The architecture record must not contradict the ratified source.
  - Decided by: human, 2026-09-21 (`ruling-packet.md` Q1 and ratified spec)

- **D-012 — Early Chain identity is part of launch**
  - Decision: Durable Chain launch returns a start handle containing `runId`
    before awaiting completion. CLI prints it immediately; the tool publishes it
    through progress updates. Final results reuse the same ID.
  - Alternatives: infer from run listing; return identity only on completion.
  - Why: A hung Chain otherwise cannot be correlated safely with status/watch
    (`review-2.md PR-007`; `review-3.md PR-007`).
  - Decided by: planner-proposed

## Human Decisions Required

### H-001 — Enforcement while no local execution authority can run

`review-2.md PR-002` and `review-3.md PR-002` establish that the repository's
current foreground Chain owner and detached Drive step process do not survive
all owner crashes, event-loop stalls, or host suspension. A local timer plus
write-on-observation therefore cannot prove INV-002. The plan halts here rather
than choosing a weaker interpretation.

The human must select one direction:

1. **Amend the ratified temporal boundary.** Permit a persisted deadline to
   become enforceable at the first framework execution opportunity after local
   unavailability. The implementation would fence every store promotion by the
   absolute deadline, reconcile immediately on regain, and never treat the gap
   as idle. This is the smallest architecture, but it changes ratified ground
   and leaves a diagnosis-delay window while nothing can run.
2. **Require an independently available enforcement service.** Add a supervised
   authority outside the owner process with durable access to run records and
   exact process/descendant controls. Define its availability and failure
   contract, supported hosts, and trust boundary. This preserves the literal
   temporal requirement only to that service's availability bound and expands
   product, deployment, security, and storage scope substantially.
3. **Restrict supported launches to a proved supervisor contract.** Refuse
   liveness-managed execution unless a platform supervisor can persist absolute
   deadlines, fence result promotion, and stop the owned process tree before it
   can resume work. This narrows supported environments and still needs an
   explicit host-outage contract.

**Ruling: option 1** (human, 2026-09-22). INV-002 in `spec.md` is amended
accordingly, with the previous text kept in git. Accepted availability
assumption: enforcement is owed at the first opportunity any framework process
has to act on the run; while none can, the absolute deadline fences every
store promotion, and the gap is never counted as idle. Design §5's seam is the
in-process scheduler plus reconcile-on-regain; no external enforcement
service is in scope.

### H-002 — Framework default

**Ruling: four hours, `14_400_000 ms`** (human, 2026-09-22). The evidence and
uncertainty stay recorded in D-002.

## Behaviors

### B-001 — Launch exposes identity and bounded attempts end

- Source: AC-001, AC-002
- Observer: an operator or coordinator starting a durable Chain or Drive run
- Entry point: `cosmonauts run chain`, `cosmonauts run drive`, `chain_run`, or
  `run_driver`, followed through normalized status/watch
- Outcome: launch exposes the exact run identity before waiting; when an attempt
  reaches its effective hard deadline in either idle mode, or its idle deadline
  in `enforce`, one stop is requested and a durable terminal or blocked result
  is visible within the selected cancellation contract; repeated enforcement
  does not request stop again or rewrite the outcome

### B-002 — Shadow idle crossing is visible and non-cancelling

- Source: AC-003
- Observer: an operator or coordinator following a silent attempt
- Entry point: `cosmonauts run status`, `cosmonauts run watch`, `run_status`, or
  `run_watch`
- Outcome: the first crossing in each shadow idle episode appears as durable
  would-have-cancelled evidence, while the attempt continues until useful
  activity, normal completion, or its hard deadline; polling adds no duplicate
  decision

### B-003 — Useful work and proof of life differ

- Source: AC-004
- Observer: an operator comparing active and heartbeat-only attempts
- Entry point: normalized status/watch for a Chain or Drive run
- Outcome: normalized useful activity starts a new idle window, ownership
  renewal changes only proof of life, an active attempt survives repeated idle
  windows, and a heartbeat-only attempt reaches its configured idle outcome

### B-004 — Host unavailability does not become false idle

- Source: AC-005, AC-009
- Observer: an operator resuming or observing work after host suspension
- Entry point: the original durable Chain/Drive invocation or normalized
  status/watch for that run
- Outcome: detected host-unavailable time is reported and excluded from idle
  elapsed time; if the same exact authority remains current under the H-001
  ruling, it resumes that authority rather than creating a replacement attempt

### B-005 — Project policy and composed ceilings are inspectable

- Source: AC-006
- Observer: a project operator starting and inspecting a durable run
- Entry point: `.cosmonauts/config.json` through either Chain/Drive CLI or tool,
  then normalized status
- Outcome: config selects idle mode, idle window, and the run's hard-ceiling
  baseline without new CLI flags; omitted members use sourced defaults, invalid
  members refuse launch naming the key, and status shows the frozen baseline,
  every Chain/Drive upper bound, the effective deadline, and each source

### B-006 — Drive's task cap remains an upper bound

- Source: AC-007
- Observer: an operator running a Drive task with an explicit or default cap
- Entry point: `cosmonauts run drive` or `run_driver`, observed through the
  result and normalized status/watch
- Outcome: a Drive task ends at the earlier of its task cap and configured
  baseline; after scheduler settlement, late backend work cannot promote a
  result, task transition, source commit, final-state commit, or Drive-owned
  event

### B-007 — Obsolete results remain evidence only

- Source: AC-008
- Observer: an operator inspecting a run after obsolete completion
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: full late completion is retained with attempt identity and rejection
  reason, while step outcome, run outcome, canonical result, terminal timestamp,
  output references, and downstream readiness remain byte-for-byte unchanged

### B-008 — A foreign observer resolves lapsed ownership safely

- Source: AC-010
- Observer: an operator or coordinator observing an attempt that stopped renewing
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: the exact alive owner remains current and is shown expired-but-held;
  a dead owner blocks with identity and reason; an uncheckable owner is shown in
  one-lease grace and blocks after it; no row starts replacement work, and the
  run finalizes when nothing can become runnable

### B-009 — Stop completion includes descendants

- Source: AC-011
- Observer: an operator whose attempt or nested child does not stop promptly
- Entry point: a durable Chain or Drive invocation with registered nested Chain
  or spawned-agent descendants, followed through normalized status/watch
- Outcome: a stop becomes terminal only after backend and every descendant
  settle; otherwise grace expiry blocks the attempt, disables same-run retry,
  and directs the operator to a replacement run

### B-010 — No-runnable-work produces a concrete run outcome

- Source: AC-012
- Observer: an operator following a graph with unreachable dependent work
- Entry point: either durable Chain/Drive CLI or tool, observed through
  normalized status/watch
- Outcome: a blocked reachable step yields a blocked run; otherwise a failed
  reachable step yields a failed run, a cancelled reachable step yields a
  cancelled run, and legacy stale is used only when no higher-priority cause
  exists; dependents are not executed or manually rewritten

### B-011 — Concurrent invocations preserve one authority and event order

- Source: AC-013
- Observer: an operator or follower when two processes touch one run
- Entry point: concurrent Drive resume/reconciliation and normalized watch
  cursor paging
- Outcome: exactly one execution owns a step, attempt IDs and event sequence
  numbers are unique, order is strictly increasing, and a follower advancing by
  the returned cursor neither skips nor rereads an event

### B-012 — Existing non-liveness contracts remain unchanged

- Source: AC-018
- Observer: Chain, spawn, Drive, and coordinator users running existing workflows
- Entry point: the existing Chain CLI/tool, spawned-agent flow, Drive CLI/tool,
  and coordinator-selected harness execution
- Outcome: Chain summaries retain their 200-character contract, spawn depth and
  concurrency rejection are unchanged, Drive task policy outside AC-007 is
  unchanged, and coordinator/harness selection remains neutral

## Design

### 1. Resolved policy and frontend composition

Add a strict config shape and pure resolver at the config boundary:

```ts
interface ProjectLivenessConfig {
  readonly idleMode?: "shadow" | "enforce";
  readonly idleWindowMs?: number;
  readonly hardCeilingMs?: number;
}

type PolicySource =
  | "project-config"
  | "framework-default"
  | "chain-global-explicit"
  | "chain-global-default"
  | "drive-task-explicit"
  | "drive-task-default";

interface SourcedDuration {
  readonly valueMs: number;
  readonly source: PolicySource;
}

interface ResolvedLivenessPolicy {
  readonly idleMode: { readonly value: "shadow" | "enforce"; readonly source: "project-config" | "framework-default" };
  readonly idleWindow: SourcedDuration;
  readonly attemptHardCeiling: SourcedDuration;
  readonly cancellationGraceMs: 30_000;
  readonly leaseDurationMs: 300_000;
  readonly renewalIntervalMs: 60_000;
}

interface EffectiveAttemptDeadline {
  readonly deadlineAt: string;
  readonly selectedBy: "attempt-hard-ceiling" | "chain-global-budget" | "drive-task-cap";
  readonly candidates: readonly SourcedDuration[];
}
```

`idleMode` defaults to shadow; the provisional idle window is fifteen minutes;
the hard default awaits H-002. Durations are positive safe integers. Wrong
shape, unknown mode, non-integer, zero, negative, or unsafe values refuse launch
and name the exact config key. Partial config is valid.

Composition is fixed:

| Population | Attempt baseline | Independent bound | Effective deadline |
|---|---|---|---|
| Durable Chain step | project config → framework default | existing whole-chain `timeoutMs` from chain start | earlier absolute deadline |
| Drive task | project config → framework default | explicit `taskTimeoutMs` → existing 30-minute default | earlier absolute deadline |
| Drive finalizer | project config → framework default | none | baseline deadline |

The existing Chain input remains global. Compilation persists the chain start,
global deadline, attempt baseline, and effective per-step deadline. Drive
persists baseline and task-cap candidates in `spec.json`; both policy writers
consume that snapshot. Resumes never re-resolve. Legacy runs without a snapshot
are observable as `legacy-liveness-unmanaged` but mutating resume is refused.

### 2. Attempt authority and persisted state

```ts
interface AttemptAuthority {
  readonly attemptId: string;
  readonly ownerToken: string;
}

interface AttemptOwnerIdentity {
  readonly hostId: string;
  readonly processId: number;
  readonly processStartedAt: string;
  readonly invocationId: string;
}

type AttemptStopState =
  | { readonly kind: "none" }
  | { readonly kind: "requested"; readonly reason: "hard-ceiling" | "idle-deadline" | "caller"; readonly requestedAt: string; readonly graceEndsAt: string }
  | { readonly kind: "settled"; readonly settledAt: string; readonly via: "result" | "backend-equivalent" }
  | { readonly kind: "unconfirmed"; readonly blockedAt: string };

type OwnerLapseState =
  | { readonly kind: "none" }
  | { readonly kind: "expired-held"; readonly observedAt: string }
  | { readonly kind: "uncheckable"; readonly firstObservedAt: string; readonly graceEndsAt: string; readonly reason: string };
```

The attempt also persists effective policy/deadline candidates, proof of life,
last useful activity, non-decreasing hard elapsed, host-unavailable intervals,
clock samples, lease, stop/lapse state, session reference, descendants, shadow
episode, and immutable result evidence. The step claim atomically increments a
persisted counter and installs current authority before backend start. Recovery
may reconstruct a missing evidence projection from the authoritative step but
never allocate another attempt.

Normal result mapping is explicit: completion accepted before a stop request
uses the backend result; prepare/start failure becomes failed. If a caller stop
wins first, confirmed settlement becomes cancelled. If a deadline stop wins
first, confirmed settlement becomes failed with the deadline cause. Any
unconfirmed stop becomes blocked. First terminal state is absorbing.

### 3. Store-owned transitions and writer disposition

The scheduler-facing `RunStore` exposes reads plus conditional lifecycle
operations only:

```ts
interface RunStore {
  claimStepAttempt(input: ClaimStepAttemptInput): Promise<ClaimAttemptResult>;
  renewStepAttempt(input: RenewStepAttemptInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  recordStepActivity(input: RecordStepActivityInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  recordClockProgress(input: RecordClockProgressInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  markShadowCrossing(input: ShadowCrossingInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  requestStepStop(input: RequestStepStopInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  recordOwnerObservation(input: OwnerObservationInput): Promise<ConditionalAttemptResult<StepAttemptRecord>>;
  registerAttemptDescendant(input: RegisterDescendantInput): Promise<ConditionalAttemptResult<AttemptDescendantRecord>>;
  settleAttemptDescendant(input: SettleDescendantInput): Promise<ConditionalAttemptResult<AttemptDescendantRecord>>;
  settleStepAttempt(input: SettleStepAttemptInput): Promise<SettleAttemptResult>;
  blockStepAttempt(input: BlockStepAttemptInput): Promise<ConditionalAttemptResult<StepRecord>>;
  finalizeRun(input: FinalizeRunInput): Promise<FinalizeRunResult>;
}
```

Activity clears the current shadow marker atomically when useful work advances.
Clock progress never accepts a lower hard-elapsed value. Descendant operations
key on authority plus descendant ID. `finalizeRun` takes the expected current
run state and first terminal cause and returns applied/already-terminal/still-
runnable.

`updateRun`, `writeStepRecord`, `writeStepAttemptRecord`, and direct event append
are no longer available to scheduler, scheduler-state, Drive projectors, or
backend adapters. File-store initialization/recovery may use private equivalents
under the same locks. `lib/driver/durable-steps.ts` routes compatibility
projections through accepted conditional results. `run-start.ts` forwards the
full interface without fail-soft omission.

Lock slots are initialization, one per step, and one run event/finalization
lock. Order is step then event; reverse order is forbidden. Event allocation
re-reads the persisted tail under lock, allocates one unique sequence, appends a
complete envelope, then updates caches. Malformed tails block lifecycle writes
rather than guessing.

### 4. Owner probing and epoch-aware clock

```ts
type OwnerProbeResult =
  | { readonly kind: "alive" }
  | { readonly kind: "dead"; readonly reason: string }
  | { readonly kind: "uncheckable"; readonly reason: string };

interface OwnerProbe {
  current(): Promise<AttemptOwnerIdentity>;
  check(owner: AttemptOwnerIdentity): Promise<OwnerProbeResult>;
}

interface ClockSample {
  readonly wallTimeMs: number;
  readonly monotonicTimeMs: number;
  readonly monotonicEpoch: string;
}

interface LivenessClock {
  sample(): ClockSample;
}
```

The process adapter uses stable host identity and process start time; PID reuse
is dead, another host or unsupported probe is uncheckable, and no
project-controlled code executes. A monotonic epoch identifies the adapter's
actual comparability domain, such as host plus boot identity. Process-relative
clocks use a per-process epoch and are never compared across restart.

Within one epoch, wall-minus-monotonic excess records host-unavailable time. On
epoch mismatch, non-negative wall delta advances hard elapsed and is
conservatively excluded from idle elapsed. Negative wall movement cannot reduce
persisted elapsed. Renewal presents the same authority and owner identity,
changes proof of life only, and may clear a lapse state while authority remains
current.

Useful activity includes Pi output/tool/turn/compaction progress, Drive
verification/backend output, and finalizer progress. Renewal, owner probing,
status polling, replay, and synthetic heartbeat are not useful. Every producer
presents attempt authority.

### 5. Deadline authority, races, and settlement

This section is deliberately incomplete until H-001. The selected authority
must be reachable under the human-approved availability assumption, evaluate
persisted absolute deadlines, and use the conditional operations above. A
process-local scheduler watchdog remains useful but cannot be the sole proof.
Status/watch remains repair, not the sole authority.

Once an authority is available, the race is exact:

1. A backend result or prepare/start failure accepted while stop is `none`
   terminalizes normally.
2. A caller, hard, or enforced-idle stop that atomically changes `none` to
   `requested` wins over later completion; the reason and grace end are fixed.
3. Losing stop requests are no-ops. A completion after the request is settlement
   evidence and maps according to §2; it cannot restore normal success.
4. Settlement requires backend result/equivalent evidence and every registered
   descendant. Acknowledgement alone is insufficient.
5. Grace expiry first writes blocked `stop-unconfirmed`, closes authority, and
   leaves later completion as rejected evidence.
6. Drive launcher TERM/KILL and hard-exit wrappers defer to this persisted
   sequence; they may assist reaping but cannot erase or pre-empt settlement.

```ts
interface BackendCompletion {
  readonly result: StepResult;
  readonly fullEvidence: unknown;
  readonly sessionRef?: string;
}

interface BackendHandle {
  readonly completion: Promise<BackendCompletion>;
  readonly settlement: Promise<{ readonly kind: "result" | "backend-equivalent"; readonly settledAt: string }>;
}
```

Pi settlement means idle plus empty descendant registry; CLI settlement means
direct child and process group gone; finalizer settlement means operation and
descendants returned.

### 6. Descendant ownership

An attempt-context registry binds Pi session IDs to attempt authority. Durable
Chain and Drive Pi adapters register the parent before prompt. Spawned children
are persisted before launch and expose abort/settlement handles. Nested Chain
launches persist child run identity and settlement. Parent stop propagates once
recursively. Missing in-memory handles with persisted running descendants are
unconfirmed, never presumed settled.

`SpawnTracker` retains rejection and completion-message delivery. Its waiter
status is not execution truth. This implements AC-011 without implementing
AC-015 ahead of its ordered slice.

### 7. Reconciliation state space

Deadline/grace reconciliation, under the H-001 ruling, is evaluated before
owner-lapse probing. A deadline-past owner does not remain expired-held merely
because it is alive.

| Rechecked state/input | Conditional outcome |
|---|---|
| owner renewed or attempt ended before stale probe applies | no-op; render current state |
| hard/enforced-idle deadline due and stop is none | one requested stop with fixed grace |
| requested stop settles with all descendants in grace | failed for deadline, cancelled for caller |
| requested stop reaches grace first | blocked stop-unconfirmed |
| lapsed lease, exact owner alive, deadline not due | running expired-held; same authority may renew |
| lapsed lease, owner dead | blocked owner-dead |
| lapsed lease, first uncheckable observation | running with one-lease grace |
| lapsed lease, uncheckable before grace | unchanged with remaining grace |
| lapsed lease, uncheckable after grace | blocked owner-uncheckable |
| normal completion wins before any stop | backend terminal result |
| prepare/start failure wins before any stop | failed |
| any terminal step receives lifecycle input | unchanged; result retained only as rejected evidence where applicable |
| no step is running/ready or can become ready | first run terminal cause: blocked, failed, cancelled, then legacy stale |
| terminal run receives later input | status, result, and timestamp unchanged; diagnostic only |

Shadow crossing is one record per episode and clears on useful activity or
terminal outcome. Lapse clears on valid renewal or terminal outcome. Requested
stop settles or blocks. Every written temporary state therefore has an exit.

### 8. Drive integration and result fencing

Drive compilation persists baseline and task-cap candidates; finalizers carry
the baseline only. Both current policy writers consume the same frozen spec.
The scheduler watchdog and H-001 authority must work for every Drive backend
before the backend-local abandoning timer is removed; old and new abandoning
races never ship together.

Every sink and completion carries attempt authority. Obsolete activity/result
may append evidence but cannot enter the compatibility projector. Finalizers
become runnable only from an accepted task completion. `BackendCapabilities`
declares useful-activity and stop-settlement support for every current adapter;
a contradiction refuses launch. AC-014 later generalizes capability policy.

### 9. Chain launch and global-budget preservation

Durable Chain compilation carries the frozen attempt baseline and an absolute
global deadline from the existing `timeoutMs`. Each step computes the earlier
applicable deadline without resetting the global budget. Inline coordinator
paths retain the same global semantics.

Durable launch returns `{ runId, completion }` after run creation and before
scheduler wait. CLI emits the ID immediately. The registered tool emits it via
its progress callback, allowing exact status/watch correlation while the tool
is still running. Completion and final details reuse the ID.

### 10. Operator observation contract

Status/watch rows contain step/attempt identity, owner identity without token,
proof of life, useful activity, baseline and competing deadline candidates with
sources, selected effective deadline, host-unavailable duration, stop/grace,
session reference, lapse/probe reason, descendants, and rejected-result
reference. Watch emits sequenced liveness transitions. CLI JSON and tool details
share the typed summaries; concise text is orientation only. Documentation says
observation may perform conditional repair and does not present it as the H-001
enforcement authority.

### 11. Review disposition

`review-1.md` is answered as follows: PR-001, PR-002, and PR-004 by the revised
human-ratified spec; PR-003 by D-010 and the slice order; PR-005 by the
provenanced Decision Log; PR-006 by B-001–B-012's behavior shape; PR-007 by the
acceptance mapping and explicit deferrals; PR-008 by §§1–10, especially the
writer disposition in §3; PR-009 by behavior/risk outcomes rather than a Quality
Contract; PR-010 by Architecture Context and D-011; PR-011 by treating the spec
as authoritative; and PR-012 by D-001.

The two fresh reviews are dispositioned as follows:

| Finding | Answer |
|---|---|
| `review-2.md PR-001`; `review-3.md PR-001` | D-003, B-005/B-006, Design §1 |
| `review-2.md PR-002`; `review-3.md PR-002` | H-001 halt, D-008, Design §5, R-001 |
| `review-2.md PR-003`; `review-3.md PR-003` | D-003, Design §§1 and 9 |
| `review-2.md PR-004`; `review-3.md PR-004` | D-009, Design §§2, 5, 7; added Drive owners |
| `review-2.md PR-005`; `review-3.md PR-005` | D-006, Design §3; added compatibility writer |
| `review-2.md PR-006`; `review-3.md PR-006` | D-007, Design §4 |
| `review-2.md PR-007`; `review-3.md PR-007` | D-012, B-001, Design §9 |
| `review-2.md PR-008` | Added durable Chain compiler owner |
| `review-3.md PR-008` | AC-018 moved into this slice as B-012 |
| `review-2.md PR-009`; `review-3.md PR-010` | D-002/H-002 now distinguish evidence from risk choice |
| `review-3.md PR-009` | Added durable Chain compiler owner |
| `review-2.md PR-010`; `review-3.md PR-011` | B-010 names concrete run outcomes |

## Files to Change

- `missions/architecture/orchestration-future.md` — synchronize D-007 after
  H-001.
- `lib/config/types.ts`, `lib/config/loader.ts`, `lib/config/index.ts`, and new
  `lib/config/liveness.ts` — strict config and sourced baseline resolution.
- `cli/chain-execution.ts` — announce durable run identity early and pass the
  frozen baseline/global budget.
- `cli/run/subcommand.ts` — owner/deadline reconciliation and enriched output.
- `cli/drive/subcommand.ts` — persist baseline plus task-cap candidates.
- `domains/shared/extensions/orchestration/chain-tool.ts` — preserve the global
  timeout and publish early run identity.
- `domains/shared/extensions/orchestration/driver-tool.ts` — freeze Drive
  baseline/task cap.
- `domains/shared/extensions/orchestration/run-control-tools.ts` — shared
  reconciliation and summary contract.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — inherit attempt
  context and register actual descendant settlement.
- `lib/durable-runtime/types.ts`, `lib/durable-runtime/backends.ts`, and
  `lib/durable-runtime/index.ts` — policy, authority, clock, descendant,
  completion, summary, and conditional-store contracts.
- New `lib/durable-runtime/liveness.ts` — pure deadline, clock, lapse,
  race-mapping, and terminal-absorption decisions selected after H-001.
- `lib/durable-runtime/file-store.ts` — locked conditional operations, evidence,
  sequence allocation, and absorbing run finalization.
- `lib/durable-runtime/scheduler.ts` and `lib/durable-runtime/scheduler-state.ts`
  — compose authority, activity, stop races, settlement, and readiness without
  raw lifecycle writes.
- `lib/durable-runtime/run-start.ts` — forward the complete store and injected
  clock/probe/enforcement ports.
- `lib/durable-runtime/controller.ts` and `lib/durable-runtime/status.ts` —
  idempotent repair and normalized terminal snapshots.
- `lib/entity-file-lock.ts` and new `lib/process/process-identity.ts` — bounded
  exact-owner locking and process probing.
- `lib/orchestration/types.ts`, `lib/orchestration/durable-chain-compiler.ts`,
  `lib/orchestration/durable-chain-runner.ts`, and
  `lib/orchestration/chain-runner.ts` — frozen attempt baseline, preserved
  global budget, start handle, activity, and settlement.
- `lib/orchestration/activity-bus.ts`, `lib/orchestration/agent-spawner.ts`,
  `lib/orchestration/session-factory.ts`, new
  `lib/orchestration/attempt-context.ts`, and
  `lib/orchestration/spawn-tracker.ts` — useful activity, session settlement,
  descendant truth, and delivery separation.
- `lib/driver/types.ts`, `lib/driver/drive-graph-compiler.ts`,
  `lib/driver/event-stream.ts`, `lib/driver/durable-events.ts`,
  `lib/driver/drive-scheduler-backend.ts`, and
  `lib/driver/drive-graph-runner.ts` — policy composition, authority-bound
  projection, completion, and settlement.
- `lib/driver/run-one-task.ts`, `lib/driver/driver.ts`, and
  `lib/driver/run-step.ts` — preserve the existing cap while routing caller
  cancellation and launcher reaping through persisted settlement.
- `lib/driver/durable-steps.ts` — replace raw compatibility lifecycle writes
  with accepted conditional transitions.
- `lib/driver/shell-command-finalizer.ts` — authority-bound completion and
  descendant settlement.
- `lib/driver/backends/types.ts`, `lib/driver/backends/orchestration-adapter.ts`,
  `lib/driver/backends/cli-process.ts`, `lib/driver/backends/codex.ts`,
  `lib/driver/backends/claude-cli.ts`, and
  `lib/driver/backends/cosmonauts-subagent.ts` — honest capability,
  full-evidence, useful-activity, and process/session settlement envelopes.
- `docs/orchestration.md` — policy composition, early run identity,
  status/watch repair, replacement-run recovery, H-001-selected enforcement,
  and follow-up slices.

## Risks

- **R-001 — INV-002 enforcement authority is unresolved.** H-001 blocks all
  implementation. Pivot only by a human-ratified availability boundary or an
  approved external/supervisor architecture; do not relabel eventual
  observation as bounded enforcement.
- **R-002 — The framework default is unresolved.** H-002 blocks task creation.
  Update D-002 and the resolver only after the human chooses.
- **R-003 — Architecture ground is stale.** If D-011 synchronization is
  disputed after H-001, stop for human architecture review.
- **R-004 — A backend may not settle honestly.** Repair or refuse that
  population; if generalized capability behavior is needed, pull the relevant
  AC-014 work forward rather than ship mixed semantics.
- **R-005 — Direct host-source mutation is not rollback-safe.** Fencing protects
  scheduler-owned promotion, not arbitrary bytes from an unconfirmed process.
  Any backend that reports settlement while it can still mutate must be repaired
  or refused.
- **R-006 — Process identity is platform-sensitive.** Unsupported checks are
  uncheckable, never PID-only alive/dead. Refuse launch where even the current
  process cannot be identified honestly.
- **R-007 — Filesystem locking assumptions may fail on target filesystems.** A
  failed capability probe blocks launch; never continue unlocked.
- **R-008 — Write-on-observation is a compatibility change.** Restrict it to §7,
  make it conditional and visible, and document it. Strictly read-only demand
  requires a separately approved reconciliation entry point.
- **R-009 — Clock providers differ across sleep/reboot.** Epoch mismatch uses
  §4's conservative rule. A provider unable to expose honest comparability
  cannot support enforce mode silently.
- **R-010 — Multi-file crash points can expose partial evidence.** Step state is
  authority and repair is one-way from it. Any crash point that permits two
  owners or obsolete promotion requires a storage-boundary revision.
- **R-011 — Legacy runs lack policy snapshots.** They remain observable but not
  resumable; retroactive migration requires separate ratification.
- **R-012 — Structural analysis is unavailable.** Newly discovered lifecycle
  writers must be added here and routed through conditional store operations; a
  parallel authority path blocks completion.
- **R-013 — AC-018 spans changed paths.** Any summary, spawn rejection, unrelated
  Drive policy, or coordinator/harness regression blocks this slice rather than
  being deferred to AC-017.

## Implementation Order

0. **Human ruling checkpoint.** Resolve H-001 and H-002. Replace the unresolved
   Design §5 seam and amend D-002/D-008 as directed. If either remains open,
   stop; no tasks or code changes are authorized.
1. **Architecture and shared contracts.** Synchronize the architecture record;
   freeze policy composition, clock epochs, authority, store operations, race
   mapping, early Chain start handle, and backend settlement contracts.
2. **Atomic ownership/evidence foundation (B-007, B-011).** Establish observable
   failing cases for losing claims, allocation/order collisions, raw-writer
   bypass, obsolete result, and terminal rewrite; then harden locks and implement
   conditional operations before refactoring callers.
3. **Policy and launch composition (B-001, B-005, B-006).** Establish absent,
   partial, explicit, invalid, Chain-global, Drive-minimum, resume, and early-ID
   outcomes; wire both CLI/tool frontends while retaining the old Drive timer.
4. **Activity, epochs, renewal, and reconciliation (B-002, B-003, B-004,
   B-008).** Implement useful activity, fresh-process epoch mismatch,
   suspension, renewal, and every §7 owner/deadline row through shipped
   observation.
5. **Selected deadline authority and settlement (B-001, B-009).** Implement the
   H-001 authority, one-shot stop, caller/deadline races, descendants, Pi/CLI/
   finalizer settlement, grace blocking, and rejected late completion. Do not
   alter spawn waiter delivery.
6. **Drive cutover (B-006, B-007).** Make all current adapters/finalizers satisfy
   settlement; fence projectors and side effects; only then remove the old
   abandoning timer and align launcher reaping.
7. **Finalization and operator contract (B-010 plus observation behaviors).**
   Implement concrete no-runnable-work outcomes, uniform rows/events, and
   replacement-run guidance.
8. **Preservation and slice closure (B-012).** Walk AC-001 through AC-013 and
   AC-018 through every currently supported Chain/Drive mode and backend,
   including fresh-process reconstruction and concurrent observation. Confirm
   AC-014 through AC-017 remain explicit follow-ups and no AC-015 trial landed
   early.

For code work, each stage begins from an observable failing behavior, adds the
minimum implementation, then refactors toward these boundaries. Discovery of an
unsettleable backend, raw lifecycle writer, non-atomic operation, unsupported
owner probe, or collision with INV-001 through INV-007 stops the stage and uses
the deviation protocol.
