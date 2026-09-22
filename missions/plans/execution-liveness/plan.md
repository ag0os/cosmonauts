---
title: 'Execution Liveness: bounded, fenced, diagnosable node attempts'
status: active
createdAt: '2026-09-11T13:24:20.117Z'
updatedAt: '2026-09-22T18:19:30.075Z'
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
of a backend or host adapter that cannot do so stops the slice rather than
shrinking its population or weakening a policy meaning.

The two formerly required human decisions are final: on 2026-09-22 the human
selected H-001 option 1, with INV-002 amended in `spec.md`, and accepted H-002's
four-hour default. No product decision remains open. `## Human Decisions
Required` is retained as the ruling record.

## Architecture Context

This plan implements part of `missions/architecture/orchestration-future.md`.
It is subordinate to the ratified Intent, cited as INV-001, INV-002, INV-003,
INV-004, INV-005, INV-006, and INV-007 without replacing that source text.
Relevant architecture decisions are:

- `orchestration-future.md D-001`: converge in-scope durable populations on one
  graph execution substrate while naming current migration exceptions.
- `orchestration-future.md D-007`: liveness is universal for node attempts. Its
  older optional-hard-timeout wording must be synchronized with the amended
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
  contracts, an injected host clock, an injected owner probe, an injected
  backend-control port, the in-process watchdog/reconciler, and `RunStore`.
- Backends execute one attempt, publish a start-time control identity before
  project-mutating work, emit useful-activity/evidence signals, and settle owned
  processes or sessions. They never decide whether a result is current or which
  graph work becomes runnable.
- The store owns conditional authority/deadline checks, external-effect intent
  and receipts, and cross-process critical sections. `scheduler.json` is
  reconstructible cache, never authority.
- Drive supplies an injected compatibility projector and attempt-effect adapter;
  durable-runtime does not import Driver, task, Git, CLI, or Pi infrastructure.
- Process-local maps, timers, coordinator context, and live backend handles are
  caches over persisted attempt/control records. Missing cache state is handled
  through the persisted control port or produces a conservative
  unavailable/unconfirmed outcome, never a fabricated success.
- A backend, clock, process-control, or filesystem-lock adapter that cannot
  support the resolved contract refuses launch visibly; it never substitutes a
  backend or weakens policy meanings.

Current exceptions remain explicit: coordinator-bearing chains still use the
inline runner; standalone interactive `spawn_agent` is out of scope; the spawn
graph compiler still has no production caller; and Drive retains its task and
finalizer policy. This slice reaches an exception only when it is a registered
descendant of an in-scope durable attempt.

Structural analysis for `lib/durable-runtime`, `lib/driver`,
`lib/orchestration`, `lib/config`, and `cli/run` was requested. Complexity,
duplication, boundary-conformance, and trace remain unbound with
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

- **D-002 — Four-hour framework default**
  - Decision: `14_400_000 ms` (four hours) when neither project policy nor an
    applicable frontend ceiling supplies a smaller bound.
  - Alternatives: thirty minutes; two hours; another finite value selected by
    the human.
  - Why: Repository evidence rejects treating thirty minutes as universally
    safe but does not statistically select four hours. Four hours is the human's
    explicit risk-tolerance choice with unknown false-stop and diagnosis-delay
    rates (`review-2.md PR-009`; `review-3.md PR-010`).
  - Decided by: human, 2026-09-22 (H-002; proposed by the planner)

- **D-003 — Freeze a baseline and preserve independent frontend ceilings**
  - Decision: Resolve and persist the project liveness baseline once. Existing
    Chain `timeoutMs` remains a whole-chain wall-clock budget. Each Chain step
    also has the project/default per-attempt ceiling and stops at the earlier
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
    bounded acquisition, explicit release uncertainty, and safe completed-owner
    reclamation. Raw lifecycle writes are removed from the scheduler-facing
    store interface and retained only as private initialization/recovery
    primitives inside the file store.
  - Alternatives: unlocked compatibility writers; a second unrelated lock; a
    database.
  - Why: This is the smallest shared critical-section boundary, while the raw
    writer restriction closes the bypass identified by `review-2.md PR-005` and
    `review-3.md PR-005`.
  - Decided by: planner-proposed

- **D-007 — Epoch-aware conservative clock reconstruction (superseded in part)**
  - Decision: Persist wall, monotonic, and monotonic-epoch samples. Compare
    monotonic values only within the same declared epoch. The former design
    permitted a per-process epoch and classified every positive wall gap on an
    epoch mismatch as host-unavailable.
  - Alternatives: compare process-relative values across restart; reset
    elapsed; count every wall gap as idle.
  - Why: The former rule gave fresh processes a deterministic fallback but
    conflated observer replacement with host suspension (`review-2.md PR-006`;
    `review-3.md PR-006`).
  - Decided by: planner-proposed
  - Superseded by: D-015 replaces process epochs with a host-active continuity
    epoch plus separate observer identity; D-020 defines hard-ceiling ordering.

- **D-008 — Observation-only repair premise (superseded in part)**
  - Decision: Normalized status/watch may conditionally reconcile overdue
    deadlines and lapsed owners before rendering, but the earlier plan treated
    this only as idempotent repair and required a separately chosen authority to
    prove the time bound.
  - Alternatives: strictly read-only observation; observation as an accepted
    first-opportunity authority; an independently available service.
  - Why: This entry exposed the availability contradiction found by
    `review-2.md PR-002` and `review-3.md PR-002` instead of silently weakening
    the then-ratified INV-002.
  - Decided by: planner-proposed
  - Superseded by: D-013 replaces the premise that another authority is required;
    under amended INV-002, status/watch are valid first-opportunity
    reconciliation triggers without promising action while no framework process
    can run.

- **D-009 — Thirty-second settlement grace**
  - Decision: Once a framework process durably wins a stop request, allow 30
    seconds for backend settlement and all descendants. Acknowledgement is not
    settlement. Expiry blocks and closes authority; late completion is rejected
    evidence. Caller cancellation uses the same settlement protocol.
  - Alternatives: acknowledgement; five-minute grace; unbounded waiting.
  - Why: Thirty seconds exceeds current process-group TERM/KILL grace while
    remaining bounded. Existing Drive launcher exits must not pre-empt this state
    machine (`review-2.md PR-004`; `review-3.md PR-004`).
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
  - Decision: Update `orchestration-future.md` D-007 and its universal envelope
    to the amended INV-002 and four-hour default before runtime code. If the
    synchronization is disputed, stop.
  - Alternatives: silent supersession; implement stale optional wording.
  - Why: The architecture record must not contradict the ratified source.
  - Decided by: human, 2026-09-21 (`ruling-packet.md` Q1 and ratified spec),
    clarified by human H-001/H-002 on 2026-09-22

- **D-012 — Early Chain identity is part of launch**
  - Decision: Durable Chain launch returns a start handle containing `runId`
    before awaiting completion. CLI prints it immediately; the tool publishes it
    through progress updates. Final results reuse the same ID.
  - Alternatives: infer from run listing; return identity only on completion.
  - Why: A hung Chain otherwise cannot be correlated safely with status/watch
    (`review-2.md PR-007`; `review-3.md PR-007`).
  - Decided by: planner-proposed

