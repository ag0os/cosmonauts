---
id: TASK-684
title: Migrate scheduler to fenced ownership and renewal
status: To Do
priority: high
labels:
  - backend
  - orchestration
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-677
createdAt: '2026-09-13T04:02:33.644Z'
updatedAt: '2026-09-13T04:02:33.644Z'
---

## Description

Implement B-002 and B-003 on the conditional store foundation. Replace raw scheduler lifecycle writers and holderId renewal with token-conditional operations, arm production renewal by default, and make expired leases health evidence rather than fresh external work or automatic takeover.

<!-- AC:BEGIN -->
- [ ] #1 B-002 removes pass-start holderId renewal and routes the seven scheduler lifecycle writers through current-token conditional store operations.
- [ ] #2 B-002 arms a one-minute production renewal default inside the five-minute lease and lets only the current unsuperseded token renew or reacquire after expiry.
- [ ] #3 B-002 treats an expired foreign lease as non-fresh work but never uses expiry alone to rotate the token or launch a competing mutating attempt.
- [ ] #4 B-003 persists lastActivityAt through one token-conditional coalescing operation and proves heartbeat alone cannot advance idle activity.
- [ ] #5 The pinned restart/foreign-work tests are retargeted to the new expiry rule with their markers preserved: tests/durable-runtime/scheduler-recovery.test.ts ("reconstructs ready queue leases and heartbeats from persisted records after restart", "leaves fresh nonresumable running work externally owned without starting a duplicate after restart", and the durable-graph-scheduler#B-006 heartbeat-age test) and tests/driver/drive-on-graph-recovery.test.ts ("applies committed-work block and leave-running recovery paths to selected drive backends"); compatible historical records remain readable.
- [ ] #6 No test.todo remains for B-002 or B-003; their named tests execute and pass with relevant correctness, lint, and typecheck gates.
<!-- AC:END -->
