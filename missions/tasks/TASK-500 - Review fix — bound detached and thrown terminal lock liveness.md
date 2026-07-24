---
id: TASK-500
title: Review fix — bound detached and thrown terminal lock liveness
status: To Do
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
- [ ] #1 A deterministic child-that-ignores-SIGTERM test proves abort settles through a bounded cleanup/escalation path without leaking listeners/timers/process ownership.
- [ ] #2 Enabled thrown terminal capture does not hold the plan lock during ledger/episode I/O, without creating a completion or second terminal.
- [ ] #3 Drain reaches stopped and parent result settles within its bound even when final/in-flight read is fault-injected not to settle, while normal final polling still forwards only allowed diagnostics.
- [ ] #4 D-001 ordering and gate-OFF observable behavior remain unchanged.
- [ ] #5 Focused/full verification stays green.
<!-- AC:END -->
