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
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T22:05:22.122Z'
updatedAt: '2026-07-22T22:05:22.122Z'
---

## Description

Round-1 remediation for PR-001, PR-002, and PR-004. Review and narrowly harden detached abort/drain and thrown-terminal lock ownership: abort must not wait forever on a child ignoring SIGTERM; enabled thrown terminal ledger/episode I/O must not remain under the plan lock if AC-007 requires release; drain shutdown/result latency must remain bounded even if a final/in-flight JSONL read does not settle. Preserve D-001 completion-backed ordering, exact final-poll allowlist behavior, and OFF behavior. If a reported case is structurally impossible or outside the ratified contract, document concrete evidence rather than broadening architecture.

<!-- AC:BEGIN -->
- [ ] #1 A deterministic child-that-ignores-SIGTERM test proves abort settles through a bounded cleanup/escalation path without leaking listeners/timers/process ownership.
- [ ] #2 Enabled thrown terminal capture does not hold the plan lock during ledger/episode I/O, without creating a completion or second terminal.
- [ ] #3 Drain reaches stopped and parent result settles within its bound even when final/in-flight read is fault-injected not to settle, while normal final polling still forwards only allowed diagnostics.
- [ ] #4 D-001 ordering and gate-OFF observable behavior remain unchanged.
- [ ] #5 Focused/full verification stays green.
<!-- AC:END -->
