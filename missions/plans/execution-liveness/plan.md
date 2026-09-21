---
title: 'Execution Liveness: bounded, fenced, diagnosable node attempts'
status: active
createdAt: '2026-09-11T13:24:20.117Z'
updatedAt: '2026-09-13T04:01:16.041Z'
---

## Overview

Implement Wave A of the forward orchestration architecture: a store-owned,
activity-aware, cancellable, fenced, and diagnosable lifecycle for the durable
node populations named in the spec. This is the reliability prerequisite for
declared graph control and later swarms. Existing Chain, Drive, spawn, and
Quality Manager policy remains at the frontend; the shared runtime gains honest
bounded lifecycle semantics.

Implementation proceeds from persistence authority outward: build atomic store
operations, migrate scheduler writers, add watchdog/cancellation semantics,
conform the Drive adapter, integrate Pi sessions and live activity, own
descendants, verify Quality Manager, and only then ask a human whether to enable
an idle default.

## Architecture Context

Source of truth: `missions/architecture/orchestration-future.md`.

This plan implements the Wave-A liveness decision (`D-007`) and advances the
target one-runtime boundary (`D-001`) for the scoped durable populations. It
provides prerequisites for—and preserves compatibility with—the future
coordinator/continuity/portability decisions `D-009`, `D-010`, and `D-011`; it
does not claim to implement their public control or package contracts.

Current exceptions are explicit: coordinator-bearing chains still use the
inline chain runner; dynamic `spawn_agent` still launches detached work outside
the scheduler; the spawn graph compiler has no production caller; and Drive has
adapter-owned timeout/task-write seams. Wave A closes only the liveness bypasses
named in Scope. It does not merge Chain topology with the full Drive task loop.

The public coordinator-neutral control port remains owned by `drive-envelope`.
The `autonomy-host` plan may share a future host process, but its wake-state is
not the run store and it must not own node-attempt claims, deadlines, or
cancellation.

## Decision Log

- **D-001 — Current unsuperseded token is authority.** The store mints an opaque,
  process-private token atomically at claim. Only that token may renew/reacquire,
  record activity, or finalize. Expiry is health evidence, not revocation or
  automatic takeover authority. This supersedes the 2026-09-11 wording that
  required an unexpired token.
- **D-002 — Crash-safe conditional file-store operations.** Add a per-step lock
  based on `entity-file-lock` for claim/attempt/activity/finalize operations and
  a per-run lock for event sequence allocation. Do not reuse or extend
  `.init.lock`. Attempt IDs are allocated under the claim lock; `holderId` is
  diagnostic only.
- **D-003 — Explicit activity and monotonic status.** `lastActivityAt` lives on
  the current attempt and is updated through one token-conditional coalescing
  operation. Leaving `running` revokes the token; terminal step statuses are
  absorbing; rejected results are opaque, durable, and non-promotable. The
  Drive projector is an excluded writer behind a store guard.
- **D-004 — Scheduler policy, transport mechanism.** The scheduler resolves
  idle/hard/grace policy; transports implement activity and cancellation
  mechanisms. Cancellation confirmation means result settlement within grace
  or an explicitly equivalent signal, never merely `cancel()` resolution.
- **D-005 — Shadow before enforcement.** Liveness policy declares
  `shadow | enforce`; shadow is the default. Lease renewal defaults to one
  minute inside a five-minute lease. A detected host clock discontinuity is
  recorded and rebases idle evaluation rather than firing a deadline.
- **D-006 — Blocked is terminal in Wave A.** Every unconfirmed attempt is treated
  as mutating. It becomes terminal-blocked and cannot be replaced in the same
  run. Recovery is an operator-started replacement run after persisted execution
  identity proves the old execution dead.
- **D-007 — Run-owned Pi evidence.** Durable agent attempts use file-backed
  run/step/attempt sessions, explicit settings reaching the resource loader, a
  persisted session reference, and an opaque full result/artifact before
  normalized projection. Plan linkage is metadata, not a persistence gate.