- **D-013 — First-opportunity enforcement and accepted default**
  - Decision: Use H-001 option 1. Each running process uses an in-process
    scheduler watchdog; every scheduler tick, `run status`, `run watch`, resume,
    and new invocation acting on the same run reconciles persisted deadlines
    before other work; every authoritative store promotion is fenced by the
    persisted absolute deadline. If no framework process can run, no transition
    is promised, but work and results after the deadline cannot later be
    promoted and the unavailable gap never counts as idle. No external
    enforcement service is in scope. The fallback hard ceiling is the H-002
    value `14_400_000 ms`.
  - Alternatives: an independently available enforcement service; supervisor-
    restricted launches; retaining a literal transition while no process can
    execute; another default duration.
  - Why: This is the exact human amendment to INV-002 and accepts the smallest
    architecture that preserves INV-001, INV-003, and INV-005 without claiming
    impossible local availability.
  - Decided by: human, 2026-09-22
  - Supersedes: D-008's planner-proposed unresolved-authority premise, the former
    deliberately incomplete Design §5, and the former H-002 gate around D-002.

- **D-014 — Backend execution starts with durable stop identity**
  - Decision: Replace the result-only Driver `Backend.run()` boundary with a
    start boundary that exposes completion, settlement, local stop, and a
    persistable control descriptor. Durable backend start receives a
    registration callback and must persist its exact control before releasing
    prompts or other project-mutating work. CLI children publish exact
    host/boot/process-start/process-group identity immediately; Pi publishes its
    session and owning-process identity. A fresh reconciler uses an injected
    `BackendControlPort`, never a reconstructed live object or stored argv.
  - Alternatives: keep `Backend.run()` and infer PIDs on completion; rely only on
    `AbortSignal`; record every fresh-process dispatch unavailable.
  - Why: The current result promises and private PID make B-001/B-009
    unreachable for CLI work; a two-phase start and persisted descriptor fit the
    repository's scheduler/backend layers without inventing remote Pi APIs
    (`review-4.md PR-001`).
  - Decided by: planner-proposed
  - Supersedes: the former Design §§5–6 assumption that `BackendHandle` alone
    exposed a live or reconstructible control after start.

- **D-015 — Host continuity and observer identity are separate**
  - Decision: A clock sample carries a host/boot continuity epoch, a host-active
    monotonic value comparable across processes in that epoch, and a separate
    observer invocation identity. Changing CLI processes never implies
    suspension. One real epoch change records one continuity-unknown interval,
    seeds the new epoch, and cannot be repeated to erase later active silence. A
    host adapter unable to provide that contract refuses a managed launch.
  - Alternatives: per-process epochs; count every cross-process gap as suspended;
    count every gap as idle.
  - Why: Current detached Drive and every status call use different processes;
    the former rule could postpone enforced idle until the hard ceiling
    (`review-4.md PR-002`).
  - Decided by: planner-proposed
  - Supersedes: the per-process-epoch and every-mismatch-is-suspension portions
    of D-007 and former Design §4.

- **D-016 — Stop provenance survives dispatch and terminalization**
  - Decision: Store immutable stop intent (`requestId`, reason, request time,
    grace end) separately from an append-only dispatch record. Requested,
    settled, and unconfirmed states all retain both. Add an authority- and
    request-checked dispatch-result transition. A retry uses the same request ID;
    terminal records never discard why, where, or when stopping was attempted.
  - Alternatives: replace requested with terse terminal variants; infer dispatch
    from settlement; write dispatch outcome outside the store.
  - Why: The former variants and store API could neither close `pending`
    dispatch nor satisfy terminal diagnostics and INV-007
    (`review-4.md PR-003`).
  - Decided by: planner-proposed
  - Supersedes: the former `AttemptStopState` variants in Design §2 and the
    dispatch-without-transition wording in former Design §7.

- **D-017 — Drive effect commit points are attempt transactions**
  - Decision: Source-ref commits, task-file status publication, and final-state
    ref commits receive attempt authority plus an `AttemptEffectFence`, not only
    an `AbortSignal`. Expensive preparation is non-authoritative and staged.
    Under the repository/task lock and the same per-step store lock used by
    deadline reconciliation, the store rechecks authority and both hard-ceiling
    proofs immediately before the adapter's single publication point, records an
    exact effect intent, executes that bounded publication, and records an
    idempotent receipt before release. Git uses a temporary index plus
    `commit-tree` and a compare-and-swap `update-ref`; task status uses a prepared
    atomic file replacement. A fresh process resolves an intent from exact
    expected/candidate evidence and never reruns it after the deadline.
  - Alternatives: another pre-check; trust `AbortSignal`; hold only the repository
    lock; weaken B-006/AC-007.
  - Why: The concrete effect owners currently have no authority or store port,
    leaving a check-to-write race. The commit point must share the deadline lock
    rather than consume a reusable permit (`review-4.md PR-004`).
  - Decided by: planner-proposed
  - Supersedes: the former generic claim that a conditional result consumed by
    `shell-command-finalizer.ts` fenced the external mutation.

- **D-018 — Unconfirmed lock release forbids same-process follow-up**
  - Decision: Runtime lock operations return both the committed action result and
    release certainty. After the action settles, the exact lock owner is marked
    release-ready before unlink; a fresh process may reclaim only that completed
    owner even if its PID remains alive. `release-unconfirmed` preserves the
    primary write, clears local timers/handles, performs no projector, dispatch,
    readiness, or finalization follow-up in that process, and requires a fresh
    reconciliation that re-reads authority and any effect receipt.
  - Alternatives: treat release failure as action failure and retry; continue in
    the same process; leave a live-PID lock unreclaimable.
  - Why: Continuing can duplicate a committed transition, while waiting for the
    originating process to die can strand a tool-hosted run
    (`review-4.md PR-004`; `review-4.md Missing Coverage — lock-release
    uncertainty`).
  - Decided by: planner-proposed

- **D-019 — Normalized terminal state drives Drive compatibility**
  - Decision: For liveness-managed Drive runs, normalized first-terminal state is
    authoritative. An injected Drive compatibility projector materializes
    `run.completion.json` and legacy status fields idempotently from that state.
    Projection has persisted pending/applied/failed evidence and is retried by
    later observation or resume without changing the terminal outcome. Legacy
    Drive status consults normalized state first, and resume never clears a
    completion or retries a finalizer after foreign reconciliation made the run
    terminal.
  - Alternatives: require the detached owner to write completion; let normalized
    and compatibility surfaces diverge; make durable-runtime import Driver.
  - Why: A fresh status process can terminalize while the detached owner is gone;
    compatibility must converge from persisted authority rather than an
    owner-local finally block (`review-4.md Missing Coverage — Drive
    compatibility after foreign reconciliation`).
  - Decided by: planner-proposed

- **D-020 — Either trusted hard-ceiling proof fences promotion**
  - Decision: Persist non-decreasing observed-wall high water and hard elapsed.
    Within one host epoch, hard elapsed advances by the greater non-negative wall
    or host-active delta, so suspension and backward wall movement cannot extend
    the ceiling. A promotion is due when either wall high water reaches the
    absolute deadline or hard elapsed reaches the selected duration. A backward
    wall move across an incomparable host epoch stops conservatively as
    clock-continuity-uncertain rather than fabricating remaining time. Hard
    fencing is evaluated before idle or owner-lapse outcomes.
  - Alternatives: wall deadline only; monotonic elapsed only; let wall rollback
    postpone enforcement.
  - Why: The former design named both values but did not say which won when they
    disagreed (`review-4.md PR-002`; `review-4.md Missing Coverage —
    monotonic-versus-wall ceiling ordering`).
  - Decided by: planner-proposed

