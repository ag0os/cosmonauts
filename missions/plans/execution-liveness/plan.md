---
title: 'Execution Liveness: bounded, fenced, diagnosable node attempts'
status: active
createdAt: '2026-09-11T13:24:20.117Z'
updatedAt: '2026-09-22T19:31:24.420Z'
---

## Overview

This plan is the first independently deliverable implementation slice of the
human-ratified `spec.md`. It covers AC-001 through AC-013 plus AC-018, using the
same twelve behavior clusters. AC-018 travels with this slice because
preservation cannot be proved safely after the affected paths ship
(`review-3.md PR-008`). AC-014 through AC-017 remain later slices.

Ownership, deadline, settlement, terminal absorption, event order, and
concurrent writes form one state machine and cannot ship separately. The cut is
safe only if every current production backend can honour the contract. A
backend or host adapter that cannot do so stops the slice rather than shrinking
its population or weakening policy meanings.

The human rulings remain final: first-opportunity enforcement under amended
INV-002 and a four-hour framework default. Review 5 is resolved inside the
existing `missions/architecture/orchestration-future.md` boundary; that record
is not changed by this plan.

## Architecture Context

This plan implements part of `missions/architecture/orchestration-future.md`
and remains subordinate to INV-001 through INV-007 in `spec.md`. Relevant
architecture decisions are:

- D-001: converge in-scope durable populations on one graph substrate while
  keeping current migration exceptions explicit.
- D-007: liveness is a universal node-attempt contract. The newer ratified
  INV-002 and D-013 select a mandatory hard ceiling for this slice without
  changing the architecture record in this revision.
- D-009: coordinator host and worker execution remain independently selected.
- D-010: coordinator context is not authoritative run state.
- D-011: capability incompatibility is explicit and never causes hidden backend
  fallback.

Boundary rules:

- Chain and Drive frontends resolve configuration and compile intent. They do
  not claim steps, accept results, allocate event sequence numbers, or write
  lifecycle state directly.
- The durable scheduler depends only on durable-runtime contracts, backend
  contracts, injected clock/owner/control ports, the in-process
  watchdog/reconciler, and `RunStore`.
- Backends execute one attempt, publish a safe control identity before
  project-controlled work, emit activity/evidence, and settle owned execution.
  They never decide result currency or graph readiness.
- Evidence and persistence own storage-only operations: conditional authority
  and deadline checks, intent/receipt records, sequence allocation, atomic
  lifecycle persistence, and cross-process critical sections. The store never
  imports Driver code or invokes a Driver-supplied publication callback.
- Drive owns preparation and execution of Git/task effects through a store-owned
  effect transaction. The store retains the step lock and writes the fence,
  intent, receipt, or uncertainty; the Driver adapter performs the one external
  publication.
- Drive supplies compatibility, task, Git, and nested-run adapters;
  durable-runtime does not import Driver, task, Git, CLI, or Pi infrastructure.
- Process-local maps, timers, controllers, and live backend handles are caches
  over persisted records. Missing local state is reconstructed conservatively;
  it never authorizes a host-process signal or fabricates settlement.
- An adapter that cannot support the resolved clock, process-control,
  filesystem-lock, or effect contract refuses launch visibly.

Current exceptions remain explicit: coordinator-bearing chains still use the
inline runner; standalone interactive `spawn_agent` is out of scope; the spawn
graph compiler has no production caller; and Drive retains its task/finalizer
policy. This slice reaches an exception only when it is a registered descendant
of an in-scope durable attempt.

## Decision Log

- **D-001 — Slice ownership/ending with preservation**
  - Decision: Deliver AC-001 through AC-013 and AC-018 here. Defer AC-014 and
    AC-016 to capability/evidence completion, AC-015 until after bounded
    settlement, and AC-017 until after AC-016.
  - Alternatives: all eighteen criteria in one plan; split the state machine;
    defer AC-018.
  - Why: Twelve behavior clusters meet the size checkpoint. Splitting the state
    machine exposes unfenced intermediate states; deferring preservation could
    permit this slice to break it (`review-3.md PR-008`).
  - Decided by: planner-proposed

- **D-002 — Four-hour framework default**
  - Decision: Use `14_400_000 ms` when neither project policy nor a smaller
    applicable frontend ceiling supplies a bound.
  - Alternatives: thirty minutes; two hours; another finite value.
  - Why: The repository rejects thirty minutes as universally safe but does not
    statistically select four hours. Four hours is the human's explicit
    risk-tolerance choice (`review-2.md PR-009`; `review-3.md PR-010`).
  - Decided by: human, 2026-09-22 (H-002; proposed by the planner)

- **D-003 — Freeze a baseline and preserve independent frontend ceilings**
  - Decision: Resolve and persist project liveness once. Chain `timeoutMs`
    remains a whole-chain wall budget; every Chain step also receives the
    project/default attempt ceiling and stops at the earlier deadline. Drive
    tasks retain their explicit/default task cap and also receive the baseline;
    finalizers receive the baseline. Persist every candidate and source.
  - Alternatives: reinterpret Chain `timeoutMs` per step; ignore project policy
    for Drive; replace Drive's cap; race independent timers.
  - Why: This satisfies AC-006/AC-007 while preserving Chain's global contract
    (`review-2.md PR-001, PR-003`; `review-3.md PR-001, PR-003`).
  - Decided by: planner-proposed

- **D-004 — Stable opaque authority with no same-run transfer**
  - Decision: A locked claim allocates the next attempt ID, unguessable token,
    and exact owner identity. The token is stable; lapse never transfers it and
    liveness failure never creates replacement execution in the same run.
  - Alternatives: rotating tokens; takeover after lapse; scheduler-name identity.
  - Why: Stable fencing permits owner resumption without violating INV-001.
  - Decided by: planner-proposed

- **D-005 — Retain five-minute lease and one-minute renewal**
  - Decision: Keep a five-minute lease, renew once per minute, and use one lease
    as uncheckable-owner grace. Renewal is never useful activity.
  - Alternatives: public tuning; shorter intervals; no lease.
  - Why: The values provide missed-renewal tolerance without adding public
    surface.
  - Decided by: planner-proposed

- **D-006 — Harden and reuse entity-file locks**
  - Decision: Reuse `lib/entity-file-lock.ts` for run, step, event, and task
    critical sections after exact-owner and bounded-acquisition hardening. Raw
    lifecycle writes remain private initialization/recovery primitives only.
  - Alternatives: unlocked compatibility writers; unrelated locks; a database.
  - Why: This closes the bypass in `review-2.md PR-005` and `review-3.md PR-005`.
  - Decided by: planner-proposed

- **D-007 — Epoch-aware conservative clock reconstruction (superseded in part)**
  - Decision: Persist wall, monotonic, and epoch samples; compare monotonic
    values only within one epoch. The former design used process epochs and
    classified every positive cross-epoch wall gap as unavailable.
  - Alternatives: compare process-relative values; reset elapsed; count every
    wall gap as idle.
  - Why: The former rule conflated observer replacement with suspension
    (`review-2.md PR-006`; `review-3.md PR-006`).
  - Decided by: planner-proposed
  - Superseded by: D-015 replaces process epochs; D-020 defines hard-proof
    ordering.

- **D-008 — Observation-only repair premise (superseded in part)**
  - Decision: The former design allowed status/watch reconciliation but assumed
    a separate authority was required to prove the time bound.
  - Alternatives: strictly read-only observation; observation as
    first-opportunity authority; independent service.
  - Why: This exposed the former availability contradiction.
  - Decided by: planner-proposed
  - Superseded by: D-013 adopts first-opportunity enforcement.

