---
id: TASK-491
title: Stage 7a — Make plan-lock release failures retryable
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-489
createdAt: '2026-07-22T15:52:56.061Z'
updatedAt: '2026-07-22T20:41:02.672Z'
---

## Description

Implementation stage 7 foundation. Owned behavior: B-029 (source AC-007). Depends on the atomic stages 1–5 checkpoint and must complete before the terminal-persisted hook task. Implement test-first and place the exact B-029 marker near its executable test.

Own `createHandle` release semantics in `lib/driver/lock.ts` and evidence in `tests/driver/lock.test.ts`.

Ratified constraint: a failed read or unlink must leave release genuinely retryable for the caller's `.finally` backstop. The handle becomes released only after successful unlink or confirmation that the lock is not ours. Ordinary success remains idempotent with no second unlink.

<!-- AC:BEGIN -->
- [x] #1 B-029 is proven by `tests/driver/lock.test.ts` > `retries release after a failed unlink and stays idempotent on success`: a rejected first release is retried successfully by the backstop, ordinary success performs no second unlink, and no live-process lock remains, with the exact B-029 marker near the test.
- [x] #2 `lib/driver/lock.ts` marks a handle released only after successful owner-checked unlink or confirmation that the file is not owned by this handle; rejected reads and unlinks preserve retryability.
- [x] #3 The shared primitive's existing acquisition, stale-owner, owner-check, and ordinary idempotence behavior remains unchanged, including gate-OFF callers that rely on current bytes and lock lifecycle.
- [x] #4 `tests/driver/lock.test.ts`, `bun run lint`, and `bun run typecheck` pass before terminal-hook work starts.
<!-- AC:END -->