- **D-021 — Cancelling an observer does not cancel reconciliation intent**
  - Decision: CLI/tool cancellation stops only that status/watch caller's
    remaining grace wait. Any stop intent, dispatch evidence, or terminal write
    already committed remains authoritative; no hidden background task is
    promised, and the next trigger resumes from persisted state and the original
    grace.
  - Alternatives: ignore the observer signal; undo the stop; continue an
    untracked background wait.
  - Why: Registered run-control tools already receive an `AbortSignal`; using it
    for caller latency without rolling back durable state gives cancellation an
    exact outcome (`review-4.md Missing Coverage — grace-waiting observation`).
  - Decided by: planner-proposed

## Human Decisions Required

This section is retained as the decision record. Both decisions are resolved;
neither is an implementation gate.

### H-001 — Enforcement while no local execution authority can run

`review-2.md PR-002` and `review-3.md PR-002` established that the repository's
foreground Chain owner and detached Drive step process do not survive every
owner crash, event-loop stall, or host suspension. The human considered three
directions: amend to first-opportunity enforcement, add an independently
available service, or restrict launches to a proved supervisor.

**Ruling: first-opportunity enforcement** (human, 2026-09-22). INV-002 in
`spec.md` is amended accordingly. Enforcement is owed at the first opportunity
any framework process has to act on the run; while none can, the absolute
deadline fences every later promotion and the gap is never counted as idle. The
implementation seam is the in-process scheduler watchdog plus
reconcile-on-regain. No external enforcement service is in scope.

### H-002 — Framework default

**Ruling: four hours, `14_400_000 ms`** (human, 2026-09-22). The evidence and
uncertainty remain recorded in D-002.

## Behaviors

### B-001 — Launch exposes identity and bounded attempts end

- Source: AC-001, AC-002
- Observer: an operator or coordinator starting a durable Chain or Drive run
- Entry point: `cosmonauts run chain`, `cosmonauts run drive`, `chain_run`, or
  `run_driver`, followed through normalized status/watch
- Outcome: launch exposes the exact run identity before waiting; a running
  framework process enforces a due hard ceiling in either idle mode and a due
  idle deadline in `enforce`, while after framework unavailability the first
  scheduler tick, status/watch request, resume, or new invocation acting on the
  run does so. From the absolute hard deadline onward no work or result is
  promoted, the unavailable gap adds no idle time, one logical stop request is
  visible, and the reconciling process reaches a durable terminal or blocked
  result within the fixed cancellation grace; repeated enforcement neither
  requests another logical stop nor rewrites the outcome

### B-002 — Shadow idle crossing is visible and non-cancelling

- Source: AC-003
- Observer: an operator or coordinator following a silent attempt
- Entry point: `cosmonauts run status`, `cosmonauts run watch`, `run_status`, or
  `run_watch`
- Outcome: at the first framework opportunity after each shadow idle crossing,
  one durable would-have-cancelled decision appears while the attempt remains
  eligible to continue until useful activity, normal completion, or hard-ceiling
  enforcement; polling adds no duplicate decision, and no work or result after
  the absolute ceiling is accepted even if no process was running at the moment
  it passed

### B-003 — Useful work and proof of life differ

- Source: AC-004
- Observer: an operator comparing active and heartbeat-only attempts
- Entry point: normalized status/watch for a Chain or Drive run
- Outcome: normalized useful activity starts a new idle window, ownership
  renewal changes only proof of life, an active attempt survives repeated idle
  windows, and a heartbeat-only attempt reaches its configured shadow or
  enforce outcome at the next scheduler/reconciliation opportunity after enough
  host-active silence

### B-004 — Host unavailability does not become false idle

- Source: AC-005, AC-009
- Observer: an operator resuming or observing work after host suspension
- Entry point: the original durable Chain/Drive invocation or normalized
  status/watch for that run
- Outcome: detected host-unavailable time is reported and excluded from idle
  elapsed time; before the hard ceiling, the same exact current authority resumes
  rather than creating a replacement attempt, while at or after the ceiling its
  promotion authority is fenced and the first framework action reconciles it to
  deadline stop/settlement instead of resuming work

### B-005 — Project policy and composed ceilings are inspectable

- Source: AC-006
- Observer: a project operator starting and inspecting a durable run
- Entry point: `.cosmonauts/config.json` through either Chain/Drive CLI or tool,
  then normalized status
- Outcome: config selects idle mode, idle window, and the run's hard-ceiling
  baseline without new CLI flags; omitted members use sourced defaults including
  the four-hour hard ceiling, invalid members refuse launch naming the key, and
  status shows the frozen baseline, every Chain/Drive upper bound, the effective
  absolute deadline, and each source

### B-006 — Drive's task cap remains an upper bound

- Source: AC-007
- Observer: an operator running a Drive task with an explicit or default cap
- Entry point: `cosmonauts run drive` or `run_driver`, observed through the
  result and normalized status/watch
- Outcome: a Drive task's promotion authority closes at the earlier of its task
  cap and configured baseline; a running watchdog enforces that point, or the
  first later framework action reconciles it. From that absolute deadline onward
  late backend work cannot promote a result, task transition, source commit,
  final-state commit, finalizer readiness, or Drive-owned lifecycle event

### B-007 — Obsolete results remain evidence only

- Source: AC-008
- Observer: an operator inspecting a run after obsolete completion
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: full late completion is retained with attempt identity and rejection
  reason and never becomes the step result. If its store write first discovers
  an overdue current attempt, only deadline reconciliation may advance; the
  completion does not determine that outcome. For an already terminal step or
  run, canonical result, terminal timestamp, output references, downstream
  readiness, and terminal status remain byte-for-byte unchanged

### B-008 — A foreign observer resolves lapsed ownership safely

- Source: AC-010
- Observer: an operator or coordinator observing an attempt that stopped renewing
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: deadline/grace reconciliation runs first; a past-ceiling owner is
  fenced and stopped even if alive. Otherwise the exact alive owner remains
  current and is shown expired-but-held, a dead owner blocks with identity and
  reason, and an uncheckable owner is shown in one-lease grace then blocks; no
  row starts replacement work, and the run finalizes when nothing can become
  runnable

### B-009 — Stop completion includes descendants

- Source: AC-011
- Observer: an operator whose attempt or nested child does not stop promptly
- Entry point: a durable Chain or Drive invocation with registered nested Chain
  or spawned-agent descendants, followed through normalized status/watch
- Outcome: once a framework action wins a stop request, the attempt becomes
  terminal only after backend and every descendant settle; otherwise fixed grace
  expiry blocks the attempt, disables same-run retry, and directs the operator
  to a replacement run. If the reconciling process disappears during grace, the
  next framework action uses the persisted original grace and blocks immediately
  when it has already expired

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
  numbers are unique, deadline reconciliation yields one logical stop request,
  order is strictly increasing, and a follower advancing by the returned cursor
  neither skips nor rereads an event

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
the hard default is `14_400_000 ms`. Durations are positive safe integers.
Wrong shape, unknown mode, non-integer, zero, negative, or unsafe values refuse
launch and name the exact config key. Partial config is valid.