- **D-009 — Thirty-second settlement grace**
  - Decision: Once a stop intent wins, allow 30 seconds for backend and all
    descendants to settle. Acknowledgement is not settlement. Expiry blocks and
    closes authority; caller cancellation uses the same protocol.
  - Alternatives: acknowledgement; five minutes; unbounded waiting.
  - Why: Thirty seconds exceeds current process-group escalation while remaining
    bounded (`review-2.md PR-004`; `review-3.md PR-004`).
  - Decided by: planner-proposed

- **D-010 — Separate execution settlement from message delivery**
  - Decision: Persist descendant running/settled truth separately from
    `SpawnTracker` completion messages. This slice changes settlement only.
  - Alternatives: waiter timeout means child settlement; defer ownership.
  - Why: Delivery and execution answer different questions.
  - Decided by: planner-proposed

- **D-011 — Synchronize architecture before code (superseded)**
  - Decision: The former plan required changing architecture D-007 and its
    universal envelope before runtime code.
  - Alternatives: silent supersession; implement stale wording.
  - Why: It was intended to keep architecture and ratified policy aligned.
  - Decided by: human, 2026-09-21, clarified 2026-09-22
  - Superseded by: D-033 records the current human direction that this revision
    must not edit the architecture record (2026-09-22).

- **D-012 — Early Chain identity is part of launch**
  - Decision: Durable Chain launch returns `{ runId, completion }` before
    awaiting completion. CLI prints it immediately; the tool publishes progress.
  - Alternatives: infer from listing; return identity only on completion.
  - Why: A hung Chain must be correlated safely (`review-2.md PR-007`;
    `review-3.md PR-007`).
  - Decided by: planner-proposed

- **D-013 — First-opportunity enforcement and accepted default**
  - Decision: Each running process uses an in-process watchdog; every scheduler
    tick, status/watch, resume, and invocation acting on the same run reconciles
    persisted deadlines before other work; every promotion is fenced by the
    absolute deadline. No transition is promised while no framework process can
    run, but work/results after the deadline cannot later be promoted and the
    unavailable gap never counts as idle. No external service is in scope. The
    fallback is `14_400_000 ms`.
  - Alternatives: independent service; supervisor-only launches; promise action
    without an executing process; another default.
  - Why: This is the exact human amendment to INV-002.
  - Decided by: human, 2026-09-22
  - Supersedes: D-008's unresolved-authority premise and the former H-002 gate
    (2026-09-22).

- **D-014 — Backend execution starts with durable stop identity (superseded in part)**
  - Decision: Replace result-only backend boundaries with start handles exposing
    completion, settlement, stop, and persisted control. Control registration
    precedes project-mutating work; fresh control never reconstructs argv.
  - Alternatives: infer controls on completion; AbortSignal only; make every
    fresh dispatch unavailable.
  - Why: Current result promises and private PIDs cannot deliver B-001/B-009
    (`review-4.md PR-001`).
  - Decided by: planner-proposed
  - Superseded by: D-022 adds attempt-local and logical-run variants, and D-029
    replaces the prompt-only CLI gate with a pre-exec broker (2026-09-22).

- **D-015 — Host continuity and observer identity are separate**
  - Decision: Samples carry a host/boot epoch, host-active monotonic value, and
    separate observer identity. One real epoch change records one unknown
    interval and seeds the new epoch. Unsupported hosts refuse managed launch.
  - Alternatives: process epochs; all gaps suspended; all gaps idle.
  - Why: Fresh status processes must not postpone enforced idle
    (`review-4.md PR-002`).
  - Decided by: planner-proposed
  - Supersedes: D-007's process-epoch rule (2026-09-22).

- **D-016 — Stop provenance survives dispatch and terminalization (superseded in part)**
  - Decision: Persist immutable stop intent separately from append-only dispatch
    attempts; requested, settled, and unconfirmed states retain both. Retries use
    one request ID.
  - Alternatives: terse terminal variants; infer dispatch; external dispatch
    state.
  - Why: Terminal diagnostics and INV-007 require complete provenance
    (`review-4.md PR-003`).
  - Decided by: planner-proposed
  - Superseded by: D-031 completes aggregate failed-dispatch semantics
    (2026-09-22).

- **D-017 — Drive effect commit points are attempt transactions (superseded in part)**
  - Decision: Source commits, task publication, and state commits receive
    authority plus an effect fence. Preparation is staged; intent, one external
    publication, and a receipt are serialized against deadline reconciliation.
    Recovery compares exact expected/candidate evidence.
  - Alternatives: another pre-check; AbortSignal; repository lock only; weaken
    AC-007.
  - Why: Concrete effect owners otherwise retain a check-to-write race
    (`review-4.md PR-004`).
  - Decided by: planner-proposed
  - Superseded by: D-025 moves execution out of `RunStore`, D-026 fixes Git tree
    and hook/signing semantics, and D-030 integrates task CAS/episode locking
    (2026-09-22).

- **D-018 — Unconfirmed lock release forbids same-process authoritative follow-up (superseded in part)**
  - Decision: A committed action survives release uncertainty; the originating
    process performs no projector, dispatch, readiness, or finalization write
    afterward and fresh reconciliation re-reads authority.
  - Alternatives: retry the action; continue; wait for process death.
  - Why: Continuing can duplicate a transition (`review-4.md PR-004`).
  - Decided by: planner-proposed
  - Superseded by: D-023 restores exact dead-owner reclamation and permits only
    non-promotional disposal of an input-gated resource (2026-09-22).

- **D-019 — Normalized terminal state drives Drive compatibility**
  - Decision: Normalized first-terminal state is authoritative. An injected
    projector materializes legacy Drive completion/status idempotently with
    persisted pending/applied/failed evidence.
  - Alternatives: owner-only completion; divergent surfaces; Driver imports.
  - Why: Foreign reconciliation must converge compatibility without reopening
    work (`review-4.md Missing Coverage — Drive compatibility`).
  - Decided by: planner-proposed

- **D-020 — Either trusted hard-ceiling proof fences promotion**
  - Decision: Persist wall high-water and hard elapsed. Within one host epoch,
    hard elapsed advances by the greater non-negative wall or host-active delta.
    Either proof being due fences promotion; backward wall across incomparable
    epochs stops as continuity-uncertain. Hard checks precede idle/lapse.
  - Alternatives: wall only; monotonic only; let rollback postpone enforcement.
  - Why: Both values need deterministic ordering (`review-4.md PR-002`).
  - Decided by: planner-proposed

- **D-021 — Cancelling an observer does not cancel reconciliation intent**
  - Decision: CLI/tool cancellation ends only that caller's remaining grace
    wait. Committed stop/dispatch/terminal state stands; no hidden background
    task is promised and the next trigger resumes the original grace.
  - Alternatives: ignore signal; undo stop; untracked background wait.
  - Why: Caller latency must not roll back durable state (`review-4.md Missing
    Coverage — grace-waiting observation`).
  - Decided by: planner-proposed

- **D-022 — Attempt-local controllers and logical descendants are distinct data**
  - Decision: Add a persisted `attempt-local` control descriptor keyed to an
    exact owner and process-local controller ID. It controls in-process Drive
    wrappers/finalizers only through the owning invocation and is never mapped
    to the host PID. Model descendants separately as either an execution control
    or a `nested-run` `RunRef`; nested runs stop and settle through an injected
    run-control port.
  - Alternatives: label the host as `direct-process`; make controls optional;
    force a nested run into a process/session descriptor.
  - Why: The mandatory union otherwise cannot represent current backends or
    nested settlement and could kill the interactive/tool host (`review-5.md
    PR-001`).
  - Decided by: planner-proposed
  - Supersedes: D-014's assumption that every backend/descendant is a
    reconstructible process or session control (2026-09-22).

