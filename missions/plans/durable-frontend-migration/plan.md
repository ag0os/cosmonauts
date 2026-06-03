---
title: 'Durable Runtime Phase 4: Frontend Migration'
status: draft
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
---

## Overview

Route current user-facing orchestration frontends onto the durable runtime in a
compatible, incremental way.

This plan should run after the store/events, backend/step model, and scheduler
plans are implemented and verified. It should migrate Drive first, then add a
narrow durable chain compiler.

## Architecture Context

This plan implements the fourth slice of
`missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`
- `D-003 - Drive compatibility before chain migration`
- `D-006 - Step results must distinguish unknown from success`
- `D-008 - Durable chains start narrow`
- `D-009 - Wave-1 controller surface is read-only`

Boundary rules this plan must preserve:

- Existing `cosmonauts drive`, `run_driver`, workflows, and `chain_run` surfaces
  must remain backwards compatible through wrappers or explicit inline mode.
- Chain loops and coordinator-style waiting must not be silently converted into
  brittle graph behavior.
- Drive graph compilation must preserve task order, finalization recovery, and
  report contract behavior.

Key record sections for the planner: `## Compilers` and `## Compatibility
Surface` for the target chain/Drive mappings and `chain_run` / `run_driver`
wrapper shapes, and `## Cross-Plan Acceptance Scenarios` scenarios 1 (large
implementation plan) and 5 (self-modifying run — preserve the existing detached
frozen runner) as the acceptance bar. Mutating controls (`run_pause` /
`run_resume` / `run_cancel` / `run_intervene`) stay out of this wave per
`D-009`.

## Planning Scope

The complete plan should cover:

- Drive graph compiler:
  - one task-execution step per selected task;
  - explicit `taskIds` order preservation;
  - dependency waves where current task dependencies support them;
  - finalizer steps for source commit, task status, and final state commit.
- CLI/tool routing for `cosmonauts drive` and `run_driver`.
- Compatibility `watch_events` behavior over normalized runtime events.
- Chain compiler support for:
  - `a -> b`;
  - `[a, b]`;
  - `reviewer[3]`-style fan-out;
  - explicit fallback for unsupported loops.
- Legacy inline chain mode for small/debug/unsupported cases.

## Files To Inspect

- `missions/architecture/durable-orchestration-runtime.md`
- Runtime modules created by the first three plans.
- `cli/drive/subcommand.ts`
- `domains/shared/capabilities/drive.md`
- `lib/driver/driver.ts`
- `lib/driver/run-step.ts`
- `lib/orchestration/chain-parser.ts`
- `lib/orchestration/chain-steps.ts`
- `lib/orchestration/chain-runner.ts`
- `domains/shared/extensions/orchestration/chain-tool.ts`
- `cli/main.ts`
- `cli/chain-event-logger.ts`

## Out Of Scope

- Durable coordinator loops.
- Full nested-run lifecycle policy.
- Worktree isolation and merge finalizers.
- Approval gate expansion.
- Cost accounting across nested run trees.
- Daemon or alternative store model.

## Planner Instructions

Before task creation, turn this draft into a full behavior-first plan:

- Add concrete `## Behaviors` with `B-###` IDs.
- Map each behavior to named compatibility tests and markers.
- Separate Drive migration tasks from chain compiler tasks.
- Include explicit fallback/unsupported behavior tests for chain loops.
- Treat unchanged current Drive/chain UX as first-class acceptance criteria.