Composition is fixed:

| Population | Attempt baseline | Independent bound | Effective deadline |
|---|---|---|---|
| Durable Chain step | project config → four-hour framework default | existing whole-chain `timeoutMs` from chain start | earlier absolute deadline |
| Drive task | project config → four-hour framework default | explicit `taskTimeoutMs` → existing 30-minute default | earlier absolute deadline |
| Drive finalizer | project config → four-hour framework default | none | baseline deadline |

The existing Chain input remains global. Compilation persists chain start, the
global deadline, the attempt baseline, and each effective step deadline. Drive
persists baseline and task-cap candidates in `spec.json`; both CLI/tool policy
writers consume that snapshot. Resumes never re-resolve. Legacy runs without a
snapshot remain observable as `legacy-liveness-unmanaged`, but mutating resume
is refused rather than fabricating authority.

### 2. Attempt, stop, control, and effect state

```ts
interface AttemptAuthority {
  readonly attemptId: string;
  readonly ownerToken: string;
}

interface AttemptOwnerIdentity {
  readonly hostId: string;
  readonly bootId: string;
  readonly processId: number;
  readonly processStartedAt: string;
  readonly invocationId: string;
}

interface StopIntent {
  readonly requestId: string;
  readonly reason: "hard-ceiling" | "idle-deadline" | "caller";
  readonly trigger?: "wall-deadline" | "hard-elapsed" | "clock-continuity-uncertain";
  readonly requestedAt: string;
  readonly graceEndsAt: string;
}

interface StopDispatchAttempt {
  readonly attemptedAt: string;
  readonly targetId: string;
  readonly outcome: "delivered" | "already-delivered" | "unavailable" | "failed";
  readonly detail?: string;
}

interface StopDispatchRecord {
  readonly status: "pending" | "delivered" | "unavailable";
  readonly attempts: readonly StopDispatchAttempt[];
}

type AttemptStopState =
  | { readonly kind: "none" }
  | { readonly kind: "requested"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord }
  | { readonly kind: "settled"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord; readonly settledAt: string; readonly via: "result" | "backend-equivalent" }
  | { readonly kind: "unconfirmed"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord; readonly blockedAt: string; readonly reason: string };

type BackendControlDescriptor =
  | { readonly kind: "posix-process-group"; readonly targetId: string; readonly hostId: string; readonly bootId: string; readonly groupId: number; readonly leader: ProcessIdentity }
  | { readonly kind: "direct-process"; readonly targetId: string; readonly identity: ProcessIdentity }
  | { readonly kind: "pi-session"; readonly targetId: string; readonly sessionId: string; readonly owner: AttemptOwnerIdentity };

interface ProcessIdentity {
  readonly hostId: string;
  readonly bootId: string;
  readonly processId: number;
  readonly startedAt: string;
}

type AttemptEffectKind = "drive-source-commit" | "drive-task-status" | "drive-state-commit";

interface AttemptEffectIntent {
  readonly effectId: string;
  readonly kind: AttemptEffectKind;
  readonly authority: AttemptAuthority;
  readonly intendedAt: string;
  readonly expectedExternalState: unknown;
  readonly candidateExternalState: unknown;
}
```

An attempt persists policy/deadline candidates, a permanent deadline fence,
proof of life, useful activity, non-decreasing hard/idle elapsed, wall high
water, clock samples, host-unavailable/continuity-unknown intervals, lease,
stop state, backend controls, descendants, shadow episode, effect
intents/receipts, session reference, and immutable result evidence. Secrets such
as `ownerToken` never enter status output.

A claim atomically increments a persisted attempt counter and installs current
authority before preparation. A second authorization immediately before backend
start refuses if the deadline became due. A deadline fence permanently closes
work promotion, renewal, activity, descendant launch, new effect intent, result,
readiness, and finalization. Stop/dispatch/settlement, descendant settlement,
exact effect-intent recovery, rejected evidence, diagnostics, compatibility
projection, and terminalization remain legal because they close or explain work.

Normal result mapping remains: pre-stop accepted completion uses the backend
result; preparation/start failure becomes failed; caller stop plus confirmed
settlement becomes cancelled; deadline/clock stop plus confirmed settlement
becomes failed with its cause; unconfirmed stop becomes blocked. First terminal
state is absorbing.

### 3. Two-phase backend start and reconstructible stop control

The durable backend contract is:

```ts
interface BackendStartContext {
  registerControl(control: BackendControlDescriptor): Promise<ConditionalAttemptResult<BackendControlDescriptor>>;
  registerDescendant(control: BackendControlDescriptor): Promise<ConditionalAttemptResult<AttemptDescendantRecord>>;
}

interface BackendHandle<Result = unknown> {
  readonly control: BackendControlDescriptor;
  readonly completion: Promise<BackendCompletion<Result>>;
  readonly settlement: Promise<BackendSettlement>;
  requestStop(request: StopIntent): Promise<StopDispatchOutcome>;
}

interface BackendControlPort {
  requestStop(control: BackendControlDescriptor, request: StopIntent): Promise<StopDispatchOutcome>;
  inspectSettlement(control: BackendControlDescriptor): Promise<BackendSettlementProbe>;
}
```

`OrchestrationBackend.start(prepared, startContext)` may not release the prompt,
start a finalizer effect, or return a usable handle until `registerControl`
applies. A rejected registration reaps/disposes the newly created process or
session and returns start failure. Drive's lower `Backend.run()` becomes
`Backend.start(invocation, startContext): Promise<BackendExecution>`; the
execution exposes the same four facts instead of only a result promise.

CLI adapters split `runCliBackendProcess` into start and completion. They spawn a
framework-created detached group with prompt input held, read exact leader start
identity, persist the group descriptor, and only then release input. Direct
child completion and whole-group settlement are separate promises. Preflight,
postflight, and other spawned commands use the same controlled-process primitive
and register as descendants before receiving project-controlled command input.

Pi already exposes `session.sessionId` and `session.abort()`/idle settlement. The
spawner gains a start form while existing `spawn()` remains a compatibility
wrapper over its completion: create session, persist session/owner identity,
then prompt. A same-process stop invokes `session.abort()` and waits for idle. A
fresh process does not invent a remote Pi attach API: it observes the durable
request, probes exact owner identity, dispatches any persisted process controls,
and records Pi dispatch unavailable while a live inaccessible session remains;
settlement then either arrives or grace ends blocked.

The fresh-process `BackendControlPort` validates host, boot, PID start identity,
and framework-created group ownership before signaling. It never executes
persisted argv, scripts, hooks, or project-controlled paths. Repeating transport
after a crash uses the same `requestId`; an already-gone exact target is settled,
not an error. A target mismatch is unavailable/uncheckable, never permission to
signal a reused PID.

### 4. Store-owned transitions, effect commit points, and lock outcomes

