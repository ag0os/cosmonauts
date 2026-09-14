# Execution Liveness Independent Review — Disposition

**Status:** Actioned by codex on its own; the expiry refinement and every
2026-09-13 decision entry are codex-proposed and unratified (see re-review)  
**Reviewed:** 2026-09-13  
**Code basis:** `main` at `2bb5340` plus the uncommitted execution-liveness overlay  
**Source:** private Claude artifact
`https://claude.ai/code/artifact/712fdb9a-b527-4527-841f-1214a23f53d6`

## Verdict

Accept **GO WITH AMENDMENTS**. The graph-first, shared-runtime, coordinator-
neutral direction remains intact, but the original five-task plan was not
implementation-ready. The accepted review expands the behavior spine from 12 to
20 behaviors and the task DAG from five to nine tasks. Runtime implementation
has not started.

## Accepted findings

- Store authority must be expressed as atomic conditional operations, not raw
  scheduler read/check/write sequences. Claims mint process-private tokens and
  attempt IDs under a crash-safe per-step lock adapted from
  `lib/entity-file-lock.ts`; `.init.lock` is not the primitive.
- `lastActivityAt`, holder execution identity, cancellation request/settlement,
  session reference, full opaque result, token revocation, absorbing terminal
  statuses, and non-promotable rejected results are explicit persisted concepts.
- The Drive resume projector is a second lifecycle writer and must be guarded.
  Event sequence allocation moves from per-store memory to a run-scoped lock.
- Cancellation confirmation means attempt-result settlement within grace (or an
  explicitly equivalent backend signal), not `cancel()` acknowledgement.
- Watchdog policy has `shadow | enforce`, with shadow as the default. A human
  enablement task follows live post-instrumentation evidence.
- Drive's backend-owned timer is a liveness seam, not unrelated policy: its cap
  is mapped to explicit scheduler `hardTimeoutMs`, the abandoning timer is
  removed, and task-side effects must settle or be fenced.
- Pi session identity/settings, live session-to-attempt activity, abort latching,
  cancelled-spawn success classification, descendant handles, and chain
  `BackendContext.signal` use are named implementation seams.
- The five-minute completion wait is observational, not a child deadline. Its
  actual duplicate/swallowed/late-completion races replace the unreproduced
  single-waiter framing.
- Run finalization must handle failed work whose pending dependents can no
  longer become runnable.
- Architecture prose now distinguishes target convergence from three current
  runtime paths, puts artifact handoff and durable enforced read-only fan-out
  before routers, maps current `StepKind`, and restores explicit later-wave
  gates/follow-ups.
- Autonomy may share a future host process but not a single state authority:
  orchestration owns attempts and autonomy's episodic log owns wake-state/audit.

## Revised recommendation: expiry and replacement

The review correctly rejected “current and unexpired token” as an ownership
rule: it would self-fence healthy long work during the first implementation task
and after host suspension. The suggested replacement wording still allowed
expiry to permit a competing claim, while also resolving every unconfirmed
attempt as potentially mutating. Those two rules cannot safely coexist.

The refinement codex applied on its own (unratified) is:

- only the current **unsuperseded** token may renew or reacquire, record activity,
  or finalize;
- expiry is authoritative loss-of-health evidence and cannot count as fresh
  external work, but does not itself revoke the token or prove the process dead;
- a host clock discontinuity is recorded and idle evaluation is rebased;
- a competing claim rotates the token only after prior execution settlement or
  death is confirmed, or through explicit operator replacement carrying that
  evidence; and
- unconfirmed cancellation ends terminal-blocked and permits no same-run retry.

This chooses safety over automatic recovery until isolation or independently
provable process death exists.

## Deferred or separately owned

- Quality Manager graph decomposition remains after artifact handoff and
  declared graph control. Wave A proves only that the observed silent outer
  durable step is bounded.
- The stale unnamespaced Quality Manager review-file defect remains the separate
  `qm-chain-safety` roadmap item.
- Public attach/cancel/control remains `drive-envelope`; this plan does not claim
  to implement coordinator neutrality decisions in full.
- Cross-run replacement fencing, an explicit `none` task-timeout value,
  unbounded finalizer retry, and silently skipped missing backend mappings are
  recorded latent issues, not silently added to this plan.
- Provider-stream root cause remains unknown pending persisted session evidence.

## Artifact changes

- `missions/plans/execution-liveness/spec.md` resolves recovery, scope,
  cancellation confirmation, shadow mode, Drive policy, and host suspension.
- `missions/plans/execution-liveness/plan.md` contains B-001 through B-020, a
  dated superseding decision, exact current-runtime exceptions, and a nine-task
  implementation order.