- **D-023 — Lock recovery has dead-owner and completed-live-owner paths**
  - Decision: Reclaim an exact lock when its process identity is dead regardless
    of a release marker; reclaim a live exact owner only when its matching
    release-ready marker proves the action ended. A live owner without that
    marker is never reclaimed. After registration release uncertainty, the only
    same-process action allowed is disposal of the exact dormant child/session;
    no project work or lifecycle write follows.
  - Alternatives: release-ready only; PID-death only; continue normal launch.
  - Why: Effect crashes need dead-owner recovery, while stuck unlink by a live
    host needs completed-owner recovery (`review-5.md PR-002`).
  - Decided by: planner-proposed
  - Supersedes: D-018's release-ready-only recovery and absolute no-follow-up
    rule (2026-09-22).

- **D-024 — Torn event tails are repaired or terminate independently**
  - Decision: Under the event lock, archive and remove only one malformed,
    unterminated final JSON segment after a valid contiguous prefix, then append
    one sequenced recovery event. A malformed complete/interior line or sequence
    inconsistency writes an absorbing `event-log-corrupt` blocked record outside
    the event log, so lifecycle termination never depends on allocating another
    event.
  - Alternatives: block all writes forever; discard malformed bytes; renumber.
  - Why: A crash-torn append must not strand a running attempt or reuse a cursor
    sequence (`review-5.md PR-003`).
  - Decided by: planner-proposed
  - Supersedes: the former Design §4/§8 rule that every malformed tail simply
    blocks writes (2026-09-22).

- **D-025 — Driver publishes through a store-owned effect transaction**
  - Decision: `RunStore.openStepEffect()` persists the intent and returns an
    opaque transaction retaining the step lock. The Driver adapter asks the
    transaction for one immediate authorization, performs the external CAS or
    atomic replacement itself, then gives the store a receipt or uncertainty
    before closing. The store never receives or invokes a publication callback.
  - Alternatives: store callback; reusable permit; release the lock before
    publication.
  - Why: This preserves D-017's fence while conforming to the architecture
    record's storage-only persistence boundary (`review-5.md PR-004`).
  - Decided by: planner-proposed
  - Supersedes: D-017's store-executed publication callback and former
    `commitStepEffect(input, publish)` contract (2026-09-22).

- **D-026 — Temporary indexes start from the expected tree and preserve commit policy**
  - Decision: Seed each temporary index with `read-tree <expectedCommit>`, stage
    only the current source-policy pathspec or exact state-task paths, and never
    copy the real index. Run the normal commit hook sequence and configured
    signing against that temporary index; create an exact candidate commit, then
    publish only by CAS of the expected ref. Post-commit is a controlled
    descendant after the CAS receipt and before step settlement; it is never
    replayed after an uncertain crash.
  - Alternatives: empty index; copy real index; omit hooks/signing; use ordinary
    unfenced `git commit`.
  - Why: Baseline tree entries, unrelated staged changes, hooks, signing, and
    AC-018 all need explicit outcomes (`review-5.md PR-005`).
  - Decided by: planner-proposed
  - Supersedes: D-017's underspecified temporary-index/`commit-tree` protocol
    (2026-09-22).

- **D-027 — Existing-run observation bypasses launch bootstrap**
  - Decision: CLI and tool status/watch build a minimal observation context from
    project root, store, clock, owner/control ports, and compatibility projector.
    They do not create `CosmonautsRuntime`, scan domains/plugins, or validate
    current launch policy. Current config errors are returned as diagnostics;
    reconciliation uses the run's frozen snapshot.
  - Alternatives: full runtime bootstrap; ignore config errors; re-resolve the
    current liveness block.
  - Why: An invalid current config must refuse new launch without making a
    frozen run unobservable (`review-5.md PR-006`).
  - Decided by: planner-proposed

- **D-028 — Runtime capability bindings stay out of the plan**
  - Decision: Keep only the work-specific risk that undiscovered lifecycle
    writers may exist; do not persist analysis provider/binding state in
    Architecture Context.
  - Alternatives: retain a run-time binding snapshot; treat missing evidence as
    a clean baseline.
  - Why: Binding is resolved at sign-off/run time, not predicted in plans
    (`review-5.md PR-007`).
  - Decided by: planner-proposed

- **D-029 — CLI control registration is a pre-exec broker handshake**
  - Decision: Spawn a framework-owned broker/group whose initial argv and
    startup path cannot load project code. It reports exact identity and waits
    on a private channel; only after confirmed registration does it receive the
    target argv and prompt and start the project-controlled executable. Channel
    loss or rejected/uncertain registration exits the broker without target
    exec.
  - Alternatives: hold stdin only; discover PID after exec; suspend an already
    project-configured CLI.
  - Why: `Bun.spawn` executes startup hooks before prompt input, so prompt gating
    is not a start barrier (`review-5.md Missing Coverage — CLI start barrier`).
  - Decided by: planner-proposed
  - Supersedes: D-014's and former Design §3's prompt-input-only gate
    (2026-09-22).

- **D-030 — Task publication shares one mutation lock and digest CAS**
  - Decision: Every `TaskManager.updateTask()` and managed Drive task effect uses
    the same per-task mutation lock. Managed publication records expected and
    candidate path/byte digests, performs one atomic replacement under
    per-task-lock → step-lock → event-lock order, and captures the episode only
    after accepted receipt and confirmed releases.
  - Alternatives: episodic locking only when enabled; step pre-check without a
    task lock; overwrite on digest mismatch.
  - Why: Ordinary updates and Drive publication must not race or reverse the
    declared lock order (`review-5.md Missing Coverage — task-effect lock/CAS`).
  - Decided by: planner-proposed
  - Supersedes: D-017's task-publication wording that omitted the episode lock
    and concurrent ordinary writers (2026-09-22).

- **D-031 — Failed dispatch is durable and retryable within original grace**
  - Decision: Add aggregate `failed` plus per-target dispatch states. Aggregate
    priority is pending, failed, unavailable, then delivered; a later retry may
    move failed/unavailable to delivered using the same request ID. No dispatch
    outcome proves settlement, and grace expiry blocks with full history.
  - Alternatives: collapse failed into unavailable; terminalize immediately;
    leave the aggregate pending forever.
  - Why: Every `StopDispatchAttempt` outcome needs a defined exit and diagnostic
    meaning (`review-5.md Missing Coverage — failed dispatch aggregation`).
  - Decided by: planner-proposed
  - Supersedes: D-016's incomplete dispatch aggregate (2026-09-22).

- **D-032 — Bounded reconciliation is conditional on the observer remaining attached**
  - Decision: Watchdog/scheduler/resume triggers stay through settlement or
    grace. A status/watch trigger does so only while its caller remains attached;
    cancellation returns promptly with durable intent intact, and the next
    trigger resumes the original grace and blocks immediately if it expired.
  - Alternatives: keep the observer alive after cancellation; promise a hidden
    background reconciler; roll back the stop.
  - Why: B-001 must agree with D-021's caller-cancellation contract
    (`review-5.md Missing Coverage — grace-waiting observation`).
  - Decided by: planner-proposed
  - Supersedes: B-001's former unconditional same-trigger terminal/blocked
    wording (2026-09-22).

- **D-033 — The architecture record is unchanged for this revision**
  - Decision: Do not edit `missions/architecture/orchestration-future.md`.
    Resolve Review 5 within its existing Boundary Model; any implementation
    need for persistence to execute Driver code or another boundary amendment
    halts for a human decision.
  - Alternatives: update D-007/envelope; amend the storage boundary.
  - Why: This is the human's explicit constraint for the Review 5 revision.
  - Decided by: human, 2026-09-22
  - Supersedes: D-011's architecture-edit implementation step (2026-09-22).

