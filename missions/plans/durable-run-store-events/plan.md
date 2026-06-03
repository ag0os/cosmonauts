---
title: 'Durable Runtime Phase 1: Run Store and Normalized Events'
status: draft
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
---

## Overview

Prepare the first shared durable orchestration substrate by extracting a
generic file-backed run store shape and normalized event stream around current
Drive behavior.

This plan is intentionally a planner handoff, not a complete implementation
plan. A planner agent should expand it into a behavior-first `plan.md` after
reading the referenced code and architecture record.

## Architecture Context

This plan implements the first slice of
`missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`
- `D-002 - File-backed first`
- `D-003 - Drive compatibility before chain migration`
- `D-005 - Normalized events with backend details`
- `D-009 - Wave-1 controller surface is read-only`

Boundary rules this plan must preserve:

- Generic runtime store and event contracts must not depend on a specific
  backend.
- Drive must keep its existing event log, status classification, resume, and
  finalization recovery behavior while normalized events are added.
- CLI and extension surfaces may read normalized events, but must not duplicate
  store or status logic.

Key record sections for the planner: `## Core Contracts` for the canonical
`RunRecord` / `StepRecord` / `OrchestrationEvent` shapes this plan should
target, and `## Storage Layout` for the on-disk run directory the store should
produce.

## Planning Scope

The complete plan should cover:

- A `RunStore` interface and file-backed implementation.
- Generic `RunRecord`, initial `StepRecord` shape if needed, and normalized
  `OrchestrationEvent` types.
- A translation or bridge path from representative Drive events to normalized
  orchestration events.
- Compatibility `run_status` and `run_watch` read helpers over normalized
  events.
- Tests proving current Drive event/status/resume behavior remains unchanged.

## Files To Inspect

- `missions/architecture/durable-orchestration-runtime.md`
- `lib/driver/README.md`
- `lib/driver/event-stream.ts`
- `lib/driver/types.ts`
- `lib/driver/driver.ts`
- `lib/driver/run-step.ts`
- `lib/driver/run-run-loop.ts`
- `cli/drive/subcommand.ts`
- `domains/shared/capabilities/drive.md`

## Out Of Scope

- Scheduler execution.
- Backend adapter contracts.
- Durable chain compilation.
- Worktree isolation.
- SQLite, daemon, or remote coordinator storage.

## Planner Instructions

Before task creation, turn this draft into a full behavior-first plan:

- Add concrete `## Behaviors` with `B-###` IDs.
- Map each behavior to a named test and marker.
- Define exact files to change or create.
- Bind a quality contract to project-native test, lint, and typecheck gates.
- Keep task count in the normal 3-12 range, with each task scoped to one PR.
