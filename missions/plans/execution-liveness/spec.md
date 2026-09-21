> **DRAFT — awaiting human ratification.** Revised 2026-09-21 by the doer
> session after the human ruled on three collisions in the previous text
> (`ruling-packet.md`). The previous spec is in git at `8ab44d4`. Until the
> human ratifies this draft, nothing in `## Intent` is ratified ground.

## Purpose

Cosmonauts can leave an executing agent step in `running` forever. The sampled
Quality Manager failures have three observable tails: an unreturned nested
`chain_run`, a text-only turn ending inside the spawn-completion wait, and a
bare `turn_start`. The provider-side trigger remains unknown because the
affected chain sessions were not persisted, but the shared defect is known:
nothing owns a deadline that is actually enforced, nothing confirms that a
cancelled execution stopped, nothing prevents a stale execution from reporting
late, and the evidence needed to diagnose any of it dies with the conversation.

This slice makes liveness a property of every durable attempt, before declared
graph routing or swarm coordination. It keeps the current Chain, Drive, spawn,
and Quality Manager policy shapes.

The previous version of this spec stated its invariants as mechanism (opaque
tokens, lease renewal intervals, clock rebasing, expiry-quarantine). Three of
those clauses contradicted each other and no agent was permitted to choose
between them. This version states what an operator or coordinator must be able
to observe and leaves mechanism to the plan.

## Intent

Goal: a durable run never shows work as `running` when nobody is working on
it, and never lets two executions change the same step.

Invariants — mechanism yields to these:

- INV-001 - One owner per step. At most one execution may change a step or
  have its result accepted. Losing contact with an owner is evidence; it is
  never permission for a second execution of that step to start in the same
  run. A result from anything other than the current owner is kept in full as
  evidence and never becomes the step's result.
- INV-002 - Every attempt ends, and stays ended. Every in-scope attempt reaches
  a durable terminal or blocked state within a hard ceiling that is enforced
  in every mode. No mode, default, or deferred decision leaves an attempt
  `running` without bound. Once a step has left `running` its outcome does not
  change, and a run ends when nothing remaining can become runnable.
- INV-003 - Silence is judged by useful work, not by proof of life. Keeping
  ownership alive never counts as progress, and time during which the host was
  suspended never counts as silence.
- INV-004 - An owner that is alive is not evicted. An owner that has stopped
  renewing is removed only when it is shown to be dead, or when it cannot be
  checked and a further full grace period has passed. An owner found alive
  keeps the step, and the lapse is reported rather than acted on.
- INV-005 - Stopping is confirmed by settlement. An acknowledged stop request
  is not a stop. An attempt whose stop cannot be confirmed is treated as
  possibly still changing things: it ends blocked and is not retried in the
  same run.
- INV-006 - One contract, whoever runs it. The same policy meanings hold
  whether Claude Code, Codex, Pi, or a future harness started the run, and
  whatever backend, transport, or model executes it. A backend that cannot
  honour part of the policy says so, and the run is refused or degraded
  visibly — never by a hidden fallback.
- INV-007 - Evidence outlives the conversation. What is needed to tell who
  owned an attempt, what it last did, why it ended, and what it returned is
  persisted outside the coordinator context that started it.

Ranking. INV-001 and INV-005 win over every other invariant: when availability
conflicts with single ownership or with confirmed stopping, work is lost or
blocked rather than duplicated. INV-002 wins over INV-004: an owner that is
alive but past the hard ceiling is stopped. An attempt that INV-005 cannot
confirm stopped satisfies INV-002 by ending blocked. Recovery from a blocked
attempt is an operator-started replacement run.

Provenance. INV-002's always-enforced ceiling, the config-only policy surface
in the User Experience, and INV-004 come from direct human rulings on
2026-09-21 (`ruling-packet.md` Q1, Q2, Q3). INV-001 and INV-005 carry forward
substance the human ratified on 2026-09-13 and 2026-09-14. The wording of all
seven is the doer's and is unratified until the human accepts this draft.

## Users

- Operators using `run status` or `run watch` who need to tell active, idle,
  would-have-been-cancelled, cancelling, blocked, expired-but-held, and
  terminal work apart.
- External coordinators in Claude Code, Codex, and future harness adapters.
- Pi-hosted coordinators and workers using supported model providers.
- Workflow authors, including Quality Manager, who need bounded failure without
  relying on one conversation context.

## User Experience

Two deadlines apply to every in-scope attempt.