- **D-008 — Descendants are handle-owned; waits are observational.** Register
  descendant handles at spawn time and latch attempt cancellation before every
  prompt. The five-minute completion wait is not a child deadline; expiry or
  caller cancellation removes the waiter, while only owning-attempt cancellation
  cancels children.
- **D-009 — Explicit Drive conformance.** Replace Drive's backend-local
  abandoning timer with scheduler `hardTimeoutMs` policy whose source is
  persisted. Guard or settle late TaskManager writes. Remove unused ambiguous
  `RunPolicy.timeoutMs` writers instead of silently reinterpreting them.
- **D-010 — Graph completion is reachability-aware.** Finalize a run once no
  remaining node can become runnable, including failure with only blocked
  dependents; do not wait forever for impossible pending nodes.
- **D-011 — Independent review amendment, 2026-09-13.** The independent review's
  store, cancellation, Drive, session, waiter, rollout, scope, and architecture
  corrections are accepted as amended here. The suggested automatic claim after
  lease expiry is narrowed by D-001/D-006: mere expiry cannot safely replace an
  unconfirmed potentially mutating attempt. D-001 through D-010 supersede the
  corresponding 2026-09-11 plan wording. Decided by: codex-proposed,
  2026-09-13; human-accepted 2026-09-14 (derived). The expiry narrowing in
  D-001/D-006 deviated from review F-003 and is resolved by D-012.

- **D-012 — Expiry quarantine closes the crashed-holder gap.** Expiry never
  authorizes a competing claim, but a scheduler pass that observes an expired
  lease it does not hold, with no settlement evidence and after any detected
  clock discontinuity has rebased idle evaluation, quarantines the attempt: the
  step becomes terminal-blocked with reason `lease_expired` and the persisted
  holder identity, the token is revoked (late writes remain non-promotable per
  B-001/B-014), no replacement attempt starts, and the run finalizes under
  B-018. Quarantine is not gated by liveness mode, because it cancels no live
  work and starts none; shadow gates deadline-driven cancellation only. Recovery
  remains an operator-started replacement run. This closes the gap D-001/D-006
  opened by dropping review finding F-003's post-expiry state without naming a
  replacement. Decided by: human, 2026-09-13 (ratified); amended to
  mode-independent by human, 2026-09-14 (ratified).

- **D-013 — B-011 restated in the observer / entry point / outcome shape, 2026-09-20.**
  Notation only: the substance is AC-009's, unchanged. The `Seam`, `Test`,
  and `Marker` fields are dropped under the `framework-health` plan's format
  decisions;
  B-011 is the single behavior restated ahead of that plan's format trial.
  The other behaviors keep the old notation until the trial reports.
  - Decided by: derived from the `framework-health` plan's human-ratified
    format decision, 2026-09-20

- **D-014 — Seventeen more behaviors restated, 2026-09-21.** Notation only:
  each keeps its `AC-###` source and that criterion's substance. B-001, B-002,
  B-004, B-005, B-006, B-008, B-009, B-010, B-012, B-013, B-014, B-015, B-017,
  B-018, B-019, B-020, and B-021 now state an observer, a shipped entry point,
  and an outcome, and no longer name source files, tests, or markers.
  Mechanism that was in their text is kept under Design, "Mechanism the
  behaviors no longer name". B-003, B-007, and B-016 are untouched pending a
  human ruling on whether they are behaviors or design invariants.
  Corrected the same day after plan review round 1: B-012 had drifted from
  AC-012's synthetic step to a claim about production runs (PR-007); B-011 and
  B-012 now also cite AC-013; Implementation Order follows the TASK-683
  dependency (PR-003); a carried-over test checklist is removed (PR-009).
  - Decided by: human, 2026-09-21

## Behaviors

### B-001 — Obsolete attempts cannot commit terminal state