The scheduler-facing `RunStore` exposes reads plus conditional lifecycle
operations. In addition to claim, authorization, renewal, activity, clock,
shadow, owner, descendant, settlement, block, and run-finalization operations,
it includes these previously missing transitions:

```ts
interface RunStore {
  registerStepBackendControl(input: RegisterBackendControlInput): Promise<ConditionalAttemptResult<BackendControlDescriptor>>;
  requestStepStop(input: RequestStepStopInput): Promise<ConditionalAttemptResult<AttemptStopRecord>>;
  recordStepStopDispatch(input: RecordStopDispatchInput): Promise<ConditionalAttemptResult<AttemptStopRecord>>;
  commitStepEffect<T>(input: CommitStepEffectInput, publish: () => Promise<ExternalEffectReceipt<T>>): Promise<CommitStepEffectResult<T>>;
  resolveStepEffect(input: ResolveStepEffectInput): Promise<ConditionalAttemptResult<AttemptEffectRecord>>;
  settleStepAttempt(input: SettleStepAttemptInput): Promise<SettleAttemptResult>;
  finalizeRun(input: FinalizeRunInput): Promise<FinalizeRunResult>;
  recordCompatibilityProjection(input: CompatibilityProjectionInput): Promise<ConditionalRunResult>;
}

type LockReleaseState =
  | { readonly kind: "confirmed" }
  | { readonly kind: "unconfirmed"; readonly lockOwnerId: string; readonly recoveryMarker: string };

type StoreMutationResult<T> =
  | { readonly kind: "applied"; readonly value: T; readonly lockRelease: LockReleaseState }
  | { readonly kind: "rejected"; readonly reason: AttemptMutationRejection; readonly lockRelease: LockReleaseState };
```

Every lock-backed result carries release certainty, including rejections. The
caller may perform follow-up only for `confirmed`. For `unconfirmed`, the action
result stands and is never retried in that process. The exact lock owner writes a
release-ready marker only after the awaited critical-section action has ended;
a later process may reclaim only a matching release-ready owner, re-read the
primary record, and continue. Status reports the uncertainty until recovery
consumes it. No state transition assumes an unlink succeeded merely because the
action returned.

The file store receives the trusted clock. Under the per-step lock, every
promotion re-reads authority and terminal state, folds the new clock sample,
and applies D-020 before writing. A due attempt atomically records/reuses its
permanent fence and one stop intent. A completion may be retained as full
rejected evidence and prove settlement, but never becomes canonical.

`commitStepEffect` is not a pre-check. The Drive adapter first stages all
non-authoritative work. It then acquires the repository lock where applicable,
passes an exact intent and one bounded publication callback, and the store:

1. acquires the step lock in repository-lock → step-lock → event-lock order;
2. re-reads authority, terminal, existing effect, stop, and deadline state;
3. returns an existing receipt idempotently or rejects before publication;
4. persists the intent containing expected and candidate external state;
5. samples the clock again and invokes the one publication point only if still
   authorized; and
6. records the receipt or exact unconfirmed evidence before releasing the step
   lock.

Git preparation uses a temporary index, `write-tree`, and `commit-tree`; only a
compare-and-swap `update-ref` publishes the candidate commit. No real index
mutation or project hook is the commit point. Task status prepares serialized
bytes and a temp file; only the atomic replacement runs inside the fence, and
episode capture follows an accepted receipt. If a process disappears after
intent, recovery compares exact old/candidate ref or content digests: candidate
means record the receipt once, old means absent (and it may be retried only if
still before the deadline), any third state blocks as effect-outcome-unconfirmed.
An unresolved effect prevents step settlement.

Activity clears the shadow marker atomically. Clock progress never accepts lower
elapsed/high-water values. Descendant operations key on authority and target ID.
`finalizeRun` takes expected run state and first terminal cause and returns
applied/already-terminal/still-runnable. Event allocation re-reads the persisted
tail under its lock, assigns one sequence, appends a complete envelope, then
updates caches; malformed tails block writes.

`updateRun`, `writeStepRecord`, `writeStepAttemptRecord`, and direct event append
are removed from scheduler, scheduler-state, Drive projectors, backend adapters,
and finalizers. File-store initialization/recovery retains private equivalents.
`lib/driver/durable-steps.ts` becomes a compatibility consumer of accepted
conditional transitions. `run-start.ts` forwards the complete interface without
fail-soft omission.

### 5. Host clock, observer identity, and hard/idle accounting

```ts
interface ClockObserverIdentity {
  readonly invocationId: string;
  readonly processId: number;
  readonly processStartedAt: string;
}

interface ClockSample {
  readonly wallTimeMs: number;
  readonly hostActiveTimeMs: number;
  readonly hostEpoch: string;
  readonly observer: ClockObserverIdentity;
}

interface LivenessClock {
  sample(): ClockSample;
}
```

`hostEpoch` names the host/boot comparability domain; `observer` says who took a
sample and never controls comparability. The platform adapter must provide a
host-active monotonic source that excludes suspension and is comparable across
processes in one epoch. Process-relative clocks are not accepted for managed
launch. This makes a detached `run-step` sample and any fresh status process
comparable without calling the process change suspension.

For samples in one epoch, `activeDelta` contributes to idle elapsed and the
positive excess of wall delta over active delta is host-unavailable. Hard
elapsed advances by `max(nonNegativeWallDelta, nonNegativeActiveDelta)`, so it
includes suspension and survives backward wall movement. Wall high water never
decreases. Useful activity resets accumulated idle only through an
accepted-authority transition; observer polling does not.

At a real epoch change, one continuity-unknown interval is recorded. A
non-negative wall delta advances hard elapsed but contributes no idle; the new
sample then becomes the baseline. Later fresh observers in that same epoch
advance from it, so repeatedly invoking status cannot repeatedly exclude the
same active silence. A negative wall delta across incomparable epochs cannot
prove remaining hard time and conservatively wins a stop with
`clock-continuity-uncertain`. An existing deadline fence is never undone.

A hard ceiling is due if either wall high water reaches `deadlineAt` or hard
elapsed reaches the selected duration. The check happens before enforced idle,
caller stop, owner lapse, renewal, activity, result, or effect publication. Hard
reason wins when already due under the lock.

Useful activity includes Pi output/tool/turn/compaction progress, Drive backend
output/verification, and finalizer preparation progress. Renewal, owner probing,
status polling, replay, compatibility projection, and synthetic heartbeat are
not useful. Every producer presents attempt authority.

### 6. Deadline reconciliation, dispatch, and settlement

D-013 uses one reconciler with local drivers:

- A live scheduler watchdog wakes for the next hard deadline, enforced-idle
  deadline, grace end, or lease check. A wake-up only causes a persisted re-read.
- Scheduler tick, status, watch, resume, and a new invocation acting on the same
  run invoke the same reconciler before other lifecycle work.
- Every conditional promotion remains a last-line deadline gate.

The trigger outcomes remain:

| Trigger | Before | Due current-attempt outcome |
|---|---|---|
| Watchdog/scheduler tick | renewal, activity, readiness, claim | fence, create/reuse stop intent, dispatch through local handle/persisted controls, settle or block by original grace |
| `run status` / `run_status` | snapshot | same reconciliation; never starts work; may wait through remaining grace |
| `run watch` / `run_watch` | event page | same reconciliation; new sequenced events appear once after cursor |
| Resume | task/workdir repair, claim, backend/finalizer action | reconcile old attempt; never create a same-run replacement |
| New invocation acting on that run | first claim/backend/finalizer action | seed a new run's watchdog or reconcile an opened existing run |

