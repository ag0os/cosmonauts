---
id: TASK-481
title: Reconcile detached parent abort to one content-derived terminal episode
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-478
  - TASK-479
  - TASK-480
createdAt: '2026-07-17T20:08:40.325Z'
updatedAt: '2026-07-17T20:08:40.325Z'
---

## Description

Implementation Order step 8 detached-abort checkpoint. Change `DriverHandle.abort()` only after the normal Drive, compiled-child, and diagnostic contracts are established. The parent must stop the bridge, terminate and wait for the child, resolve authoritative completion, and invoke the shared terminal builder. This task solely owns B-019. If idempotence cannot be proven across the planned fault windows, stop and revise rather than accepting duplicate or permanently start-only evidence on a reconcilable surface.

<!-- AC:BEGIN -->
- [ ] #1 B-019 (Sources AC-002 and AC-006) is proven with the sole `@cosmo-behavior plan:episodic-log#B-019` marker: abort before completion, between completion and child capture, and after normal terminal capture preserves authoritative existing completion semantics and leaves exactly one terminal episode for the frozen attempt.
- [ ] #2 Parent abort stops bridging, sends termination, waits for child exit, then reads an existing completion or writes the existing aborted shape before invoking the same shared terminal-event builder used by normal Drive.
- [ ] #3 Terminal identity derives from in-content `completedAt` plus run id, attempt id, and outcome—not mtime—so rewrites by `runDriveOnGraph`, `run-step`, driver-tool settle, and parent abort remain byte/content coherent and dedupe to one path.
- [ ] #4 Capture/reporter failure during abort remains non-fatal to the primary abort/completion result and uses the established diagnostic/stderr warning transport exactly once.
- [ ] #5 The terminal-evidence guarantee is scoped correctly: inline, `startDetached` plus parent `abort()`, and resume are reconcilable; an externally hard-killed fire-and-forget `launchDetached` child may retain the documented start-only residual but never a duplicate terminal pair.
- [ ] #6 No second abort ledger, cache, integrity/safe-prune verifier, or alternate serializer is introduced.
<!-- AC:END -->