## Human Decisions Required

All recorded decisions are resolved; none is an implementation gate.

### H-001 — Enforcement while no local execution authority can run

**Ruling: first-opportunity enforcement** (human, 2026-09-22). INV-002 is
amended accordingly. No external enforcement service is in scope.

### H-002 — Framework default

**Ruling: four hours, `14_400_000 ms`** (human, 2026-09-22).

### H-003 — Architecture record during Review 5 remediation

**Ruling: do not change `missions/architecture/orchestration-future.md`**
(human, 2026-09-22). Review 5 PR-004 is resolved by D-025 inside the recorded
storage-only boundary. If implementation instead requires a boundary change,
stop and draft that decision here rather than choosing it.

## Behaviors

### B-001 — Launch exposes identity and bounded attempts end

- Source: AC-001, AC-002
- Observer: an operator or coordinator starting a durable Chain or Drive run
- Entry point: `cosmonauts run chain`, `cosmonauts run drive`, `chain_run`, or
  `run_driver`, followed through normalized status/watch
- Outcome: launch exposes the exact run identity before waiting; a running
  framework process enforces due hard/idle deadlines, and the first later
  framework trigger reconciles after unavailability. No work/result is promoted
  after the hard deadline and one logical stop is visible. A watchdog,
  scheduler, or resume trigger stays through terminal/blocked settlement within
  fixed grace. Status/watch does so while its caller remains attached; if that
  caller cancels, durable intent remains and the next trigger resumes the
  original grace, blocking immediately when it has expired. Repeated
  enforcement never creates another logical stop or rewrites the outcome.

### B-002 — Shadow idle crossing is visible and non-cancelling

- Source: AC-003
- Observer: an operator or coordinator following a silent attempt
- Entry point: `cosmonauts run status`, `cosmonauts run watch`, `run_status`, or
  `run_watch`
- Outcome: at the first framework opportunity after each shadow idle crossing,
  one durable would-have-cancelled decision appears while the attempt remains
  eligible until activity, normal completion, or hard-ceiling enforcement;
  polling duplicates neither decision nor event.

### B-003 — Useful work and proof of life differ

- Source: AC-004
- Observer: an operator comparing active and heartbeat-only attempts
- Entry point: normalized status/watch for a Chain or Drive run
- Outcome: useful activity starts a new idle window, renewal changes only proof
  of life, active work survives repeated windows, and heartbeat-only work
  reaches the configured shadow/enforce outcome after enough host-active silence.

### B-004 — Host unavailability does not become false idle

- Source: AC-005, AC-009
- Observer: an operator resuming or observing after host suspension
- Entry point: the durable Chain/Drive invocation or normalized status/watch
- Outcome: detected host-unavailable time is reported and excluded from idle;
  before the hard ceiling the exact authority resumes, while at/after it
  promotion is fenced and first framework action reconciles stop/settlement.

### B-005 — Project policy and composed ceilings are inspectable

- Source: AC-006
- Observer: a project operator starting and inspecting a durable run
- Entry point: `.cosmonauts/config.json` through Chain/Drive CLI or tool, then
  normalized status
- Outcome: config selects idle mode/window and hard baseline without CLI flags;
  omitted values use sourced defaults, invalid members refuse a new launch and
  name the key, and status shows the frozen policy/candidates/deadline. A later
  invalid current config cannot block observation or reconciliation of a frozen
  run; it appears only as a current-config diagnostic.

### B-006 — Drive's task cap remains an upper bound

- Source: AC-007
- Observer: an operator running a Drive task with an explicit or default cap
- Entry point: `cosmonauts run drive` or `run_driver`, observed through result and
  normalized status/watch
- Outcome: promotion closes at the earlier task cap or configured baseline. From
  that point no late result, task transition, source/state commit, finalizer
  readiness, or Drive lifecycle event can be accepted.

### B-007 — Obsolete results remain evidence only

- Source: AC-008
- Observer: an operator inspecting a run after obsolete completion
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: full late completion is retained with identity/rejection and never
  becomes canonical. If it first discovers an overdue attempt, only deadline
  reconciliation advances. Existing terminal fields remain byte-identical.

### B-008 — A foreign observer resolves lapsed ownership safely

- Source: AC-010
- Observer: an operator or coordinator observing a non-renewing attempt
- Entry point: normalized status/watch through CLI or registered tools
- Outcome: deadline/grace reconciliation runs first; otherwise an exact alive
  owner remains expired-but-held, a dead owner blocks, and an uncheckable owner
  receives one-lease grace then blocks. No replacement starts in the run.

### B-009 — Stop completion includes descendants

- Source: AC-011
- Observer: an operator whose attempt or nested child does not stop promptly
- Entry point: durable Chain/Drive with registered spawned, process, Pi-session,
  post-commit-hook, or nested-run descendants, followed via status/watch
- Outcome: terminalization waits for backend and every descendant. A nested run
  is identified and reconciled by `RunRef`, never by fabricating a process
  control. Grace expiry blocks and directs replacement-run recovery; a later
  trigger keeps the original grace.

### B-010 — No-runnable-work produces a concrete run outcome

- Source: AC-012
- Observer: an operator following a graph with unreachable dependent work
- Entry point: durable Chain/Drive CLI or tool through status/watch
- Outcome: blocked reachable work yields blocked; otherwise failed yields failed,
  cancelled yields cancelled, and legacy stale is last priority. Dependents are
  not executed or manually rewritten.

### B-011 — Concurrent invocations preserve one authority and event order

- Source: AC-013
- Observer: an operator/follower when two processes touch one run
- Entry point: concurrent Drive resume/reconciliation and watch cursor paging
- Outcome: ownership, attempt IDs, stop intent, and event sequences remain unique
  and strictly increasing. A crash-torn final event fragment is preserved as
  diagnostic evidence and repaired without sequence reuse; non-tail corruption
  blocks the run through an independent absorbing record. Advancing by returned
  cursor skips and rereads nothing.

### B-012 — Existing non-liveness contracts remain unchanged

- Source: AC-018
- Observer: Chain, spawn, Drive, and coordinator users
- Entry point: existing Chain CLI/tool, spawned-agent flow, Drive CLI/tool, and
  coordinator-selected harness execution
- Outcome: Chain summaries retain 200 characters, spawn depth/concurrency
  rejection is unchanged, unrelated Drive policy remains unchanged, and
  coordinator/harness selection stays neutral. Drive's source/state selection,
  configured Git signing and commit hooks remain effective, excluded tracked
  paths survive, and unrelated real-index staging is neither committed nor
  destroyed by Driver-owned commits.

## Design

### 1. Resolved policy, composition, and observation

Add strict project configuration and a pure resolver:

```ts
interface ProjectLivenessConfig {
  readonly idleMode?: "shadow" | "enforce";
  readonly idleWindowMs?: number;
  readonly hardCeilingMs?: number;
}

interface ResolvedLivenessPolicy {
  readonly idleMode: { readonly value: "shadow" | "enforce"; readonly source: "project-config" | "framework-default" };
  readonly idleWindow: SourcedDuration;
  readonly attemptHardCeiling: SourcedDuration;
  readonly cancellationGraceMs: 30_000;
  readonly leaseDurationMs: 300_000;
  readonly renewalIntervalMs: 60_000;
}
```

`idleMode` defaults to shadow, the provisional idle window is fifteen minutes,
and the hard default is four hours. Durations must be positive safe integers;
wrong shapes and unknown members/modes refuse launch naming the exact key.
Partial config is valid.