- `TASK-677` through `TASK-681` were narrowed; `TASK-682` through `TASK-685`
  separately own Drive conformance, waiters, scheduler migration, and human
  enforcement enablement.
- `missions/architecture/orchestration-future.md`,
  `missions/architecture/autonomy.md`, and `ROADMAP.md` now carry the amended
  boundary and delivery sequence.

## Re-review of this disposition (Claude, 2026-09-13)

Checked every accepted finding and the review's exact amendments against the
amended spec, plan, nine tasks, both architecture records, and `ROADMAP.md`;
re-ran `plan check-artifacts` (20 behaviors, 0 issues) and the task CLI (all
nine tasks parse). The disposition is accurate except for the items below.

### Closed — ratified by the human, 2026-09-13

**The crashed-holder gap is closed by an expiry quarantine rule.** INV-001 and
plan D-001 say expiry "does not itself revoke the token", and D-006 permits
rotation only after confirmed settlement/death or operator replacement. When a
holder process dies, its process-private token dies with it: nothing can present
it to finalize, and nothing else may revoke it, so the step stayed `running` on
an expired lease and the run never terminalized. B-002 only stops the expired
lease from counting as fresh work; B-006 covers cancellation the owning process
issued; B-018 covers pending steps. None reached the crash case. Codex was right
that the review's F-003 wording conflicts with treating every unconfirmed
attempt as mutating, but it removed F-003's post-expiry state without naming a
replacement.

Ratified rule, now recorded as plan `D-012`, spec `AC-014`, an INV-001 sentence,
behavior `B-021`, and TASK-678 AC#7:

> Expiry never authorizes a competing claim, but a scheduler pass that observes
> an expired lease it does not hold, with no settlement evidence and after any
> detected clock discontinuity has rebased idle evaluation, quarantines the
> attempt: the step becomes terminal-blocked with reason `lease_expired` and the
> persisted holder identity. Quarantine revokes the token (late writes stay
> non-promotable per B-001/B-014) and starts no new attempt; the run then
> finalizes under B-018. In shadow mode the pass records `would-quarantine`
> instead. Recovery remains an operator-started replacement run after the holder
> identity is confirmed dead.

The clock-discontinuity precondition was added to the original draft so a shared
host suspension cannot quarantine a healthy owner.

### Open follow-up: should quarantine be shadow-gated?

As ratified, quarantine is shadow-gated, and shadow is the default. That means a
crashed holder still wedges its run when this slice ships, and only records
`would-quarantine` until TASK-685 enables enforcement. The argument for making
quarantine unconditional is that shadow mode exists to avoid cancelling live
work, while quarantine cancels nothing: it starts no attempt and only stops the
run from pretending an unowned attempt is alive. Terminal-blocked with evidence
is strictly better than wedged forever. A human decision; until it is made, the
ratified shadow-gated form stands.

### Provenance corrected

The human confirmed on 2026-09-13 that they shared the review with codex and
did not decide the changes; codex decided them on its own. The "human
acceptance" attributions were therefore corrected to "codex-proposed,
unratified" in `orchestration-future.md` (D-012, plus amendment notes on
D-001 and D-007), `autonomy.md` (D-001 to D-004), `autonomy-host/plan.md`
(D-004), the execution-liveness plan (D-011) and spec (Intent note), and the
`ROADMAP.md` overlay. Nothing was reverted; the changes stand as proposals
until a human ratifies them.

### Derived omissions applied on the record

- TASK-677 AC#7: the claim persists holder execution identity and reserves
  the attempt-record fields plan Design names (review F-027/F-028, critic-3).
- TASK-684 AC#5 and TASK-678 AC#3: the pinned tests to retarget are named,
  markers preserved (review F-003, F-010).
- TASK-679 AC#2: pre-create the session file (review F-037).
- TASK-680 AC#1: inline nested chains named as owned descendants (F-048/49).
- TASK-682 AC#2: `chain_run.timeoutMs` disposition and the doc correction
  (F-015).
- plan B-009 seam and Files to Change: live producer seams
  (`activity-bus.ts`, `spawn-tool.ts`, `durable-chain-runner.ts`) added;
  `chain-event-adapter.ts` kept as replay-only (F-023).

### Noted, not changed

- "Exactly one abort" in TASK-678 AC#2 is unfalsifiable as worded; assert
  at-most-once plus a persisted request.
- The seven refuted-as-framing implementation notes (no CAS primitive,
  `scheduler.json` as derived cache, retire `canCancel`, coalesce
  `reportActivity`, and the rest) are not carried in any task.
- Plan Decision Log entries carry no `Decided by:` provenance, so the
  deviation protocol treats all eleven as ratified by default.