The **hard ceiling** is always enforced. A frontend may set it — Drive's
existing task cap becomes the ceiling for Drive tasks — and a default applies
when none is set. An attempt that reaches its ceiling is asked to stop once and
ends terminal or blocked within a bounded grace.

The **idle deadline** measures time since useful work. It runs in one of two
modes. In `shadow`, the default, crossing it records durable
would-have-cancelled evidence and changes nothing. In `enforce`, crossing it
stops the attempt exactly as the ceiling does.

An operator chooses the idle mode, the idle window, and the hard ceiling in one
`liveness` block of the project's `.cosmonauts/config.json`. There are no
command-line flags for it. With no block, runs use `shadow` and the defaults.
Every run records the policy it resolved and where each value came from, and
`run status` shows it.

`run status` and `run watch` identify, for each attempt: who owns it, the last
proof of life, the last useful activity, each deadline with its source and
mode, the state of any stop request, where its session is, and any late result
that was rejected. A laptop that slept is not reported as an idle worker.

When another invocation finds an attempt whose owner has stopped renewing, it
checks the recorded owner. An owner found alive on the same host keeps the
step and status reports the attempt as expired-but-held. An owner found dead
leaves the step blocked, recording why and who held it; no replacement starts
in that run. An owner that cannot be checked is treated as dead only after one
further full grace period.

Quality Manager keeps its current workflow in this slice. Its outer attempt may
run longer than an idle window while it is doing useful work; a synthetic
silent step produces a bounded, diagnosable outcome. Turning `enforce` on by
default remains a separate human decision made from live evidence.

## Acceptance Criteria

- [ ] AC-001 - An attempt that reaches its hard ceiling is asked to stop once
  and reaches a durable terminal or blocked outcome within the cancellation
  grace, in both idle modes.
- [ ] AC-002 - In `enforce`, a silent attempt that crosses its idle deadline
  ends the same way as AC-001.
- [ ] AC-003 - In `shadow`, a silent attempt that crosses its idle deadline
  produces durable would-have-cancelled evidence visible in `run status` and
  `run watch`, and keeps running until it finishes or reaches its ceiling.
- [ ] AC-004 - Useful activity resets idle time and proof of life does not: an
  attempt that keeps producing useful activity survives beyond the idle
  window, and one that only keeps ownership alive does not.
- [ ] AC-005 - After the host was suspended, an attempt is not reported or
  treated as idle for the time the host was not running.
- [ ] AC-006 - A `liveness` block in project config selects the idle mode, the
  idle window, and the hard ceiling. With no block a run uses `shadow` and the
  defaults. An invalid block refuses the run with an error naming the key.
  The resolved policy and the source of each value are recorded on the run and
  shown by `run status`.
- [ ] AC-007 - Drive's existing task cap keeps being enforced, as the hard
  ceiling for Drive tasks, and a task's side effects cannot land after the
  scheduler has settled that task.
- [ ] AC-008 - A result reported by an execution that no longer owns its step
  leaves the step and the run unchanged; the late result is retained in full
  as rejected evidence and is never presented as the step's result.
- [ ] AC-009 - An owner whose ownership lapsed while it could not run, and that
  nobody removed in the meantime, resumes ownership and carries on.
- [ ] AC-010 - When another invocation observes lapsed ownership: an owner
  found alive on the same host keeps the step and the attempt is reported as
  expired-but-held with the owner's identity; an owner found dead leaves the
  step blocked, recording the reason and the owner's identity, starts no
  replacement in that run, and lets the run finalize; an owner that cannot be
  checked is treated as dead after one further full grace period. The outcome
  is the same in both idle modes.
- [ ] AC-011 - A stop is confirmed only when the attempt's result settles
  within grace, or its backend reports the equivalent, and only once the
  attempt's descendants have settled. An unconfirmed stop leaves the attempt
  blocked, it is not retried in the same run, and recovery is an
  operator-started replacement run.
- [ ] AC-012 - A run reaches a terminal state when no pending step can become
  runnable, including when a failed non-final step leaves only dependent work.
- [ ] AC-013 - Concurrent invocations on one run never produce two owners of a
  step, a repeated attempt identifier, or a repeated or misordered event
  sequence number: a follower using `run watch --since-seq` misses nothing and
  re-reads nothing.
- [ ] AC-014 - Starting a run on a backend that cannot honour the resolved
  policy is refused with a clear message, or degraded according to a recorded
  policy that the run shows; there is no hidden fallback.