| Population | Baseline | Independent bound | Effective deadline |
|---|---|---|---|
| Durable Chain step | project → framework default | existing absolute whole-chain `timeoutMs` | earlier |
| Drive task | project → framework default | explicit `taskTimeoutMs` → existing 30-minute default | earlier |
| Drive finalizer | project → framework default | none | baseline |

Persist candidates, source, chain start/global deadline, and effective deadline.
Drive CLI/tool writers consume one frozen `spec.json`; resumes never re-resolve.
Legacy runs remain observable as `legacy-liveness-unmanaged` and refuse managed
mutation.

Launch paths use strict config. Existing-run status/watch use the frozen snapshot
through `RunObservationContext` and never instantiate `CosmonautsRuntime` or
resolve current liveness. A best-effort non-throwing config diagnostic reader may
report malformed current config but cannot gate store open or reconciliation.
CLI and registered tools share this composition.

### 2. Attempt, stop, control, descendant, and effect data

```ts
interface AttemptAuthority {
  readonly attemptId: string;
  readonly ownerToken: string;
}

interface AttemptOwnerIdentity extends ProcessIdentity {
  readonly invocationId: string;
}

interface StopIntent {
  readonly requestId: string;
  readonly reason: "hard-ceiling" | "idle-deadline" | "caller";
  readonly trigger?: "wall-deadline" | "hard-elapsed" | "clock-continuity-uncertain";
  readonly requestedAt: string;
  readonly graceEndsAt: string;
}

type StopDispatchOutcome = "delivered" | "already-delivered" | "unavailable" | "failed";
type StopTargetDispatchState = "pending" | "delivered" | "unavailable" | "failed";

interface StopTargetDispatchRecord {
  readonly targetId: string;
  readonly status: StopTargetDispatchState;
  readonly attempts: readonly StopDispatchAttempt[];
}

interface StopDispatchRecord {
  readonly status: StopTargetDispatchState;
  readonly targets: readonly StopTargetDispatchRecord[];
}

type AttemptStopState =
  | { readonly kind: "none" }
  | { readonly kind: "requested"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord }
  | { readonly kind: "settled"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord; readonly settledAt: string; readonly via: "result" | "backend-equivalent" }
  | { readonly kind: "unconfirmed"; readonly intent: StopIntent; readonly dispatch: StopDispatchRecord; readonly blockedAt: string; readonly reason: string };

type BackendControlDescriptor =
  | { readonly kind: "attempt-local"; readonly targetId: string; readonly controllerId: string; readonly owner: AttemptOwnerIdentity }
  | { readonly kind: "posix-process-group"; readonly targetId: string; readonly hostId: string; readonly bootId: string; readonly groupId: number; readonly leader: ProcessIdentity }
  | { readonly kind: "direct-process"; readonly targetId: string; readonly identity: ProcessIdentity }
  | { readonly kind: "pi-session"; readonly targetId: string; readonly sessionId: string; readonly owner: AttemptOwnerIdentity };

type AttemptDescendantDescriptor =
  | { readonly kind: "execution-control"; readonly targetId: string; readonly control: BackendControlDescriptor }
  | { readonly kind: "nested-run"; readonly targetId: string; readonly run: RunRef };
```

The attempt-local descriptor identifies only a dormant/live controller in the
owning invocation's registry. A local request aborts its operation and propagates
to registered children. A fresh process may inspect its exact owner: dead means
the local computation is settled, alive-but-inaccessible means dispatch
unavailable. It never converts owner PID to signal authority.

A nested-run descendant is stopped through an injected `NestedRunControlPort`,
which writes caller-stop intent into that run through its own store/reconciler;
settlement is the nested run's absorbing terminal state plus its attempts. It is
not a `BackendControlDescriptor`.

Attempts persist policy/deadlines, authority, start phase, proof/activity,
clock/high-water state, lease, stop state, controls, descendants, shadow episode,
effect intents/receipts, session, rejected evidence, and lock/event recovery.
Tokens never enter status. The permanent fence closes promotion, renewal,
activity, child launch, effect intent, results, readiness, and finalization;
closure/evidence operations remain legal. First terminal state is absorbing.

### 3. Start handles, local control, and the pre-exec barrier

```ts
interface BackendStartContext {
  registerControl(control: BackendControlDescriptor): Promise<ConditionalAttemptResult<BackendControlDescriptor>>;
  registerDescendant(descendant: AttemptDescendantDescriptor): Promise<ConditionalAttemptResult<AttemptDescendantRecord>>;
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

interface NestedRunControlPort {
  requestStop(descendant: Extract<AttemptDescendantDescriptor, { kind: "nested-run" }>, request: StopIntent): Promise<StopDispatchOutcome>;
  inspectSettlement(descendant: Extract<AttemptDescendantDescriptor, { kind: "nested-run" }>): Promise<BackendSettlementProbe>;
}
```

Drive's scheduler wrapper and shell finalizer create dormant attempt-local
controllers before preflight/finalizer preparation. They register the local
descriptor, wait for confirmed lock release, then release their in-process work.
The host process is never persisted as a direct target.

CLI adapters launch a framework-owned controlled-process broker as group leader.
The broker starts from a hidden framework entry that performs no project config,
plugin, hook, cwd discovery, or target exec. It reports exact identity over a
private channel and waits. After confirmed registration the parent sends target
argv/prompt metadata; only then does the broker start the CLI in its controlled
group. EOF, registration rejection, or release uncertainty causes the broker to
exit without target exec. Persisted argv is never authority.

A registration result with unconfirmed release halts normal processing. The
caller may only dispose the exact dormant broker/session/controller and clear
local timers; it may not release work or write lifecycle/project state. Fresh
reconciliation reads the registered start phase and target settlement. Confirmed
disposal yields start failure; uncertain disposal reaches blocked by original
settlement rules.

Pi uses its real `sessionId`, `session.abort()`, and idle settlement. Session
creation precedes prompt; persisted owner/session registration and confirmed
release precede `prompt`. A fresh process does not invent remote Pi attach.

Nested Chain launch similarly creates a run/start handle before scheduling;
parent descendant registration must be confirmed before releasing the nested
scheduler. Parent stop uses the run port, while each nested attempt controls its
own process/session.

### 4. Storage-only transitions, effect transactions, and lock recovery

The scheduler-facing store exposes reads plus conditional transition families.
The effect boundary is:

```ts
interface RunStore {
  registerStepBackendControl(input: RegisterBackendControlInput): Promise<StoreMutationResult<BackendControlDescriptor>>;
  registerStepDescendant(input: RegisterDescendantInput): Promise<StoreMutationResult<AttemptDescendantRecord>>;
  requestStepStop(input: RequestStepStopInput): Promise<StoreMutationResult<AttemptStopRecord>>;
  recordStepStopDispatch(input: RecordStopDispatchInput): Promise<StoreMutationResult<AttemptStopRecord>>;
  openStepEffect(input: OpenStepEffectInput): Promise<OpenStepEffectResult>;
  resolveStepEffect(input: ResolveStepEffectInput): Promise<StoreMutationResult<AttemptEffectRecord>>;
  settleStepAttempt(input: SettleStepAttemptInput): Promise<SettleAttemptResult>;
  finalizeRun(input: FinalizeRunInput): Promise<FinalizeRunResult>;
  recordCompatibilityProjection(input: CompatibilityProjectionInput): Promise<StoreMutationResult<CompatibilityProjectionState>>;
}

interface AttemptEffectTransaction {
  readonly intent: AttemptEffectIntent;
  authorizePublication(sample: ClockSample): Promise<ConditionalAttemptResult<"authorized">>;
  recordReceipt(receipt: ExternalEffectReceipt): Promise<StoreMutationResult<AttemptEffectRecord>>;
  recordUnconfirmed(reason: string): Promise<StoreMutationResult<AttemptEffectRecord>>;
  close(): Promise<LockReleaseState>;
}

type OpenStepEffectResult =
  | { readonly kind: "ready"; readonly transaction: AttemptEffectTransaction }
  | { readonly kind: "existing"; readonly effect: AttemptEffectRecord }
  | { readonly kind: "rejected"; readonly reason: AttemptMutationRejection };
```

