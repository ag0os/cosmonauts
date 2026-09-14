## Purpose

Cosmonauts can leave an executing agent step in `running` forever. The sampled
Quality Manager failures have three observable tails: an unreturned nested
`chain_run`, a text-only turn ending inside the spawn-completion wait, and a
bare `turn_start`. The provider-side trigger remains unknown because the
affected chain sessions were not persisted, but the shared defect is known: no
layer owns an enforceable deadline, cancellation settlement, attempt fencing,
and durable diagnostic evidence while work is active.

This slice establishes liveness as a universal durable node-attempt contract
before declared graph routing or swarm coordination. It fixes shared execution
seams and retains the current Chain, Drive, spawn, and Quality Manager policy
shapes.

## Intent

Every in-scope durable node attempt must either complete normally or reach an
honest durable terminal or blocked state under an explicit liveness policy.
The contract must not depend on whether Claude Code, Codex, Pi, or a future
harness initiated the run, nor on the selected worker transport or model.

The following invariants are binding:

- **INV-001 — Current-token ownership:** only the current, unsuperseded opaque
  attempt token may renew or reacquire its lease, record activity, or finalize.
  Expiry is loss-of-health evidence; it does not itself revoke the token or
  authorize a competing mutating attempt. A new claim rotates the token only
  after prior execution settlement/death is confirmed or an operator explicitly
  starts a replacement with that evidence. Expiry has exactly one terminal
  consequence: a scheduler pass that observes an expired lease it does not hold,
  carrying no settlement evidence and surviving any clock-discontinuity rebase,
  quarantines the attempt into terminal-blocked and revokes its token without
  starting a replacement. Quarantine is not gated by liveness mode: it cancels
  nothing and starts nothing, so it applies under shadow and enforce alike.
- **INV-002 — Ownership, activity, and host availability differ:** heartbeat
  proves claim ownership; `lastActivityAt` records useful execution progress;
  a detected host clock discontinuity is recorded separately and rebases idle
  evaluation. Heartbeat alone never resets idle time.
- **INV-003 — Cancellation is settlement-based:** cancellation is confirmed
  only when the attempt result settles within grace or the backend reports
  equivalent settlement. A resolved `cancel()` acknowledges a request but is
  not confirmation. Every unconfirmed attempt is treated as potentially
  mutating, becomes terminal-blocked in this slice, and cannot be retried in the
  same run.
- **INV-004 — Deadlines are explicit policy:** useful activity resets an idle
  deadline. A hard deadline is optional and has no universal default; when a
  frontend requires one, it is mapped into scheduler policy with its source
  recorded rather than implemented by an abandoning backend-local race.
- **INV-005 — Terminal state is monotonic:** leaving `running` revokes the
  attempt token, terminal step states are absorbing, rejected late results are
  retained as non-promotable evidence, and a run terminalizes when no remaining
  step can become runnable.
- **INV-006 — One capability-declared contract:** backend mechanisms may differ,
  but scheduler deadline policy and lifecycle meanings do not. Unsupported
  cancellation or activity capabilities are declared and handled explicitly.
- **INV-007 — Durable evidence owns continuity:** in-scope attempts persist
  identity, holder execution evidence, activity, cancellation requests,
  sessions, events, full opaque results, normalized results, and artifacts
  outside the coordinator context that initiated them.

Provenance note: the quarantine rule in INV-001 and AC-014 was human-ratified
2026-09-13 and made mode-independent 2026-09-14. The remaining INV-001 and
INV-003 wording was drafted by codex from the independent review and accepted by
the human on 2026-09-14; these invariants are ratified ground and change only by
human decision.

If availability conflicts with ownership or cancellation safety, INV-001 and
INV-003 win. Recovery from a terminal-blocked attempt is an operator-started
replacement run after the prior execution identity is confirmed dead.

## Users

- Operators using `run status` or `run watch` who need to distinguish active,
  idle, shadow-expired, cancelling, blocked, and terminal work.
- External coordinators in Claude Code, Codex, and future harness adapters.
- Pi-hosted coordinators and workers using supported model providers.
- Workflow authors, including Quality Manager, who need bounded failure without
  relying on one conversation context.

## User Experience

In enforcement mode, a healthy attempt continues while it emits useful
activity. A silent attempt crosses its idle deadline, durably records a
cancellation request, receives one abort request, and then terminalizes or
blocks after bounded grace. In shadow mode, the same deadline produces durable
`would-cancel` evidence without changing execution.

Status and watch evidence identify the attempt, current token state, persisted
holder execution identity, last heartbeat, last useful activity, deadline
source and mode, cancellation settlement, session reference, and rejected late
result. Host suspension is not misreported as worker idleness: a detected clock
discontinuity is recorded and idle time is rebased.

Quality Manager retains its current workflow in this slice. Its outer durable
chain attempt may run longer than an idle window while active, but a synthetic
silent step produces a bounded, diagnosable outcome. Enabling a general idle
default remains a separate human decision based on live post-instrumentation
evidence.

## Acceptance Criteria

- **AC-001:** In enforcement mode, a silent attempt crossing its idle deadline
  persists `cancellationRequested`, aborts once, and reaches a durable terminal
  or explicitly blocked outcome within cancellation grace.
- **AC-002:** Useful normalized activity resets idle time, heartbeat does not,
  active work survives beyond the idle window, and shadow mode records the
  outcome without cancelling work.