- [ ] AC-015 - Giving up waiting for a spawned child ends only the wait: the
  child is not cancelled, its later completion is delivered exactly once, and
  when several children complete each completion is delivered exactly once. A
  child is cancelled only when the attempt that owns it is cancelled.
- [ ] AC-016 - For every in-scope attempt, after the coordinator conversation
  that started it is gone, the persisted record still identifies the owner,
  the last proof of life, the last useful activity, each deadline with source
  and mode, the stop state, the session, the full final result, and any
  rejected late result.
- [ ] AC-017 - A synthetic silent Quality Manager step run through the durable
  chain reaches a bounded terminal or blocked outcome with the AC-016 evidence;
  Quality Manager's topology is not decomposed in this slice.
- [ ] AC-018 - The 200-character chain summary contract, spawn depth and
  concurrency rejection, Drive task policy other than AC-007, and
  coordinator/harness neutrality are unchanged.

## Scope

Included populations:

- loop-free chains and the outer durable Quality Manager attempt compiled to
  the durable scheduler;
- Drive task and finalizer steps already executed on the durable scheduler;
- descendants owned by those attempts, including inline coordinator and nested
  compatibility paths reached through registered child handles; and
- every production backend registered for those populations.

Included: attempt ownership and its single-owner guarantee; the hard ceiling
and idle deadline with their two modes; the project-config policy surface;
host-suspension handling; settlement-based stopping including descendants;
the lapsed-owner check; run finalization when nothing can run; backend
capability declaration and Drive cap conformance; persisted attempt evidence
and Pi session persistence; lossless spawn completion delivery; the Quality
Manager proof; operator-facing status, watch, and documentation.

Excluded:

- Finding or fixing the provider-side trigger for silent streams unless new
  persisted evidence creates a separately approved fix.
- Automatic retry or takeover of an attempt whose stop is unconfirmed; process
  isolation and cross-run replacement fencing are later work.
- Checking an owner on another host. Such an owner is "cannot be checked".
- Command-line flags for liveness policy.
- Standalone interactive spawns that are not owned by a durable attempt, and a
  public remote `RunControl`/attach/cancel protocol; `drive-envelope` owns that
  public boundary.
- Decomposing Quality Manager, graph syntax, routers, joins, declared fan-out,
  loops, durable messaging, or swarm coordination.
- Changing the pinned Pi version, forking Pi, or adding a provider stream parser.
- Queueing spawn-limit overflow, raising spawn limits, worktrees, or parallel
  mutable execution.

## Assumptions

- The following are starting points carried over from the previous design, not
  requirements; the plan may replace any of them if it still meets the
  invariants: an opaque per-attempt ownership token rotated on claim; a
  five-minute lease renewed every minute; conditional store operations built
  on the existing `lib/entity-file-lock.ts` protocol; conservative rebasing of
  idle time after a detected clock discontinuity.
- An owner can be checked on the same host from a recorded process identity
  that includes its start time, so that a reused process id is not mistaken
  for a live owner.
- "One further full grace period" for an owner that cannot be checked is one
  lease duration.
- Pi remains the first integration surface. Implementation re-audits the
  pinned Pi cancellation, session, settings, and lifecycle APIs before
  changing code.
- Durable fsync is not a requirement for this slice.
- Fifteen minutes is only a candidate idle window to evaluate in `shadow`.
- The 200-character summary remains orientation only.
- As of 2026-09-21 two children completing in the same tick are both
  delivered (`c08948a`, `324e818`). A wait abandoned by a timeout still
  swallows the next completion; AC-015 covers it.
- The previous plan's review (`review-1.md`) lists what a plan for this spec
  must answer; PR-001, PR-002, and PR-004 are answered by this revision.

## Open Questions

- What is the default hard ceiling when a frontend sets none? It must be
  generous enough to be a backstop rather than a tuning knob. The plan
  proposes a value from existing run-duration evidence; a human decides.
- Does live evidence gathered in `shadow` justify a fifteen-minute idle
  window, or do backend populations need different declared policies? A human
  decides this after the Quality Manager proof.
- Will preserved session and result evidence identify a reproducible
  provider-side cause for silence? That diagnosis may create a separate fix but
  does not weaken this liveness contract.
- Eighteen acceptance criteria exceed what one plan should carry. The planner
  proposes slice boundaries; a natural first cut is ownership and ending
  (AC-001 to AC-013) before evidence, spawn delivery, and the Quality Manager
  proof (AC-014 to AC-018).