A new unrelated run does not scan other runs. `deadline-past` or
`lock-release-unconfirmed` never lets a caller continue its intended write.

The store creates immutable stop intent once. The current owner first uses its
live handle. A fresh process calls `BackendControlPort` for each persisted
control and records every dispatch outcome with `recordStepStopDispatch`. A
crash between external delivery and the record may repeat transport with the
same request ID; it cannot create a second logical stop. Unavailable delivery is
not settlement. Reconciliation polls completion/settlement and descendants until
the original grace end, then blocks. A later trigger never restarts grace.

Race order is exact:

1. A normal result or start failure whose conditional transition wins before
   stop and before either hard proof terminalizes normally.
2. Under the step lock, a due hard ceiling wins before caller or idle stop;
   otherwise the first stop fixes intent permanently.
3. A post-intent completion is rejected evidence and may prove settlement.
4. Settlement requires backend result/equivalent plus every registered
   descendant and every effect intent resolved.
5. Grace expiry writes blocked `stop-unconfirmed`, preserving complete intent
   and dispatch history.
6. Drive launcher reaping may assist exact registered controls but cannot erase,
   pre-empt, or replace the persisted protocol.

Cancelling a grace-waiting status/watch caller stops its wait promptly. It does
not undo any committed transition and does not create an untracked background
reconciler; the next trigger continues from the same request and grace.

### 7. Descendant ownership and backend adapters

An attempt-context registry binds Pi session IDs, nested run IDs, controlled
processes, and finalizer commands to attempt authority. Parent registration
occurs before prompt. Spawned children and nested chains are persisted before
launch. Parent stop propagates one logical request ID. `SpawnTracker` remains
completion-message delivery state; it does not establish execution settlement.

Drive's orchestration handle owns an attempt-local controller immediately, so a
local stop covers preflight, backend, postflight, and finalizer preparation. The
lower CLI backend publishes its process-group control when it actually starts.
All command helpers publish descendant controls and report whole-tree
settlement. `cosmonauts-subagent` publishes Pi session identity and exposes Pi's
actual abort/idle contract. Unsupported platform process controls are reported
at launch rather than falling back to PID-only signaling.

A fresh process reconstructs only from persisted framework-owned controls. It
never guesses a PID, trusts `run.pid` without start identity, calls private Pi
state, or executes project-controlled command text. Missing safe control records
unavailable dispatch and eventually blocks unless independent exact settlement
evidence arrives.

### 8. Reconciliation state space and exits

Deadline/effect/grace reconciliation runs before owner-lapse probing. Every cell
below has one outcome:

| Rechecked state/input | Conditional outcome |
|---|---|
| promotion before deadline, current authority, stop `none` | apply under lock |
| promotion at/after either hard proof | reject; persist fence and one stop intent |
| same-host/boot fresh observer | compare host-active sample regardless of observer ID |
| first real epoch change with non-negative wall delta | record one unknown interval, advance hard only, seed new epoch |
| later sample in seeded epoch | advance active idle normally |
| epoch change plus backward wall | fence and stop as clock-continuity-uncertain |
| completion first observed due | rejected evidence; settlement evidence only |
| caller/idle stop while hard already due | hard intent wins |
| requested stop; dispatch delivered/unavailable/failed | append outcome under same request; keep original grace |
| requested stop settles with descendants/effects resolved | failed for deadline/clock, cancelled for caller |
| requested stop reaches grace first | blocked `stop-unconfirmed`, full stop provenance retained |
| effect prepared, deadline wins before intent/publication | discard staging; no external publication |
| exact existing effect receipt | return receipt; never repeat publication |
| recovered intent; candidate external state exists | record one receipt, then continue settlement |
| recovered intent; expected old state exists and deadline not due | retry the same effect ID once through the fence |
| recovered intent; expected old state exists and deadline due | mark absent, fence, stop |
| recovered intent; external state is neither expected nor candidate | block effect-outcome-unconfirmed |
| lock release unconfirmed after committed action | no same-process follow-up; fresh reclaim/re-read required |
| lease lapsed, exact owner alive, deadline not due | running expired-but-held; same authority may renew |
| lease lapsed, owner dead | blocked owner-dead |
| lease lapsed, first uncheckable observation | running with one-lease grace |
| lease lapsed, uncheckable after grace | blocked owner-uncheckable |
| normal completion/start failure wins first | backend result/failed |
| terminal step receives lifecycle input | canonical fields unchanged; diagnostic evidence only |
| no step can run | blocked, else failed, else cancelled, else legacy stale |
| terminal run has Drive projection pending/failed | retry projection only; terminal bytes unchanged |
| terminal run receives late owner completion | normalized and compatibility terminal stay unchanged; evidence only |

Shadow crossing is one record per episode and clears on useful activity or
terminal outcome. Lapse clears on valid renewal or terminal outcome. Pending
stop dispatch becomes delivered/unavailable and then settled/unconfirmed.
Effect intent becomes receipt/absent/unconfirmed. Release uncertainty exits only
through fresh exact-owner recovery. Compatibility projection becomes applied or
remains visibly retryable. A deadline fence exits only through terminalization.
No temporary state depends on an in-memory default after restart.

### 9. Drive effect fencing and compatibility convergence

Drive compilation persists liveness candidates and finalizer policy. Both launch
surfaces use the same frozen spec. The old backend-local abandoning timer remains
until every adapter uses the new start/control/settlement contract, then is
removed in the same cutover so two timeout authorities never ship together.

`finalizeDriveSourceCommit`, `transitionDriveTaskStatus`, and
`commitDriveFinalState` receive `{ ref, authority, effectFence, signal }`. Their
current `AbortSignal` remains cancellation assistance, not write authority.
Source/state commit preparation uses framework-controlled Git plumbing and a
temporary index; the branch update is the fenced CAS publication. Task status
preparation occurs through `TaskManager`, while its task-file replacement is the
fenced publication and status episode capture follows the receipt. Finalizer
results/readiness and Driver events derive from receipts. No event, task update,
or commit is accepted merely because a backend promise returned.

New managed pending-finalization evidence includes step/attempt/effect identity.
Resume reconciles normalized state first and can retry only the same unresolved
effect before its deadline. Legacy pending evidence follows the legacy-unmanaged
rule rather than being assigned a new authority.

The normalized run record owns first terminal state and a Drive compatibility
projection state:

```ts
type CompatibilityProjectionState =
  | { readonly kind: "none" }
  | { readonly kind: "pending"; readonly terminalVersion: number }
  | { readonly kind: "applied"; readonly terminalVersion: number; readonly projectedAt: string }
  | { readonly kind: "failed"; readonly terminalVersion: number; readonly reason: string };

interface RunCompatibilityProjector {
  projectTerminal(input: TerminalRunProjectionInput): Promise<CompatibilityProjectionReceipt>;
}
```