`openStepEffect` acquires/retains the step lock, rechecks authority, terminal and
clock state, returns existing receipt idempotently, and persists exact intent.
Authorization is one-use and immediately precedes Driver publication. The Driver
executes the external CAS/replacement itself and submits the receipt or
uncertainty. The transaction writes storage only. Closing returns release
certainty; the Driver performs no authoritative follow-up after unconfirmed
release.

All lock files carry lock UUID plus exact host/boot/PID-start identity. After an
action settles, the owner atomically writes a matching release-ready marker
before unlink. Acquisition may reclaim:

1. an exact dead owner, marker or not; or
2. an exact live owner with a matching release-ready marker.

A live owner without that marker is still inside the critical section and only a
bounded acquisition failure is legal. Reclamation claims the exact lock entry,
consumes any matching marker, re-reads primary records, and never assumes the
prior action failed. Dead-owner reclamation is what makes a crash after intent,
during publication, or before receipt recoverable.

The order is external mutation lock (repository or per-task) → step lock → event
lock. No publication path may acquire those in reverse. Raw lifecycle writers
are removed from scheduler/backends/projectors/finalizers and retained privately
for initialization, recovery, and the independent corruption terminal described
below.

### 5. Sequence-preserving event-tail recovery

Event allocation holds the event lock, ignores the process-local sequence cache,
and parses raw bytes. Valid event envelopes must have a contiguous, strictly
increasing sequence. Recovery distinguishes:

- **Crash-torn tail:** exactly one malformed non-empty final segment, no trailing
  newline, after a valid prefix. Write an immutable sidecar keyed by run, byte
  offset, and tail digest; write a recovery intent; atomically replace the log
  with the byte-identical valid prefix; append one `event_tail_recovered`
  envelope at `lastGoodSeq + 1`; mark the recovery intent resolved. Re-entry
  scans recovery IDs so every crash point is idempotent.
- **Structural corruption:** malformed newline-terminated/interior content,
  duplicate/gapped sequence, or a recovery sidecar that disagrees with the
  prefix. Do not rewrite or append. Under the run transition lock, write an
  absorbing `blocked/event-log-corrupt` canonical record and diagnostic sidecar
  independent of the event log. Status reads it; watch returns valid prefix,
  stable cursor, and corruption diagnostic.

Malformed bytes are never silently discarded, valid sequences are never
renumbered/reused, and event failure cannot leave the run `running`. Canonical
lifecycle state is committed before its event projection; a crash between them
is reconciled idempotently.

### 6. Host clock and hard/idle accounting

```ts
interface ClockSample {
  readonly wallTimeMs: number;
  readonly hostActiveTimeMs: number;
  readonly hostEpoch: string;
  readonly observer: ClockObserverIdentity;
}
```

The platform must provide host-active monotonic time comparable across processes
within one host/boot epoch and excluding suspension. Process-relative clocks are
not accepted. Within an epoch, active delta advances idle; positive wall excess
is unavailable. Hard elapsed advances by the greater non-negative wall or
active delta, and wall high-water never decreases.

A real epoch change records one unknown interval, advances hard by non-negative
wall delta only, and seeds the new epoch. A backward wall move across an
incomparable epoch fences as `clock-continuity-uncertain`. The hard ceiling is
due if wall high-water reaches the absolute deadline or hard elapsed reaches the
selected duration. Hard wins before idle, caller stop, owner lapse, renewal,
activity, result, or effect authorization.

Useful activity includes Pi output/tool/turn/compaction, Drive backend output and
verification, and finalizer preparation. Renewal, polling, replay, compatibility
projection, and synthetic heartbeat are not useful. Every producer supplies
attempt authority.

### 7. Reconciliation, dispatch, settlement, and observer cancellation

Watchdog, scheduler tick, status, watch, resume, and invocation acting on the
same run call one reconciler before other lifecycle work. A new unrelated run
does not scan old runs. Every promotion remains a last-line deadline gate.

Stop intent is immutable. Dispatch records one target row per local controller,
process/session, post-commit hook, and nested run. Aggregate status is:

1. `pending` while any target has no completed attempt;
2. otherwise `failed` if an addressable transport failed;
3. otherwise `unavailable` if any target cannot safely be reached;
4. otherwise `delivered`.

Retries use the same request/target IDs within the original grace. Failed and
unavailable may become delivered when a later invocation has working transport;
none proves settlement. At grace, any unsettled backend/descendant/effect blocks
with complete history.

Race order:

1. Normal completion/start failure that wins before stop and hard proof settles
   normally.
2. Due hard proof wins under the step lock; otherwise the first stop fixes
   intent.
3. Post-intent completion is rejected evidence but may prove settlement.
4. Settlement requires backend/equivalent plus every descendant and effect.
5. Grace expiry writes absorbing `stop-unconfirmed`.
6. Launcher reaping may assist exact controls but cannot replace this protocol.

A cancelled status/watch wait returns promptly after any current atomic
operation, keeping durable state. It spawns no hidden work. A later trigger
continues the same request and blocks immediately if grace already expired.

### 8. Descendant ownership and backend adapters

An attempt-context registry binds Pi session IDs, controlled processes,
attempt-local controllers, post-commit hooks, and nested `RunRef`s to authority.
Registration precedes work. Parent stop propagates one request ID.
`SpawnTracker` remains message delivery only.

The Drive wrapper owns an attempt-local controller immediately, covering
preflight, backend, postflight, and finalizer preparation. Lower CLI commands use
the broker and publish process-group descendants. `cosmonauts-subagent`
publishes Pi session control. Unsupported process control refuses launch rather
than falling back to PID-only signaling.

Fresh processes use only framework-minted descriptors. They never trust
`run.pid` alone, execute stored commands, call private Pi state, or signal the
attempt owner's host process. Missing safe control becomes unavailable and then
blocked unless exact settlement evidence arrives.

### 9. Reconciliation state space and exits

| Rechecked state/input | Outcome |
|---|---|
| current promotion before deadline, stop none | apply under lock |
| promotion at/after either hard proof | reject; persist fence and one stop intent |
| same host epoch/new observer | compare host-active values |
| first epoch change/non-negative wall | record one unknown interval, advance hard, seed |
| epoch change/backward wall | fence continuity-uncertain |
| dormant local/broker registration confirmed | release work once |
| registration rejected | dispose dormant resource; start failure when settled |
| registration release unconfirmed | keep gate closed; dispose only; fresh reconciliation |
| local descriptor, same invocation | request local controller stop |
| local descriptor, fresh process/owner alive | unavailable; original grace continues |
| local descriptor, owner dead | local computation settled; descendants still drain |
| nested run | write/reuse child caller-stop; wait for child terminal |
| requested stop, dispatch failed/unavailable | append attempt; retry same IDs before grace |
| requested stop settles with descendants/effects | failed for deadline, cancelled for caller |
| requested stop reaches grace | blocked `stop-unconfirmed` |
| exact effect receipt | return once; never republish |
| recovered intent/candidate exists | record receipt |
| recovered intent/expected exists before deadline | reopen same effect once under locks |
| recovered intent/expected exists after deadline | mark absent, fence, stop |
| recovered intent/third state | block effect-outcome-unconfirmed |
| lock owner dead without marker | exact reclaim and recover intent/record |
| lock owner live with matching release-ready | exact reclaim and re-read |
| lock owner live without marker | bounded lock-unavailable; never reclaim |
| torn final event fragment | archive, repair prefix, sequence recovery event |
| interior/complete malformed event or bad sequence | independent absorbing event-log-corrupt block |
| task expected digest mismatches under task lock | no replacement; recompute before deadline or block conflict |
| observer cancels during grace | return; next trigger resumes original grace |
| terminal step/run receives lifecycle input | canonical terminal bytes unchanged; evidence only |
| no step can run | blocked, else failed, else cancelled, else stale |