- Source: AC-005
- Observer: an operator inspecting a run after an interrupted attempt was superseded and the old attempt reported late
- Entry point: `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the step and the run show the state the current owner produced, unchanged by the late report; the late result is retained in full as rejected evidence and is never presented as the step's terminal result

### B-002 — Current owners renew or reacquire without self-fencing

- Source: AC-003
- Observer: someone whose run continues through a long attempt, a host suspension, or a resume that superseded the attempt
- Entry point: `cosmonauts run chain`, `cosmonauts run drive`, and resume, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the attempt that still owns the step keeps ownership by renewing or reacquiring — including after its lease expired while it could not run — and carries on; a superseded attempt can no longer change anything; lease expiry is not treated as fresh external work, and expiry alone never starts a second attempt mutating the same step

### B-003 — Heartbeat never masquerades as useful activity

- Source: AC-002, AC-003
- Context: an attempt renews ownership without execution activity
- Action: the scheduler evaluates idle policy
- Expected: heartbeat advances independently, `lastActivityAt` does not, and the attempt becomes idle according to mode
- Seam: `lib/durable-runtime/types.ts`; `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/backends.ts`
- Test: `tests/durable-runtime/scheduler-liveness.test.ts` > `keeps ownership heartbeat separate from useful activity`
- Marker: `@cosmo-behavior plan:execution-liveness#B-003`

### B-004 — Enforced idle deadlines request bounded cancellation

- Source: AC-001
- Observer: someone running a chain or Drive task in enforcement mode whose agent goes silent
- Entry point: `cosmonauts run chain` and `cosmonauts run drive`, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: once the attempt has been silent past its enforced idle deadline, the run records that cancellation was requested and from what source, the attempt is asked to abort exactly once, and within the cancellation grace the step is either settled or explicitly terminal-blocked — it does not stay `running`

### B-005 — Useful activity permits long-running attempts

- Source: AC-002, AC-010
- Observer: someone running a long task whose agent keeps doing useful work past the idle window, with no explicit hard deadline set
- Entry point: `cosmonauts run chain` and `cosmonauts run drive`, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the task is not cancelled: useful activity resets idle time, and wall-clock duration alone never cancels an attempt

### B-006 — Unconfirmed cancellation blocks unsafe replacement

- Source: AC-006
- Observer: an operator whose cancelled attempt does not settle within the cancellation grace
- Entry point: `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the step ends terminal-blocked showing the attempt's execution identity and evidence, its ownership is revoked, and no replacement attempt starts in that run — recovery is a new run once the persisted execution identity is confirmed dead

### B-007 — Registered backends declare one liveness contract

- Source: AC-010
- Context: scheduler-launched chain, spawn, Drive-task, and finalizer attempts select registered backends
- Action: run start validates their capabilities and policies
- Expected: cancellation, activity, timeout, mutation, and settlement capabilities are explicit; unsupported combinations fail or degrade by recorded policy, never hidden fallback
- Seam: `lib/durable-runtime/backends.ts`; `lib/durable-runtime/run-start.ts`; `lib/driver/drive-scheduler-backend.ts`
- Test: `tests/durable-runtime/backend-liveness-contract.test.ts` > `applies one liveness contract to every registered backend`
- Marker: `@cosmo-behavior plan:execution-liveness#B-007`

### B-008 — Durable Pi attempts persist deterministic sessions

- Source: AC-007
- Observer: an operator inspecting or resuming an attempt that was started without a plan slug
- Entry point: `cosmonauts run chain` and the attempt's persisted session and evidence in the run record
- Outcome: the attempt has a file-backed session, referenced from the attempt and independent of any plan metadata; the explicit settings it was given are the ones the session was built with; a cancellation requested before the first prompt prevents that prompt; and the full final assistant text is retained as attempt evidence

### B-009 — Live session and descendant activity reaches the attempt

- Source: AC-008
- Observer: someone running under enforcement whose agent is busy through model output, tools, owned children, nested runs, or an activity-capable process
- Entry point: `cosmonauts run chain`, `cosmonauts run drive`, and the `spawn_agent` tool, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: that work counts as the owning attempt's activity while it happens, so the attempt is not judged idle while its descendants work; evidence recovered by post-run replay appears as diagnostics only and never counts as live activity

