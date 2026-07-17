---
id: TASK-478
title: >-
  Implement Drive identity, completion-first terminal capture, and resume
  reconciliation
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-474
  - TASK-475
  - TASK-476
  - TASK-477
createdAt: '2026-07-17T20:08:12.475Z'
updatedAt: '2026-07-17T20:08:12.475Z'
---

## Description

Implementation Order step 7 common Drive result/resolution/resume branch, after the parallel Cosmo, lifecycle-owner, and chain wiring checkpoint. Establish enabled-only execution-resolved actor freezing, attempt identity, deterministic `DriverResult.completedAt`, completion-first start/terminal ownership, and terminal-only prior-attempt resume reconciliation. This task solely owns B-017; detached compiled-child proof, diagnostics transport, disabled Drive parity, and parent abort have their own dependent tasks.

<!-- AC:BEGIN -->
- [ ] #1 B-017 (Sources AC-002 and AC-006) is proven with the sole `@cosmo-behavior plan:episodic-log#B-017` marker: every enabled inline Drive attempt that completes, blocks, aborts, or finalization-fails has one `drive.run` start/terminal pair with stable run subject, attempt tag, frozen source, and exact `DriverResult.outcome`, while primary completion bytes/events remain authoritative and capture failure cannot replace the result.
- [ ] #2 The frozen source equals the worker actually executed under undefined/default, `main`, project-bound `coding`, and live-bound `coding` contexts; launch reuses execution-path resolution, never introduces the rejected separate worker resolution contract, and resolution failure warns/skips capture without fabricating an actor or failing Drive.
- [ ] #3 `DriverResult.completedAt` is stamped once in completion content when the primary result is computed, and terminal timestamp/path/dedupe identity derives deterministically from that content plus run id, attempt id, and outcome—never filesystem mtime.
- [ ] #4 Completion persistence precedes terminal capture, thrown paths preserve their original throw behavior, and repeated terminal building across completion writers remains idempotent against the same content-derived identity.
- [ ] #5 Enabled resume preserves an existing frozen source, resolves a legacy source-less run once, and creates a new attempt only when execution reaches the mint seam; terminal-only CLI resume reconciles the prior frozen attempt and may write terminal-only evidence when capture was previously off, rather than creating a new run pair.
- [ ] #6 Drive constructs `TaskManager` and `PlanManager` without episode context, so multi-task status churn yields zero plan/task lifecycle episodes and only the Drive pair, preserving the O(runs) noise budget.
- [ ] #7 Only the planned optional Drive result/spec factory fields are additive; no second ledger, wake store, cache, integrity verifier, or non-fail-soft capture path is introduced.
<!-- AC:END -->