`finalizeRun` marks Drive projection pending without changing terminal fields.
The injected Driver projector maps the persisted normalized cause, task counts,
and finalizer receipt to the existing `DriverResult` schema and writes
`run.completion.json` idempotently. Completed maps to completed; blocked to
blocked; cancelled to aborted; failed/stale map to aborted with the normalized
cause unless a persisted finalizer receipt requires `finalization_failed`.
Existing authoritative compatible bytes are retained. A failure is visible and
retryable; it never reopens work.

Normalized status/watch and legacy Drive status consult normalized authority.
Resume invokes reconciliation/projection before dirty-worktree checks,
pending-finalization retry, completion clearing, queue repair, or execution. A
foreign terminal therefore becomes visible even when the detached owner cannot
write its old completion path. A late owner uses the same projector and cannot
overwrite the first result.

### 10. Chain launch, Pi lifecycle, and global-budget preservation

Durable Chain compilation carries the frozen attempt baseline and one absolute
global deadline from existing `timeoutMs`; each step uses the earlier applicable
deadline without resetting that global budget. Inline coordinator paths retain
their existing global semantics.

Durable launch returns `{ runId, completion }` after run creation and before
scheduler wait. CLI emits the ID immediately; `chain_run` emits it through a
progress update. Final output reuses it. The chain backend uses the Pi spawner's
start handle, persists session/owner control before prompt, and feeds Pi activity
and settlement through authority-checked transitions. The existing 200-character
summary transformation remains untouched.

### 11. Operator observation contract

Status/watch rows contain step/attempt identity, owner identity without token,
proof of life, useful activity, policy candidates/sources, selected deadline,
host-unavailable and continuity-unknown intervals, both hard proofs, permanent
fence, complete stop intent/dispatch/grace even after terminalization, backend
controls without secrets, session, descendants, effect state/receipt,
lock-release uncertainty, compatibility projection, and rejected-result
reference. Watch emits sequenced transitions. CLI JSON and tool details share
typed summaries; concise text is orientation only.

Documentation states that observation is a conditional, possibly grace-waiting
reconciliation trigger under amended INV-002, never starts work, honours caller
cancellation as D-021 defines, and makes no promise that anything runs while no
framework process can act.

### 12. Review disposition

Rounds 2–3 remain answered by D-003/D-006/D-007/D-009/D-012/D-013,
B-001–B-012, and the corresponding design sections. Round 4 is answered as
follows:

| Finding | Answer |
|---|---|
| `review-4.md PR-001` | D-014; Design §§2–3, 6–7; concrete lower Driver start and fresh-process control port |
| `review-4.md PR-002` | D-015/D-020; Design §§5 and 8; observer identity no longer defines clock continuity |
| `review-4.md PR-003` | D-016; Design §§2, 4, 6, 8, 11; dispatch transition and terminal provenance |
| `review-4.md PR-004` | D-017; Design §§4 and 9; concrete effect owners receive authority and commit inside the step deadline lock |
| `review-4.md` residual concerns | D-018–D-021; Design §§4–6, 8–9, 11 |

## Files to Change

- `missions/architecture/orchestration-future.md` — synchronize D-007 and the
  universal envelope with amended INV-002 and the accepted default.
- `lib/config/types.ts`, `lib/config/loader.ts`, `lib/config/index.ts`, and new
  `lib/config/liveness.ts` — strict config and sourced baseline resolution.
- `cli/chain-execution.ts` — announce durable run identity early and pass the
  frozen baseline/global budget.
- `cli/run/subcommand.ts` — compose clock/control/projector ports, reconcile
  before status/watch, pass cancellation, and render enriched output.
- `cli/drive/subcommand.ts` — freeze Drive policy, reconcile/project compatibility
  before status or resume mutation, and route managed finalization retries
  through attempt effects.
- `domains/shared/extensions/orchestration/chain-tool.ts` — preserve global
  timeout and publish early run identity.
- `domains/shared/extensions/orchestration/driver-tool.ts` — freeze Drive policy
  and start the new backend contract.
- `domains/shared/extensions/orchestration/run-control-tools.ts` — pass tool
  cancellation and compose conditional reconciliation/control/projection.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — inherit attempt
  context and register actual descendant settlement.
- `lib/durable-runtime/types.ts`, `lib/durable-runtime/backends.ts`, and
  `lib/durable-runtime/index.ts` — policy, authority, host-clock, backend-control,
  stop provenance, effect, compatibility, summary, and conditional-result
  contracts.
- New `lib/durable-runtime/liveness.ts` — pure hard/idle clock folding, deadline,
  lapse, stop/effect race, and terminal-absorption decisions.
- `lib/durable-runtime/file-store.ts` — step/event locks, conditional operations,
  control/dispatch/effect evidence, lock-release outcomes, sequence allocation,
  compatibility state, and absorbing finalization.
- `lib/durable-runtime/scheduler.ts` and `lib/durable-runtime/scheduler-state.ts`
  — watchdog, two-phase backend start, local/fresh stop dispatch, effect/settlement
  drain, readiness, and no raw lifecycle writes.
- `lib/durable-runtime/run-start.ts` — reconcile new/resumed invocations and
  forward the complete store, clock, owner, control, and compatibility ports.
- `lib/durable-runtime/controller.ts` and `lib/durable-runtime/status.ts` —
  cancellable status/watch reconciliation, fresh-process control, compatibility
  projection, and normalized terminal snapshots.
- `lib/entity-file-lock.ts` — outcome-returning release, release-ready exact-owner
  marker, bounded acquisition, and conservative recovery.
- `lib/process/process-group.ts` and new `lib/process/process-identity.ts`,
  `lib/process/host-clock.ts`, and `lib/process/controlled-process.ts` — exact
  process/group identity, cross-process host-active samples, safe fresh-process
  signaling/probing, and start-before-input control registration.
- `lib/orchestration/types.ts`, `lib/orchestration/durable-chain-compiler.ts`,
  `lib/orchestration/durable-chain-runner.ts`, and
  `lib/orchestration/chain-runner.ts` — frozen policy, preserved global budget,
  early start handle, activity, control, and settlement.
- `lib/orchestration/activity-bus.ts`, `lib/orchestration/agent-spawner.ts`,
  `lib/orchestration/session-factory.ts`, new
  `lib/orchestration/attempt-context.ts`, and
  `lib/orchestration/spawn-tracker.ts` — Pi start handle, session control,
  useful activity, descendant truth, and delivery separation.
- `lib/driver/types.ts`, `lib/driver/drive-graph-compiler.ts`,
  `lib/driver/drive-graph-runner.ts`, `lib/driver/run-state.ts`,
  `lib/driver/event-stream.ts`, and `lib/driver/durable-events.ts` — frozen
  policy, attempt/effect identity, normalized-terminal compatibility projection,
  and authority-bound events/completion.
- `lib/driver/drive-scheduler-backend.ts`, `lib/driver/run-one-task.ts`,
  `lib/driver/driver.ts`, and `lib/driver/run-step.ts` — immediate attempt
  controller, controlled descendants, removal of the old timeout race, and
  launcher settlement aligned to the persisted grace.
- `lib/driver/durable-steps.ts` — replace raw compatibility writes with accepted
  conditional transitions and effect receipts.
- `lib/driver/drive-finalization.ts`, `lib/driver/state-commit.ts`,
  `lib/driver/shell-command-finalizer.ts`, and `lib/driver/lock.ts` — thread
  authority/effect fence, stage Git/task mutations, enforce lock order, and
  publish only through fenced commit points.