### B-010 — Attempt cancellation reaches registered descendants

- Source: AC-006, AC-009
- Observer: an operator or agent cancelling an attempt that spawned agents or nested runs in earlier turns
- Entry point: cancellation of a run or attempt started through `cosmonauts run chain`, `cosmonauts run drive`, or `spawn_agent`, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: every descendant the attempt registered receives exactly one cancel request, and the parent's cancellation is reported as confirmed only once those descendants' results have settled

### B-011 — A parent that stops waiting neither loses nor falsifies a child's result

- Source: AC-009, AC-013
- Observer: an agent that called `spawn_agent` one or more times from an interactive session and whose wait for a completion expired or was cancelled before the child finished
- Entry point: the `spawn_agent` tool and the completion follow-up messages it promises
- Outcome: giving up the wait ends only that wait — a healthy child keeps running and is not reported as failed or timed out; when it later finishes, the parent receives its real result exactly once, either on its next wait or buffered for a later one; with several children, one abandoned wait neither swallows nor duplicates another child's completion; a completion arriving after nobody is waiting does not throw and is attributed to the right spawn. A child is cancelled only when the attempt that owns it is cancelled. Existing spawn depth and concurrency rejection is unchanged.


### B-012 — A silent Quality Manager durable step is bounded

- Source: AC-012, AC-013
- Observer: the maintainer who will decide whether to enable idle enforcement, reading the evidence this step produces
- Entry point: a synthetic silent Quality Manager step run through the durable chain runner under an enforced test policy, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: that step reaches a bounded terminal or blocked state with session, activity, deadline, and cancellation evidence in the run record; the Quality Manager's stage topology is not decomposed and its 200-character summaries are unchanged. This proves the synthetic path only — whether production Quality Manager runs are bounded depends on the enforcement decision

### B-013 — Attempt claims are atomic and crash-safe

- Source: AC-004
- Observer: someone who starts or resumes a run while another invocation targets the same step, or after the process holding it was killed
- Entry point: concurrent `cosmonauts run` invocations and resume, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: exactly one attempt claims the step, with one attempt id and one ownership token; a finalize never interleaves with a claim; and a lock whose holder died is reclaimed rather than wedging the run

### B-014 — Terminal statuses absorb late writes

- Source: AC-005
- Observer: an operator inspecting a step that has already finished
- Entry point: `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: once a step has left `running`, later writes from the scheduler, the Drive resume projector, or a late backend leave the shown terminal state unchanged; the step's ownership is revoked; and rejected evidence is never shown as the step's terminal result

### B-015 — Event sequence allocation is cross-instance unique

- Source: AC-004
- Observer: a person or program following a run's events with a cursor
- Entry point: `cosmonauts run watch --since-seq <n>`
- Outcome: every event in a run has a unique sequence number and sequence order matches persisted order, even when several processes append to the same run at once — so a follower never misses an event or sees one twice

### B-016 — Cancellation confirmation follows result settlement

- Source: AC-006
- Context: `cancel()` resolves while the attempt result remains pending, or result settles within grace
- Action: the scheduler classifies cancellation
- Expected: acknowledgement alone remains unconfirmed; settled result confirms the hop; all hops are recorded
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/backends.ts`
- Test: `tests/durable-runtime/scheduler-liveness.test.ts` > `confirms cancellation only after the attempt result settles`
- Marker: `@cosmo-behavior plan:execution-liveness#B-016`

### B-017 — Host suspension does not manufacture worker idleness

- Source: AC-003
- Observer: a user who suspended their machine in the middle of a run and reopened it
- Entry point: `cosmonauts run chain` and `cosmonauts run drive`, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the run records a clock discontinuity; the attempt that still owns its step reacquires and continues; idle evaluation restarts from the resume rather than counting the time the host was asleep; and nothing assumes the worker made progress meanwhile

### B-018 — Impossible pending work cannot wedge run finalization

