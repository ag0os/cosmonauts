---
title: 'Durable Runtime Phase 3: Graph Scheduler'
status: draft
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
---

## Overview

Implement a local durable graph scheduler that can execute persisted run graphs
through generic backend adapters without being owned by the live interactive
agent session.

The first scheduler should stay intentionally small: file-backed,
single-host, sequential-first, and bounded when parallelism is enabled.

## Architecture Context

This plan implements the third slice of
`missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`
- `D-002 - File-backed first`
- `D-004 - No default hard timeout for durable runs`
- `D-007 - First scheduler is local and sequential-first`
- `D-010 - Scheduler runs in-process for wave 1`

Boundary rules this plan must preserve:

- Scheduler logic must not assume the live interactive session remains alive.
- Hard timeout is policy, not a runtime invariant.
- Parallel mutable execution must remain constrained until worktree policy is
  explicit.
- Store, event, backend, and scheduler contracts should stay separable.

Key record sections for the planner: `## Scheduler Model` for terminal-state,
status-monotonicity, and crash-recovery rules, and `## Cross-Plan Acceptance
Scenarios` scenarios 2 (scheduler crash) and 4 (long idle work) as the
acceptance bar.

## Planning Scope

The complete plan should cover:

- Graph loading and dependency satisfaction.
- Step readiness, leasing, running, waiting, blocked, completed, failed,
  cancelled, and stale transitions.
- Heartbeat recording and stale lease detection.
- Retry or block transitions based on policy.
- Terminal run finalization.
- Bounded parallelism after sequential scheduling is proven.
- Crash/restart recovery tests for existing heartbeats, stale leases, and
  already completed steps.

## Files To Inspect

- `missions/architecture/durable-orchestration-runtime.md`
- Runtime store/contracts created by `durable-run-store-events`
- Backend/step contracts created by `durable-backend-step-model`
- `lib/driver/run-step.ts`
- `lib/driver/run-run-loop.ts`
- `lib/orchestration/semaphore.ts`
- `lib/orchestration/spawn-tracker.ts`
- `lib/orchestration/message-bus.ts`

## Out Of Scope

- Drive graph compiler.
- Durable chain compiler.
- Coordinator loop controllers.
- Nested run cancellation policy.
- Daemon process model.
- SQLite or remote coordinator.

## Planner Instructions

Before task creation, turn this draft into a full behavior-first plan:

- Add concrete `## Behaviors` with `B-###` IDs.
- Map each behavior to scheduler-focused named tests and markers.
- Define monotonic status-transition rules and retry attempt persistence.
- Include explicit crash/restart and stale heartbeat scenarios.
- Avoid broad parallel execution until the sequential scheduler behavior is
  covered.
