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
- **Called-out behavior change:** the old `waitForChildExit` *rejected* on the
  child `error` event; the replacement resolves "not confirmed" instead, so
  abort proceeds to write the fallback completion and record the aborted
  terminal rather than rejecting. This is the more robust reading of "abort must
  settle", no test depended on the rejection, and `error` is only reachable
  post-spawn — but it is a real edge-case change, flagged for the reviewer.