- `lib/driver/backends/types.ts`, `lib/driver/backends/bun-runtime.ts`,
  `lib/driver/backends/orchestration-adapter.ts`,
  `lib/driver/backends/cli-process.ts`, `lib/driver/backends/codex.ts`,
  `lib/driver/backends/claude-cli.ts`, and
  `lib/driver/backends/cosmonauts-subagent.ts` — replace result-only run with
  start/control/completion/settlement and publish exact control before work.
- `lib/tasks/task-manager.ts` and `lib/tasks/file-system.ts` — prepare Drive task
  status bytes and expose one atomic, effect-fenced publication point while
  retaining normal task-update behavior elsewhere.
- `docs/orchestration.md` — policy composition, early identity, control and
  effect semantics, first-opportunity triggers, mutating observation/cancellation,
  compatibility convergence, replacement-run recovery, availability boundary,
  and follow-up slices.

## Risks

- **R-003 — Architecture ground is stale until synchronized.** Stage 0 updates
  D-007 and the universal envelope. If synchronization is disputed, stop for
  human architecture review.
- **R-004 — A backend may not expose honest control or settlement.** Repair or
  refuse that population. Do not retain `Backend.run()` behind an adapter that
  fabricates a handle; if generalized capability behavior is required, pull the
  relevant AC-014 work forward.
- **R-005 — Direct host-source mutation is not rollback-safe.** Effect fencing
  covers Driver-owned commits/task publication, not arbitrary bytes from an
  unconfirmed backend. A backend that can keep mutating after reported
  settlement must be contained, repaired, or refused.
- **R-006 — Host/process identity and active clocks are platform-sensitive.** PID
  alone, process-relative monotonic time, or an uptime source that counts sleep
  is insufficient. Refuse managed launch where exact identity and a truthful
  host-active clock cannot be established.
- **R-007 — Filesystem locking assumptions may fail.** A failed hard-link/atomic-
  replace capability blocks launch. A release-unconfirmed result may not be
  treated as success-plus-follow-up; inability to create or recover the exact
  release-ready marker stops the slice.
- **R-008 — Write-on-observation changes latency.** Limit mutation to the
  reconciler/projector, expose every transition, and honour caller cancellation
  without rolling back intent. A strictly read-only observer requires separate
  approval, not a silent bypass.
- **R-009 — Clock discontinuity can stop useful work conservatively.** That loss
  is preferable to extending a hard ceiling without evidence. If the platform
  cannot produce D-015 samples, revise the adapter or refuse launch rather than
  count suspension as idle.
- **R-010 — External effect recovery has crash points.** Exact expected/candidate
  evidence and idempotent IDs are mandatory. If Git/task publication cannot be
  reduced to one recoverable point, stop Stage 6; do not substitute a pre-check.
- **R-011 — Legacy runs lack policy/authority snapshots.** They remain observable
  but are not assigned fabricated managed-resume authority; migration requires
  separate ratification.
- **R-012 — Structural analysis is unavailable.** Newly discovered lifecycle,
  task, Git, completion, event, process, or compatibility writers must be routed
  through the named contracts. A parallel authority path blocks completion.
- **R-013 — AC-018 spans changed paths.** Any summary, spawn rejection, unrelated
  Drive policy, or coordinator/harness regression blocks this slice rather than
  being deferred.
- **R-014 — Compatibility projection can fail after normalized terminalization.**
  Keep terminal state absorbing, expose projection failure, and retry only the
  projection. If a legacy surface can still start work or overwrite completion,
  stop the cutover.
- **R-015 — Lock ordering can deadlock effects.** Repository lock → step lock →
  event lock is the only allowed order; task publication must not call back into
  a path that acquires them in reverse. Discovery of a reverse path stops the
  stage for redesign.
- **R-016 — Fresh-process control is a trust boundary.** Only framework-minted,
  exact descriptors may be signaled. Persisted command lines and project files
  are evidence, never execution authority.

## Implementation Order

0. **Ratified-ground synchronization.** Update the architecture record to amended
   INV-002 and the four-hour default; carry D-013 into shared contracts. H-001
   and H-002 remain closed.
1. **Contracts and platform proofs.** Freeze policy composition, D-015/D-020
   clock samples, authority, complete stop provenance, lock outcomes, two-phase
   backend start/control, effect intent/receipt, compatibility projection, and
   early Chain start handle. Prove each current platform/backend can provide its
   declared identity before implementation fans out.
2. **Atomic authority/evidence foundation (B-007, B-011).** Begin with observable
   losing-claim, event-order, raw-writer, obsolete-result, duplicate-stop,
   terminal-rewrite, and release-unconfirmed failures. Harden entity locks and
   implement conditional store transitions, including dispatch and effect state,
   before refactoring callers.
3. **Policy and launch composition (B-001, B-005, B-006).** Establish absent,
   partial, explicit, invalid, four-hour default, Chain-global, Drive-minimum,
   resume, and early-ID outcomes. Wire both CLI/tool frontends while retaining
   the old Drive timer until the backend cutover.
4. **Host clock, activity, renewal, and regain (B-002, B-003, B-004, B-008).**
   Establish same-host fresh-observer, real suspension, reboot/epoch change,
   backward wall, repeated polling, and both-hard-proof outcomes. Implement all
   five reconciliation triggers before owner-lapse handling.
5. **Backend control and settlement (B-001, B-009).** Replace lower Driver
   `Backend.run()`, split CLI process start/completion, add Pi start handles,
   register every process/session before work, implement local and fresh control,
   persist dispatch outcomes, drain descendants/effects, and block on fixed
   grace. Do not alter spawn waiter delivery.
6. **Drive fenced effects and compatibility cutover (B-006, B-007).** Give the
   concrete source commit, task transition, state commit, resume retry, event,
   and completion owners attempt authority. Stage and publish each effect through
   the store lock, add exact crash recovery, make normalized terminal state drive
   legacy completion/status/resume, then remove the old abandoning timer and
   align launcher reaping.
7. **Finalization and operator contract (B-010 plus observation behaviors).**
   Implement concrete no-runnable-work outcomes, complete terminal stop/effect
   rows, lock/projection diagnostics, cancellable grace waits, uniform JSON/tool
   summaries, and replacement-run guidance.
8. **Preservation and slice closure (B-012).** Walk AC-001 through AC-013 and
   AC-018 through every supported Chain/Drive mode and backend, including fresh
   process control, no-process gaps, host suspension versus observer replacement,
   backward clocks, effect crashes, unconfirmed lock release, foreign Drive
   terminalization, cancelled observers, and concurrent watch paging. Confirm
   AC-014 through AC-017 remain explicit follow-ups and no AC-015 delivery change
   landed early.

For code work, every stage begins from an observable failing behavior, adds the
minimum implementation, and then refactors toward these boundaries. Discovery
of a result-only backend, private unpersisted process/session, per-process-only
clock, unfenced external publication, raw lifecycle writer, unrecoverable effect
intent, unsafe lock follow-up, compatibility overwrite, non-atomic transition,
or collision with INV-001 through INV-007 stops the stage and invokes the
deviation protocol.