Shadow markers clear on useful activity/terminal. Lapse clears on valid renewal or
terminal. Start barrier exits through released, disposed-settled, or blocked.
Dispatch exits through delivered/settlement/grace. Effect intent exits through
receipt/absent/unconfirmed. Release uncertainty exits through exact recovery.
Event recovery exits through repaired or absorbing corruption. Compatibility
projection becomes applied or visibly retryable. No temporary state depends on
an in-memory default after restart.

### 10. Drive effects, Git tree construction, task CAS, and compatibility

Drive finalizers receive `{ ref, authority, effectFence, signal }`.
`AbortSignal` assists cancellation but is not authority. Each effect follows:

1. acquire its external mutation lock;
2. prepare exact expected/candidate evidence;
3. open/authorize the step effect transaction;
4. execute one Driver-owned publication;
5. submit receipt/uncertainty and close;
6. only after confirmed release emit accepted lifecycle/readiness projections.

For Git source and state commits, the Driver:

- resolves the target ref and expected commit under the repository lock;
- creates a private temporary index and seeds it with
  `git read-tree <expectedCommit>`;
- for source commits, stages the existing all-files pathspec excluding
  `missions/**`, `memory/**`, and lock files; for state commits, stages only the
  exact task paths;
- never reads from or writes to the real index, so baseline tracked files survive
  and unrelated staging remains untouched;
- runs `pre-commit`, `prepare-commit-msg`, and `commit-msg` with the temporary
  index and standard message-file arguments, then recomputes the tree;
- creates the candidate with the expected parent and final hook-approved message,
  honoring configured signing/identity exactly as normal Driver commit policy;
- persists expected ref/candidate SHA, then publishes only by
  `update-ref <ref> <candidate> <expected>` inside the effect transaction.

A configured `post-commit` hook is registered as a controlled descendant after
CAS receipt and before step settlement, while the repository lock remains held.
Its ordinary non-zero exit remains diagnostic as Git treats it; transport/crash
uncertainty blocks rather than replaying an arbitrary hook. No hook is executed
by `RunStore`.

For task status, `TaskManager` exposes an unconditional per-task mutation guard.
Ordinary updates and managed Drive updates both use it. A managed update prepares
`{ expectedPath, expectedDigest, candidatePath, candidateDigest, candidateBytes
}` from the locked current task; with that guard still held it opens the step
effect transaction and atomically replaces only when expected bytes still
match. Recovery takes the task lock then step lock and compares exact digests.
Episode capture occurs after accepted receipt and confirmed releases, then may
acquire the event lock; release uncertainty skips capture without undoing the
primary update.

Normalized first-terminal state remains authoritative. Drive compatibility
projection is persisted as none/pending/applied/failed and writes
`run.completion.json` idempotently. Status/resume consult normalized state first;
projection failure never reopens work.

### 11. Chain launch and Pi lifecycle

Durable Chain compilation carries one frozen attempt baseline and one absolute
global deadline from existing `timeoutMs`; every step uses the earlier bound
without resetting the global budget. Inline coordinator paths retain current
global semantics.

Durable launch returns `{ runId, completion }` after creation and before
scheduler wait. CLI emits the ID immediately; `chain_run` reports it in progress.
The chain backend registers an attempt-local controller plus Pi session before
prompt and feeds activity/settlement through authority-checked transitions. The
200-character summary transformation remains unchanged.

### 12. Operator observation contract

Status/watch rows contain step/attempt and safe owner identity, proof/activity,
policy candidates/deadline, host-unavailable/unknown intervals, both hard proofs,
fence, complete stop/dispatch/grace, controls, session, descendants, effect and
lock state, event-recovery/corruption state, compatibility projection, rejected
result reference, and current-config diagnostics. CLI JSON and tool details use
one typed summary.

Documentation states that observation may mutate through reconciliation,
respects caller cancellation, never starts work, and promises no action while no
framework process can run.

### 13. Review disposition

| Finding | Answer |
|---|---|
| `review-5.md PR-001` | D-022; Design §§2–3 and 7–9 |
| `review-5.md PR-002` | D-023/D-029; Design §§3–4 and 9 |
| `review-5.md PR-003` | D-024; B-011; Design §5 and §9 |
| `review-5.md PR-004` | D-025/D-033; Architecture Context; Design §4/§10 |
| `review-5.md PR-005` | D-026; B-012; Design §10 |
| `review-5.md PR-006` | D-027; B-005; Design §1/§12 |
| `review-5.md PR-007` | D-028; Architecture Context; R-012 |
| `review-5.md` CLI barrier | D-029; Design §3 |
| `review-5.md` task lock/CAS | D-030; Design §4/§10 |
| `review-5.md` failed dispatch | D-031; Design §2/§7/§9 |
| `review-5.md` cancelled observer | D-032; B-001; Design §7/§9 |

## Files to Change

- `lib/config/types.ts`, `lib/config/loader.ts`, `lib/config/index.ts`, and new
  `lib/config/liveness.ts` — strict launch policy plus non-throwing observation
  diagnostics and sourced resolution.
- `cli/runtime-bootstrap.ts`, `cli/run/subcommand.ts`, and new
  `cli/run/observation-context.ts` — separate launch/runtime bootstrap from
  frozen-run observation and reconciliation.
- `cli/main.ts` and new `cli/controlled-process-host.ts` — route the hidden
  framework broker before project/runtime bootstrap.
- `cli/chain-execution.ts`, `domains/shared/extensions/orchestration/chain-tool.ts`,
  `driver-tool.ts`, `run-control-tools.ts`, and `spawn-tool.ts` — early identity,
  frozen policy, cancellation, observation context, and descendant registration.
- `lib/durable-runtime/types.ts`, `backends.ts`, and `index.ts` — policy,
  authority, attempt-local/process/Pi controls, logical descendants, dispatch,
  effect-transaction, event-recovery, compatibility, and summary contracts.
- New `lib/durable-runtime/liveness.ts` — pure clock/deadline/lapse/stop/effect
  race and terminal-absorption decisions.
- `lib/durable-runtime/file-store.ts` — conditional transitions, retained-lock
  effect transactions, dual lock recovery, sequence allocation/torn-tail journal,
  independent corruption terminal, and absorbing finalization.
- `lib/durable-runtime/scheduler.ts`, `scheduler-state.ts`, `run-start.ts`,
  `controller.ts`, and `status.ts` — watchdog/reconciliation, local/fresh/nested
  control, settlement drain, observation cancellation, and no raw writers.
- `lib/entity-file-lock.ts` — exact process identity, release-ready marker,
  dead-owner/completed-live-owner reclamation, bounded acquisition, and explicit
  release certainty.
- `lib/process/process-group.ts` and new `lib/process/process-identity.ts`,
  `host-clock.ts`, and `controlled-process.ts` — exact identity, cross-process
  active clock, safe signaling/probing, and broker handshake.
- `lib/orchestration/types.ts`, `durable-chain-compiler.ts`,
  `durable-chain-runner.ts`, `chain-runner.ts`, `activity-bus.ts`,
  `agent-spawner.ts`, `session-factory.ts`, new `attempt-context.ts`, and
  `spawn-tracker.ts` — early start handles, global budget, local/Pi/nested
  controls, activity, and execution/message separation.