- **AC-003:** Production scheduling renews a five-minute lease every minute.
  Only the current unsuperseded token can renew/reacquire, record activity, or
  finalize; expiry is never treated as fresh external work and never alone
  authorizes a competing mutating claim.
- **AC-004:** Claims, token rotation, attempt-id allocation, activity updates,
  finalization, and event sequence allocation are conditional operations under
  crash-safe per-step or per-run locks based on the `entity-file-lock` protocol;
  `.init.lock` is not extended for this purpose.
- **AC-005:** Transitions out of `running` revoke the token, terminal statuses
  are absorbing, the Drive resume projector cannot overwrite a live claim, and
  rejected late results remain durable but cannot be selected as terminal
  attempt results.
- **AC-006:** Cancellation is confirmed only by result settlement within grace
  or an explicit equivalent backend signal. Unconfirmed attempts are treated as
  mutating, end terminal-blocked, and require a replacement run after their
  persisted execution identity is confirmed dead.
- **AC-007:** In-scope Pi attempts use attempt-scoped persisted sessions with an
  attempt session reference, deterministic explicit settings, a pre-prompt
  cancellation latch, and the full final assistant result stored as attempt
  evidence/artifact.
- **AC-008:** A live session-to-attempt registry attributes model, tool, child,
  nested-run, and activity-capable process evidence to the owning attempt;
  post-run replay is diagnostic and is not used as a live producer.
- **AC-009:** Completion-wait timeout or cancellation removes the exact waiter
  without cancelling a healthy child. Child cancellation occurs only when the
  owning attempt is cancelled; late and multi-child completions are delivered
  once or buffered without throwing or corrupting lineage.
- **AC-010:** Every registered backend declares cancellation, activity, and
  timeout capabilities. Drive's current task cap is mapped to explicit
  `hardTimeoutMs` scheduler policy, its backend-local abandoning timer is
  removed, and late task-side effects cannot outlive scheduler settlement.
- **AC-011:** A run terminalizes when no pending step can become runnable,
  including a failed non-final step with only dependent work remaining.
- **AC-012:** A synthetic silent Quality Manager step executed through
  `runDurableChain` reaches a bounded terminal/blocked outcome with session,
  activity, deadline, and cancellation evidence; its topology is not decomposed
  in this slice.
- **AC-014:** A scheduler pass that observes an expired lease it does not hold,
  with no settlement evidence and after any detected clock discontinuity has
  rebased idle evaluation, quarantines the attempt: the step becomes
  terminal-blocked recording `lease_expired` and the persisted holder identity,
  the token is revoked so late writes stay non-promotable, and no replacement
  attempt starts in that run. Quarantine applies in both liveness modes, because
  it cancels no live work; only deadline-driven cancellation is shadowed.
- **AC-013:** The 200-character chain summary contract, spawn depth/concurrency
  rejection, Drive task policy, and coordinator/harness neutrality remain
  unchanged except for the explicit Drive timeout mapping in AC-010.

## Scope

Included populations:

- loop-free chains and the outer durable Quality Manager attempt compiled to
  the durable scheduler;
- Drive task and finalizer steps already executed on the durable scheduler;
- descendants owned by those attempts, including inline coordinator/nested
  compatibility paths reached through registered child handles; and
- every production backend registered for those populations.

Included changes:

- Store-owned claims, tokens, locks, lease renewal/reacquisition, activity,
  terminal transitions, projector guards, and event sequencing.
- Scheduler-owned idle/explicit-hard policies, shadow/enforce mode, host-clock
  discontinuity handling, bounded cancellation, and impossible-graph
  finalization.
- Backend capabilities and Drive timeout conformance.
- Attempt-scoped Pi persistence, explicit settings, live activity attribution,
  cancellation latches, descendant ownership, and completion-waiter cleanup.
- Quality Manager liveness proof, operator evidence, metrics, and documentation.

Excluded:

- Finding or fixing the provider-side trigger for silent streams unless new
  persisted evidence creates a separately approved fix.
- Automatic retry or takeover of an unconfirmed mutating attempt; process
  isolation and cross-run replacement fencing are later work.
- Standalone interactive spawns that are not owned by a durable attempt, and a
  public remote `RunControl`/attach/cancel protocol; `drive-envelope` owns that
  public boundary.
- Decomposing Quality Manager, graph syntax, routers, joins, declared fan-out,
  loops, durable messaging, or swarm coordination.
- Changing the pinned Pi version, forking Pi, or adding a provider stream parser.
- Queueing spawn-limit overflow, raising spawn limits, worktrees, or parallel
  mutable execution.

## Assumptions

- Pi remains the first integration surface. Implementation must re-audit pinned
  Pi cancellation, session, settings, and lifecycle APIs before changing code.
- The file store can implement scoped conditional operations by adapting the
  existing crash-safe `lib/entity-file-lock.ts` protocol; durable fsync is not a
  requirement for this slice.
- Lease duration remains five minutes with a one-minute production renewal
  default. Fifteen minutes is only a candidate idle default to evaluate in
  shadow mode, not an enabled universal constant.
- A detected clock discontinuity can conservatively rebase idle evaluation
  without proving what the worker did while the host was suspended.
- The 200-character summary remains orientation only; workflow data is not
  forced through it.

## Open Questions

- Does live post-activity-instrumentation evidence justify a fifteen-minute idle
  default, or do backend populations need different declared policies? A human
  decides this after the Quality Manager proof.
- Will preserved session and result evidence identify a reproducible
  provider-side cause for silence? That diagnosis may create a separate fix but
  does not weaken this liveness contract.