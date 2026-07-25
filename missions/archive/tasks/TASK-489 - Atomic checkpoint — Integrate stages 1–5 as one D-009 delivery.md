---
id: TASK-489
title: Atomic checkpoint — Integrate stages 1–5 as one D-009 delivery
status: Done
priority: high
labels:
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-484
  - TASK-485
  - TASK-486
  - TASK-487
  - TASK-488
createdAt: '2026-07-22T15:52:27.261Z'
updatedAt: '2026-07-22T20:31:00.759Z'
---

## Description

Atomic delivery checkpoint required by implementation order. Owned behaviors: none. This task is not the sole owner of any behavior, Design rule, Decision Log entry, file, or Quality Contract constraint; those remain with implementing tasks TASK-484 through TASK-488.

Stages 1–5 share one D-009 completion/outcome contract and no subset is mergeable or releasable. This dependency node makes stages 6–9 wait until the ledger, fallback convergence, live abort state, bridge drain, and deterministic terminal-only identity are integrated together.

<!-- AC:BEGIN -->
- [x] #1 The checkpoint contains the completed outputs of TASK-484 through TASK-488 together; no stage-1–5 subset is presented as a mergeable or releasable delivery.
- [x] #2 The integrated checkpoint preserves terminal legacy event → completion → episode capture ordering, reconstructible two-phase terminal ownership, and deterministic terminal-only resume across the stage-owned executable tests.
- [x] #3 All B-002–B-013, B-022, B-025–B-028 evidence and exact markers remain in their implementing tasks' named test files; this checkpoint does not substitute verification for implementation ownership.
- [x] #4 The stage-1–5 affected Vitest suites, `bun run lint`, and `bun run typecheck` pass as one integrated checkpoint before any downstream dependent task starts.
<!-- AC:END -->