- `lib/driver/types.ts`, `drive-graph-compiler.ts`, `drive-graph-runner.ts`,
  `run-state.ts`, `event-stream.ts`, and `durable-events.ts` — frozen policy,
  authority/effect identity, compatibility projection, and accepted events.
- `lib/driver/drive-scheduler-backend.ts`, `run-one-task.ts`, `driver.ts`, and
  `run-step.ts` — attempt-local controller, controlled descendants, old timer
  removal, and launcher settlement.
- `lib/driver/durable-steps.ts` — replace raw writes with accepted conditional
  transitions and receipts.
- `lib/driver/drive-finalization.ts`, `state-commit.ts`,
  `shell-command-finalizer.ts`, and `lock.ts` — Driver-owned effect publication,
  seeded temporary indexes, hook/signing preservation, CAS, and lock order.
- `lib/driver/backends/types.ts`, `bun-runtime.ts`, `orchestration-adapter.ts`,
  `cli-process.ts`, `codex.ts`, `claude-cli.ts`, and
  `cosmonauts-subagent.ts` — start/control/completion/settlement and broker/Pi
  registration before work.
- `lib/tasks/task-manager.ts`, `lib/tasks/file-system.ts`, `lib/tasks/lock.ts`,
  and `lib/memory/episode-transition-lock.ts` — one task mutation lock, prepared
  digest CAS, atomic replacement, and post-receipt episode capture.
- `docs/orchestration.md` — policy, early identity, control/descendant shapes,
  event repair/corruption, effect transactions, Git/task semantics, observation
  bootstrap/cancellation, compatibility, and recovery guidance.

## Risks

- **R-003 — Architecture boundary drift is a stop condition.** The architecture
  record is unchanged. If implementation requires persistence to execute Driver
  code, durable-runtime to import Driver/task/Git, or another boundary amendment,
  halt and draft the decision under H-003.
- **R-004 — A backend may not expose honest control or settlement.** Repair or
  refuse it; never fabricate a process descriptor or use the host PID.
- **R-005 — Direct host-source mutation is not rollback-safe.** Fencing covers
  Driver-owned effects, not arbitrary bytes from an unconfirmed backend/hook.
  Such a backend must be contained, repaired, or refused.
- **R-006 — Host/process identity and active clocks are platform-sensitive.** PID
  alone, process-relative time, or uptime counting sleep is insufficient.
- **R-007 — Filesystem locking/recovery assumptions may fail.** Exact
  dead-owner and release-ready reclaim, hard links/atomic replacement, and
  immutable recovery evidence are required; otherwise stop the slice.
- **R-008 — Write-on-observation changes latency.** Restrict mutation to
  reconciler/projector, expose it, and honour caller cancellation.
- **R-009 — Clock discontinuity can stop useful work conservatively.** Prefer
  loss to extending a hard ceiling without evidence.
- **R-010 — External effect recovery has crash points and project-controlled
  hooks.** Expected/candidate evidence, controlled hook descendants, and
  no-replay recovery are mandatory. If publication cannot be reduced to one CAS
  or atomic replacement, stop Stage 6.
- **R-011 — Legacy runs lack snapshots.** Observe them; do not fabricate managed
  resume authority.
- **R-012 — A parallel lifecycle writer may remain undiscovered.** Every newly
  found task, Git, event, completion, process, or compatibility writer must route
  through the named contracts; a parallel authority path blocks completion.
- **R-013 — AC-018 spans changed paths.** Summary, spawn rejection, Drive policy,
  Git hooks/signing/index state, and coordinator neutrality regressions block the
  slice.
- **R-014 — Compatibility projection can fail after terminalization.** Keep the
  terminal absorbing and retry only projection.
- **R-015 — Lock ordering can deadlock effects.** External mutation lock
  (repository or per-task) → step → event is the only order. Reverse discovery
  stops the stage.
- **R-016 — Fresh control and hooks are trust boundaries.** Only framework-minted
  descriptors are signal authority. Target argv is released only through the
  broker after consent implicit in the selected backend; Git hooks execute only
  because existing Drive commit policy already authorizes them. Persisted
  commands/project files are never fresh-process execution authority.
- **R-017 — Event repair must distinguish truncation from corruption.** If a tail
  cannot be proved to be one unterminated final append, preserve it and use the
  independent absorbing corruption path rather than guessing.

## Implementation Order

0. **Ratified ground and architecture conformance.** Freeze INV-001–INV-007,
   D-013, H-001/H-002, the twelve behaviors, and H-003's no-architecture-edit
   rule. Confirm every contract depends in the recorded direction; a required
   boundary change stops before code.
1. **Shared contracts and platform proofs.** Define policy, clocks, authority,
   stop/failed-dispatch provenance, attempt-local/process/Pi controls, logical
   descendants, effect transaction, lock outcomes, event recovery, compatibility,
   and early Chain start. Prove each current backend maps honestly; no adapter
   may fabricate host control.
2. **Atomic store, lock, and event foundation (B-007, B-011).** Begin from
   observable losing-claim, duplicate-stop/sequence, obsolete-result,
   release-uncertain, dead-owner effect-crash, torn-tail, structural-corruption,
   and terminal-rewrite failures. Implement dual lock reclamation, conditional
   store transitions, retained effect transactions, and event repair/absorbing
   corruption before refactoring callers.
3. **Policy, observation, and launch composition (B-001, B-005, B-006).** Cover
   absent/partial/invalid/default policy, Chain global composition, Drive minimum,
   early identity, invalid-current-config observation, and frozen resume. Wire
   CLI/tools while retaining the old Drive timer until backend cutover.
4. **Clock, activity, renewal, and regain (B-002, B-003, B-004, B-008).** Cover
   fresh observers, suspension, epoch change, backward wall, repeated polling,
   both hard proofs, and all reconciliation triggers before owner-lapse handling.
5. **Backend/descendant control and settlement (B-001, B-009).** Add dormant
   attempt-local controllers, pre-exec broker, Pi start handles, gated nested-run
   start, exact registration cleanup, per-target dispatch states, local/fresh/run
   control, and fixed-grace drain. Do not alter spawn waiter delivery.
6. **Drive effects and compatibility cutover (B-006, B-007).** Add Driver-owned
   effect transactions; seeded temporary indexes; preserved hooks/signing;
   source/state CAS; unconditional task mutation locking and digest replacement;
   exact crash recovery; then make normalized terminal state drive legacy
   completion/status/resume. Remove the old abandoning timer only after every
   adapter uses the new contract.
7. **Finalization and operator contract (B-010 plus observation behaviors).** Add
   concrete no-runnable outcomes, complete stop/control/effect/event diagnostics,
   cancellable grace waits, uniform summaries, projection retries, and
   replacement-run guidance.
8. **Preservation and slice closure (B-012).** Walk AC-001–AC-013 and AC-018
   through supported Chain/Drive modes and backends, including no-process gaps,
   host suspension, local-controller fresh observation, nested runs, broker
   registration failure, effect crashes at every phase, dead/live lock recovery,
   torn/corrupt event tails, task update contention, real-index preservation,
   hook/signing behavior, foreign Drive terminalization, cancelled observers,
   and cursor paging. Confirm AC-014–AC-017 remain follow-ups and no AC-015
   delivery change landed early.

Every code stage begins from an observable failing behavior, adds the minimum
implementation, and refactors toward these boundaries. Discovery of a
result-only backend, fabricated host control, project exec before registration,
per-process-only clock, store-executed Driver callback, unfenced publication,
reverse lock order, unrecoverable intent/tail, raw lifecycle writer,
compatibility overwrite, or collision with INV-001 through INV-007 stops the
stage and invokes the deviation protocol.
