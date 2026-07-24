---
id: TASK-500
title: Review fix — bound detached and thrown terminal lock liveness
status: Done
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - pre-existing-on-main
dependencies: []
createdAt: '2026-07-22T22:05:22.122Z'
updatedAt: '2026-07-24T03:33:53.184Z'
---

## Description

**Triage 2026-07-24: PRE-EXISTING or RATIFIED, not a regression from
`episodic-log-detached-hardening`. Unlabelled from that plan and kept as a
standalone follow-up.**

Evidence, per sub-finding:

- PR-001 (abort waits forever on a child ignoring SIGTERM) is pre-existing.
  `main`'s `lib/driver/driver.ts` has the identical
  `terminateDetachedChild(child.pid); await waitForChildExit(child);` pair at
  lines 210-211, with no deadline or escalation. The plan changed which state
  abort reads, not the unbounded wait.
- PR-002 (thrown terminal episode I/O runs under the plan lock) is **ratified
  design**, not a defect. Design §1 states the thrown path has no completion and
  keeps caller `.finally` release as its backstop; the `onTerminalPersisted`
  hook is scoped to completion-backed terminals only, and B-016/B-017 say so.
  Changing it would re-open a ratified decision — revise the plan first.
- PR-004 (the 2s drain deadline does not bound the final JSONL read) is a real
  latency nit on a local file read. Bounded in practice; unbounded only on a
  stalled filesystem.

Original framing follows.

Round-1 remediation for PR-001, PR-002, and PR-004. Review and narrowly harden detached abort/drain and thrown-terminal lock ownership: abort must not wait forever on a child ignoring SIGTERM; enabled thrown terminal ledger/episode I/O must not remain under the plan lock if AC-007 requires release; drain shutdown/result latency must remain bounded even if a final/in-flight JSONL read does not settle. Preserve D-001 completion-backed ordering, exact final-poll allowlist behavior, and OFF behavior. If a reported case is structurally impossible or outside the ratified contract, document concrete evidence rather than broadening architecture.

<!-- AC:BEGIN -->
- [x] #1 A deterministic child-that-ignores-SIGTERM test proves abort settles through a bounded cleanup/escalation path without leaking listeners/timers/process ownership.
- [x] #2 Enabled thrown terminal capture does not hold the plan lock during ledger/episode I/O, without creating a completion or second terminal.
- [x] #3 Drain reaches stopped and parent result settles within its bound even when final/in-flight read is fault-injected not to settle, while normal final polling still forwards only allowed diagnostics.
- [x] #4 D-001 ordering and gate-OFF observable behavior remain unchanged.
- [x] #5 Focused/full verification stays green.
<!-- AC:END -->

## Implementation Notes (2026-07-24, COMPLETE)

Implemented on `feature/shared-primitive-hardening`.

- **PR-001 (fixed).** `abortDetachedRun` now escalates on a deadline: SIGTERM →
  2s → SIGKILL → 1s → proceed regardless. Abort always settles. The two
  near-duplicate wait helpers collapse into one `waitForChildExitWithin` that
  reports whether an exit was actually confirmed and clears its timer plus both
  listeners on every path. RED evidence: both new tests hang to a 30s timeout
  against the unbounded wait — precisely the reported defect.
- **PR-002 (not changed, as directed).** Ratified design per Design §1 and
  B-016/B-017; the thrown path has no completion and keeps caller `.finally`
  release as its backstop. No code change.
- **Behavior change, investigated and cleared.** The old `waitForChildExit`
  *rejected* on the child `error` event; the replacement resolves "not
  confirmed", so abort proceeds to write the fallback completion and record the
  aborted terminal rather than rejecting. Checked rather than assumed: the abort
  path calls `process.kill(pid, signal)` directly (`driver.ts:279`) and never
  `child.kill()`, so a failed signal surfaces as a **thrown exception** inside
  `signalDetachedChild`, not as an `error` event on the child handle. Since the
  child is already spawned on this path (we hold its pid), the `error` event is
  effectively unreachable, and no test depended on the rejection (full suite
  green). Impact is nil; the new behavior is also the more robust reading of
  "abort must settle".

### AC#3 / PR-004 — DONE

Initially deferred, then implemented once the scope of the liveness work made
it proportionate.

The unbounded read was never in `driver.ts`; it was `finish()` in
`lib/driver/event-stream.ts`, which awaited `poll()` (and thus `readFile`) with
no deadline. `JSONL_BRIDGE_DRAIN_TIMEOUT_MS` only decided *when* `finish()` ran
via `enterDraining`, never how long it could take. `startDetachedProcess` awaits
`bridge.finish()` in a `finally`, so a stalled filesystem there held the parent
result open indefinitely.

`drainWithinDeadline` now races the drain against that same deadline and calls
`stop()` unconditionally afterwards. Stopping is safe because `processContent`
early-returns once stopped, so a late-settling read cannot publish; the
abandoned drain gets a no-op catch so it cannot surface as an unhandled
rejection.

Verified RED (`expected 'hung' to be 'settled'`) with the final read
fault-injected never to settle. The pre-existing timer-leak assertions still
hold: `finish()` holds its deadline timer only while running and clears it in a
`finally`, which the deadline-path test now asserts after awaiting the bounded
finish.

### Review round 2 — drain failure made non-load-bearing

Round 2 found that the PR-004 fix above had a defect of its own. The drain's
`.catch(() => undefined)` was attached as a *side chain*: it silenced the
unhandled rejection but left the promise passed to `Promise.race` still
rejecting. So a drain that failed before the deadline won — for example a
malformed final line whose error reporting itself throws — rejected
`drainWithinDeadline()`, skipped `stop()`, and rejected `finish()`. Because
`startDetachedProcess` awaits `bridge.finish()` in a `finally` *after* the run's
result is already in hand, that cleanup error replaced a valid detached result.

Fixed by making the `catch` part of the raced promise rather than a side chain,
and by moving `stop()` into an unconditional `finally` so cleanup runs whatever
the drain does. Verified RED (`promise rejected "Error: stderr failed" instead
of resolving`) with a malformed final line and a throwing `console.error`.

### Review round 3 — late poll rejection after stop

Round 3 found a leak adjacent to the round-2 fix. `stop()` clears resources but
leaves an in-flight `pollPromise` unobserved, and `finish()` returns early once
stopped rather than awaiting it. If that read then failed — and error reporting
itself threw — the rejection had no observer and surfaced as an
`unhandledRejection`, which under default Node behavior can terminate the
process *after* the detached result was already produced.

Fixed by observing `pollPromise` on a side chain at creation, deliberately
keeping `pollPromise` itself intact so the final drain still awaits the real
promise. Note this is the opposite of the round-2 defect and not a repeat of it:
there the mistake was racing an unprotected promise while the `catch` sat on a
side chain; here the side chain is exactly right, because the value must stay
awaitable by the drain while still being observed when nobody awaits it.

Verified RED (`expected [ Error: stderr failed after stop ] to deeply equal []`)
by holding a read open, stopping the bridge, resolving `finish()`, then failing
the held read with a throwing `console.error`.
