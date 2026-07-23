---
id: TASK-498
title: Review fix — make entity-lock ownership and release failure-safe
status: To Do
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T22:04:56.416Z'
updatedAt: '2026-07-23T22:53:51.049Z'
---

## Description

Round-1 remediation for F-003/PR-003/SR-002 and F-004/SR-003/UR-002. Harden the existing shared entity-file lock without creating a third protocol. Prevent stale reclaimers or releasers from deleting replacement-owner locks; preserve same-entity serialization during stale recovery. Make transient owned-lock release failure retry/recover in a bounded way. If release cannot be confirmed, preserve the successful primary update but skip transition episode capture and report truthful bounded warning text. Keep acquisition error/timeout fail-soft and action single-execution.

<!-- AC:BEGIN -->
- [ ] #1 Two deterministic stale-recovery contenders cannot both enter and neither removes a replacement owner.
- [ ] #2 Release never removes a replacement PID/nonce owner and a transient first unlink failure is retried/recovered without changing the primary result.
- [ ] #3 Plan/task transition capture occurs only after lock release is confirmed; unreleased ownership warns and skips capture.
- [ ] #4 Acquisition error/timeout still runs the action unlocked exactly once within the bound, and action failure is not retried.
- [ ] #5 Filesystem lock protocol implementation count remains exactly two and focused/full verification stays green.
<!-- AC:END -->

## Implementation Notes

Attempt 1 failed: worker spawn d30ed70e-6d0a-41b4-afa0-cfcdd5dd34b2 timed out after 300000ms while task remained In Progress with all ACs unchecked. Before changing code, inspect the working tree and git log for partial work from that attempt; preserve or clean it deliberately. This is the first failed attempt.
