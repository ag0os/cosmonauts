---
id: TASK-677
title: Build atomic attempt ownership store
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:execution-liveness'
dependencies: []
createdAt: '2026-09-11T13:25:38.078Z'
updatedAt: '2026-09-13T04:03:38.178Z'
---

## Description

Implement B-001, B-013, B-014, and B-015 as the file-store foundation. Add crash-safe scoped locks and token-conditional operations, allocate token/attempt/event identity atomically, make terminal state absorbing, retain rejected results as non-promotable evidence, and guard the Drive projector without yet adding watchdog policy.

<!-- AC:BEGIN -->
- [ ] #1 B-013 adds a crash-safe per-step lock based on the entity-file-lock protocol; .init.lock is not extended, killed holders are reclaimable, and finalize-versus-claim interleavings are deterministic.
- [ ] #2 B-013 mints the opaque process-private fencing token and attempt ID atomically inside claim; neither is re-derived from disk and holderId is diagnostics only.
- [ ] #3 B-001 exposes token-conditional renew or reacquire, coalesced lastActivityAt update, and finalize operations that reject every superseded token.
- [ ] #4 B-014 revokes the token on every transition out of running, makes terminal statuses absorbing, retains the full rejected result as non-promotable evidence, and prevents terminalAttemptForStep from selecting it.
- [ ] #5 B-014 places the Drive resume projector behind a store guard that refuses to overwrite a step holding a live token.
- [ ] #6 B-015 allocates event sequence numbers under a crash-safe per-run lock and proves uniqueness across multiple store instances.
- [ ] #7 The claim persists holder execution identity (pid, hostname, process start time, and process-group or session reference when known) and reserves the remaining attempt-record fields named in plan Design (session reference, deadline mode and source, cancellationRequested, settlement evidence, opaque full result) so TASK-678, TASK-679, and TASK-682 populate the record instead of reshaping it.
- [ ] #8 B-001, B-013, B-014, or B-015: the code behavior is protected by tests the worker designed after seeing the code, driven through the shipped entry point and each seen to fail against deliberately broken logic; compatibility, correctness, lint, and typecheck gates pass.
<!-- AC:END -->