- Source: AC-011
- Observer: someone watching a run in which a non-final step failed and every remaining step depends on it
- Entry point: `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the run reaches its honest terminal outcome instead of remaining `running`

### B-019 — Drive hard deadlines use scheduler policy

- Source: AC-010
- Observer: someone running Drive with a declared task time cap
- Entry point: `cosmonauts run drive`, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: the cap is enforced as the run's hard deadline with its source recorded; no backend-local timer walks away from a task that is still running; and the task's side effects are settled or guarded before the run finalizes

### B-020 — Shadow mode never cancels attempts

- Source: AC-002
- Observer: an operator who enabled shadow mode to see what enforcement would do
- Entry point: the liveness mode setting, observed through `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: attempts that cross an idle or hard deadline keep running, with their descendants, exactly as before; durable `would-cancel` evidence and metrics are recorded for the operator to read

### B-021 — Expired unowned attempts are quarantined, not replaced

- Source: AC-014
- Observer: an operator resuming or inspecting a run whose attempt's holder crashed
- Entry point: `cosmonauts run status` and `cosmonauts run watch`, and the persisted run record they read
- Outcome: after any detected clock discontinuity has been rebased, a `running` step whose lease expired under a holder this scheduler does not own, with no settlement evidence, becomes terminal-blocked recording `lease_expired` and the holder's identity; its ownership is revoked so late writes stay rejected; no replacement attempt starts in that run; the run finalizes; and the outcome is identical in shadow and enforce modes

## Design

### Store authority and status lattice

Extend attempt records with a store-minted fencing token, `lastActivityAt`,
optional session reference, persisted holder execution identity, deadline mode
and source, `cancellationRequested`, settlement evidence, and opaque result.
Expose conditional RunStore operations for claim, renew/reacquire, coalesced
activity, and finalize. Adapt the crash-safe link-lock protocol in
`lib/entity-file-lock.ts` for step-scoped operations and a run-scoped event
allocator; do not reuse `.init.lock`. Allocate attempt identity inside claim and
remove scheduler/Drive count-based allocators and pass-start holderId renewal.

Expiry makes a foreign running lease non-fresh and starts recovery evaluation,
but cannot prove a mutating process dead. An unsuperseded owner can reacquire
after suspension. A competing token requires confirmed settlement/death or an
explicit operator replacement with evidence. Any transition out of `running`
revokes the token. Terminal states absorb projector and late-backend writes;
rejected full results remain diagnostic but cannot be promoted.

### Watchdog, cancellation, and run completion

Resolve lease, idle, optional hard, grace, and `shadow | enforce` mode in the
scheduler. Default production renewal to one minute for the five-minute lease.
Persist useful activity separately. Detect implausible wall-clock jumps relative
to the scheduler's monotonic observation, record suspension, and rebase idle
evaluation.

In enforce mode, persist cancellation intent before signalling. Cancel once,
then classify each hop by result settlement within grace; `cancel()` resolution
is acknowledgement only. Unconfirmed attempts end terminal-blocked. Reserve no
automatic same-run recovery. Update finalization so a run terminates when no
remaining step is runnable or can become runnable.

### Backend and Drive conformance

Extend backend registration/context with cancellation, live-activity,
hard-timeout, mutation/isolation, settlement, identity, token, and evidence
capabilities. Inventory every production registration. The scheduler owns
deadline policy; protocol-specific backends own mechanisms.

Map Drive's existing task cap to explicit scheduler `hardTimeoutMs` with source
preserved. Remove its local `Promise.race` timer and ensure the backend result
and TaskManager side effects settle or are fenced before finalization. Guard the
Drive resume projector against overwriting a live token. Remove ambiguous unused
`RunPolicy.timeoutMs` writers; retain `idleTimeoutMs`, `hardTimeoutMs`, and add
`cancellationGraceMs` plus mode.

### Pi evidence, live activity, and descendants

