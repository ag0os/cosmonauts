# `execution-liveness` restatement — old Expected beside new Outcome

Seventeen behaviors restated 2026-09-21 (that plan's D-014). Sources (`AC-###`) and the spec are unchanged. Read each row for drift in meaning; mechanism that left the text is listed in the plan's Design under "Mechanism the behaviors no longer name".

## B-001

**Was — Expected:** step/run state is unchanged and the full late result is retained as rejected, non-promotable evidence

**Was — Seam:** `lib/durable-runtime/types.ts`; `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/scheduler.ts`

**Now — Outcome:** the step and the run show the state the current owner produced, unchanged by the late report; the late result is retained in full as rejected evidence and is never presented as the step's terminal result

## B-002

**Was — Expected:** the current unsuperseded token succeeds, a superseded token fails, expiry is not fresh external work, and expiry alone never starts a competing mutating attempt

**Was — Seam:** `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`

**Now — Outcome:** the attempt that still owns the step keeps ownership by renewing or reacquiring — including after its lease expired while it could not run — and carries on; a superseded attempt can no longer change anything; lease expiry is not treated as fresh external work, and expiry alone never starts a second attempt mutating the same step

## B-004

**Was — Expected:** `cancellationRequested` and source persist, abort is requested once, and settlement or terminal-blocked state occurs within grace

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/controller.ts`; `lib/durable-runtime/types.ts`

**Now — Outcome:** once the attempt has been silent past its enforced idle deadline, the run records that cancellation was requested and from what source, the attempt is asked to abort exactly once, and within the cancellation grace the step is either settled or explicitly terminal-blocked — it does not stay `running`

## B-005

**Was — Expected:** activity resets idle time and wall-clock duration alone never cancels it

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/backends.ts`

**Now — Outcome:** the task is not cancelled: useful activity resets idle time, and wall-clock duration alone never cancels an attempt

## B-006

**Was — Expected:** the token is revoked, the step ends terminal-blocked with execution identity/evidence, and no same-run replacement starts

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/file-store.ts`

**Now — Outcome:** the step ends terminal-blocked showing the attempt's execution identity and evidence, its ownership is revoked, and no replacement attempt starts in that run — recovery is a new run once the persisted execution identity is confirmed dead

## B-008

**Was — Expected:** a file-backed session/reference exists independently of plan metadata, explicit settings reach Pi resource loading, a cancellation latch precedes prompts, and full final text is retained as evidence/artifact

**Was — Seam:** `lib/orchestration/session-factory.ts`; `lib/orchestration/agent-spawner.ts`; `lib/orchestration/types.ts`

**Now — Outcome:** the attempt has a file-backed session, referenced from the attempt and independent of any plan metadata; the explicit settings it was given are the ones the session was built with; a cancellation requested before the first prompt prevents that prompt; and the full final assistant text is retained as attempt evidence

## B-009

**Was — Expected:** it conditionally advances the owning token's `lastActivityAt`; replay-only adapters remain diagnostic

**Was — Seam:** `lib/orchestration/agent-spawner.ts`; `lib/orchestration/activity-bus.ts`; `domains/shared/extensions/orchestration/spawn-tool.ts`; `lib/orchestration/durable-chain-runner.ts` (live producers); `lib/orchestration/chain-event-adapter.ts` (replay-only, diagnostic); `lib/durable-runtime/backends.ts`

**Now — Outcome:** that work counts as the owning attempt's activity while it happens, so the attempt is not judged idle while its descendants work; evidence recovered by post-run replay appears as diagnostics only and never counts as live activity

## B-010

**Was — Expected:** every registered handle receives one cancel request and its result settlement contributes to parent confirmation

**Was — Seam:** `lib/orchestration/agent-spawner.ts`; `domains/shared/extensions/orchestration/spawn-tool.ts`; `lib/orchestration/durable-chain-runner.ts`

**Now — Outcome:** every descendant the attempt registered receives exactly one cancel request, and the parent's cancellation is reported as confirmed only once those descendants' results have settled

## B-012

**Was — Expected:** it reaches terminal/blocked state with session, activity, deadline, and cancellation evidence while topology and summaries remain unchanged

**Was — Seam:** `bundled/coding/agents/quality-manager`; `lib/orchestration/durable-chain-runner.ts`; `docs/orchestration.md`

**Now — Outcome:** under enforced policy the outer step reaches a terminal or blocked state, with session, activity, deadline, and cancellation evidence in the run record, instead of hanging; the workflow's stage topology and its summaries are unchanged

## B-013

**Was — Expected:** token and attempt ID are minted once under an `entity-file-lock`-style step lock, finalize cannot interleave with claim, and a dead holder is reclaimable

**Was — Seam:** `lib/entity-file-lock.ts`; `lib/durable-runtime/file-store.ts`

**Now — Outcome:** exactly one attempt claims the step, with one attempt id and one ownership token; a finalize never interleaves with a claim; and a lock whose holder died is reclaimed rather than wedging the run

## B-014

**Was — Expected:** terminal state is unchanged, token is revoked, and rejected evidence cannot become `terminalAttemptForStep`

**Was — Seam:** `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/scheduler.ts`; `lib/driver/durable-steps.ts`

**Now — Outcome:** once a step has left `running`, later writes from the scheduler, the Drive resume projector, or a late backend leave the shown terminal state unchanged; the step's ownership is revoked; and rejected evidence is never shown as the step's terminal result

## B-015

**Was — Expected:** allocation occurs under the run lock and every persisted sequence is unique and ordered

**Was — Seam:** `lib/durable-runtime/file-store.ts`

**Now — Outcome:** every event in a run has a unique sequence number and sequence order matches persisted order, even when several processes append to the same run at once — so a follower never misses an event or sees one twice

## B-017

**Was — Expected:** it records a clock discontinuity, lets the unsuperseded owner reacquire, and rebases idle evaluation without assuming worker progress

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/types.ts`

**Now — Outcome:** the run records a clock discontinuity; the attempt that still owns its step reacquires and continues; idle evaluation restarts from the resume rather than counting the time the host was asleep; and nothing assumes the worker made progress meanwhile

## B-018

**Was — Expected:** the run reaches its honest terminal outcome instead of remaining running

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`

**Now — Outcome:** the run reaches its honest terminal outcome instead of remaining `running`

## B-019

**Was — Expected:** the cap maps to `hardTimeoutMs` with recorded source, no backend-local timer abandons the promise, and task-side effects are settled/guarded before scheduler finalization

**Was — Seam:** `lib/driver/drive-scheduler-backend.ts`; `lib/driver/durable-steps.ts`; `lib/driver/backends/types.ts`

**Now — Outcome:** the cap is enforced as the run's hard deadline with its source recorded; no backend-local timer walks away from a task that is still running; and the task's side effects are settled or guarded before the run finalizes

## B-020

**Was — Expected:** durable `would-cancel` evidence and metrics are emitted while the attempt and descendants continue unchanged

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/controller.ts`

**Now — Outcome:** attempts that cross an idle or hard deadline keep running, with their descendants, exactly as before; durable `would-cancel` evidence and metrics are recorded for the operator to read

## B-021

**Was — Expected:** the step becomes terminal-blocked recording `lease_expired` and holder identity, the token is revoked, no replacement attempt starts, and the run finalizes; the outcome is identical under shadow and enforce

**Was — Seam:** `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/types.ts`

**Now — Outcome:** after any detected clock discontinuity has been rebased, a `running` step whose lease expired under a holder this scheduler does not own, with no settlement evidence, becomes terminal-blocked recording `lease_expired` and the holder's identity; its ownership is revoked so late writes stay rejected; no replacement attempt starts in that run; the run finalizes; and the outcome is identical in shadow and enforce modes

# Three behaviors awaiting a ruling

Each names an internal component as its actor and its outcome is a fact about internals. Proposal for each: withdraw it as a behavior, keep the rule as a design invariant (the worker still tests it), and let the listed behavior carry the observable consequence. Task ACs that cite the ID keep working: the invariant keeps the ID in Design.

| Behavior | What it says | Observable consequence already covered by | Proposal |
|---|---|---|---|
| B-003 Heartbeat never masquerades as useful activity | heartbeat advances, `lastActivityAt` does not, attempt becomes idle per mode | B-004 (silent attempt is cancelled) and B-005 (useful work is not) | fold into Design |
| B-007 Registered backends declare one liveness contract | capabilities explicit; unsupported combinations fail or degrade by recorded policy | partly B-019; the 'unsupported combination fails at run start' part has a real observer — someone starting a run with a backend that cannot honour the policy sees a clear refusal | **split**: restate the refusal as a behavior, fold the registry-shape rule into Design |
| B-016 Cancellation confirmation follows result settlement | acknowledgement alone is unconfirmed; settled result confirms; all hops recorded | B-006 (unconfirmed cancellation blocks replacement) and B-010 (confirmed only once descendants settle) | fold into Design |

B-015 was on the advising session's fold list. It is restated instead: `cosmonauts run watch --since-seq <n>` uses the sequence as a cursor, so a duplicate or misordered number makes a follower miss or re-read an event. That is an observer.