Re-audit pinned Pi. Construct durable-attempt sessions by run/step/attempt,
supply explicit settings to both session and resource-loading paths, persist a
session reference before work, and store full final assistant text/result as an
attempt artifact/evidence record. Do not broaden this to unrelated interactive
sessions.

Create a live session-to-attempt registry. Normalize Pi message/tool events and
owned child/nested-run activity while work is running; post-run event replay is
diagnostic only. Register descendant handles at spawn time. Because Pi's tool
signal is per run and abort is not latched, the owning attempt signal is the
durable source and is checked before every prompt. Treat an abort-resolved Pi
prompt as cancellation unless successful completion evidence says otherwise.

Replace bare waiter resolvers with removable records. Wait expiry is an
observation timeout, not a child deadline. It removes its exact waiter; only
owning-attempt cancellation reaches child handles. Make multi-child, cancellation,
and late-completion delivery idempotent and lossless.

### Rollout and evidence

Ship shadow behavior first. Record activity gaps, would-cancel decisions,
terminalization latency, cancellation settlement, rejected writes, suspension,
and session availability per backend population. B-012 proves only the observed
silent Quality Manager durable-step tail. Active-long behavior is already B-005.
After live post-B-009 evidence exists, a separate human task decides whether and
where to enable the candidate idle default.

Quality Manager decomposition remains deferred until artifact handoff and
declared graph control exist. Its separate unnamespaced-review-file defect stays
owned by `qm-chain-safety`.

### Boundaries and non-goals

Carried over from the plan's former gate table, which the plan format no
longer has; gates are resolved from the runtime at sign-off.

- Boundaries: the store owns conditional state; the scheduler owns policy;
  transports own mechanisms; Drive and the inline compatibility seams do not
  bypass fencing.
- Non-goals: reuse Pi and entity-lock primitives; no provider parser, no
  Quality-Manager-only runtime, no public RunControl API, no graph router, no
  spawn queue, and no automatic unsafe takeover.

### Mechanism the behaviors no longer name

The behaviors were restated on 2026-09-21 to say what an observer sees. These
mechanism details came out of their text and stay binding here, as design:

- Late terminal writes are rejected against the current ownership token, and
  rejected evidence can never become `terminalAttemptForStep` (B-001, B-014).
- Attempt id and token are minted once under an `entity-file-lock`-style
  per-step lock; event sequence numbers are allocated under the per-run lock
  (B-013, B-015).
- A deadline crossing persists `cancellationRequested` with its source before
  the abort is sent (B-004).
- In-scope Pi sessions are built with explicit settings that reach Pi resource
  loading, and a cancellation latch is installed before the first prompt
  (B-008).
- Useful activity conditionally advances the owning token's `lastActivityAt`
  through the live session-to-attempt registry (B-009).
- A Drive task cap maps to `hardTimeoutMs` scheduler policy with its source
  recorded (B-019).

## Files to Change

- `lib/entity-file-lock.ts` — expose/adapt the proven crash-safe lock protocol.
- `lib/durable-runtime/types.ts` — token, activity, identity, mode, policy,
  cancellation, session, result, and lattice contracts.
- `lib/durable-runtime/file-store.ts` — conditional step operations and locked
  event sequence allocation.
- `lib/durable-runtime/scheduler-state.ts` — expiry, reacquisition, terminal
  lattice, and unreachable-pending transitions.
- `lib/durable-runtime/scheduler.ts` — remove raw writers/pass renewal; add
  renewal, suspension-aware watchdog, cancellation settlement, and finalization.
- `lib/durable-runtime/backends.ts`; `lib/durable-runtime/run-start.ts`;
  `lib/durable-runtime/controller.ts`; `lib/durable-runtime/index.ts` — policy,
  capabilities, attempt context, status, and exports.
- `lib/driver/drive-scheduler-backend.ts`; `lib/driver/durable-steps.ts`;
  `lib/driver/backends/types.ts` and production registrations — Drive timeout,
  projector, side-effect, and capability conformance.
- `lib/orchestration/types.ts`; `lib/orchestration/session-factory.ts` — durable
  attempt identity, explicit Pi settings, session references, and evidence.
- `lib/orchestration/agent-spawner.ts`; `lib/orchestration/chain-event-adapter.ts`;
  `lib/orchestration/durable-chain-runner.ts` — live activity registry, signal
  use, Pi result semantics, and nested handles.
- `lib/orchestration/activity-bus.ts` — attribute child activity to the owning
  attempt instead of a process-global bus nothing durable consumes.
- `lib/orchestration/spawn-tracker.ts`;
  `lib/orchestration/spawn-completion-loop.ts` — removable/idempotent waiters.
- `domains/shared/extensions/orchestration/spawn-tool.ts`;
  `domains/shared/extensions/orchestration/chain-tool.ts` — owning-attempt child
  registration and explicit policy mapping.
- `domains/shared/skills/spawning/SKILL.md`; `domains/shared/skills/drive/SKILL.md`;
  `docs/orchestration.md` — operator and author contracts.

## Risks

- A file-store fencing primitive may prove impossible without a daemon. First
  prototype claim/finalize interleaving and killed-holder reclaim. Stop and amend
  the store architecture if the invariant cannot be met; fsync is not required.
- Missing live activity sources can create false idle decisions. Keep shadow as
  default and require representative per-backend evidence before enforcement.
- Pi abort or a process backend may not settle. Grace remains bounded and records
  terminal-blocked state; do not claim cancellation from acknowledgement.
- Treating all unconfirmed attempts as mutating favors safety. Automated recovery
  requires later execution isolation or independently provable process death.
- The inline chain and detached spawn exceptions make scope easy to overstate.
  Tests must identify which paths are scheduler-supervised and which are only
  owned descendants.
- Drive's local timeout removal exposes previously abandoned promises. The Drive
  task must settle/fence TaskManager writes before moving deadline ownership.
- This work overlaps `autonomy-host` only at future host process lifecycle. Keep
  run-store authority and episodic wake-state distinct.

Independent latent issues—cross-run replacement fencing, a `none` task-timeout
value, unbounded finalizer retry, and silently skipped missing backend mappings—
are recorded in the review disposition but are not silently absorbed here.

## Implementation Order

1. `TASK-677`: implement atomic store ownership, status lattice, projector guard,
   and event sequencing (B-001, B-013, B-014, B-015).
2. `TASK-684`: migrate scheduler writers to conditional operations and wire
   renewal, activity, and expiry/reacquisition semantics (B-002, B-003).
3. `TASK-678`: implement shadow/enforce watchdog, suspension handling,
   settlement-based cancellation, expiry quarantine, safe blocked recovery, and
   impossible-graph finalization (B-004, B-005, B-006, B-016, B-017, B-018,
   B-020, B-021).
4. `TASK-683`, after `TASK-678`: repair completion waiter ownership and
   delivery without changing child lifetime (B-011). It follows the watchdog
   because, once wait expiry stops failing children, a hung child keeps its
   parent waiting until a hard deadline exists (human decision, 2026-09-21).
5. `TASK-682`: conform all backends and move Drive's cap into scheduler policy
   with guarded/settled side effects (B-007, B-019).
6. `TASK-679`: persist Pi attempt sessions/results and feed live activity through
   a session-to-attempt registry (B-008, B-009).
7. `TASK-680`: own spawned/nested descendant handles and latched cancellation
   (B-010), building on the waiter repair.
8. `TASK-681`: prove the synthetic silent Quality Manager durable-step path,
   metrics, status/watch, and documentation in shadow mode (B-012).
9. `TASK-685`: human review of live evidence and explicit enable/revise/defer
   decision for idle enforcement; this task is not Drive-able.

## Deviation Protocol

If implementation discovers a new invariant, weakens ownership/cancellation
safety, changes frontend policy, expands the in-scope populations, or requires a
public coordinator API, stop and amend the spec/plan with human agreement. If it
discovers a local implementation detail within these ratified behaviors, record
it in the owning task and proceed.
