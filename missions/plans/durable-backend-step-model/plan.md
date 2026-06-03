---
title: 'Durable Runtime Phase 2: Backend and Step Model'
status: draft
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
---

## Overview

Introduce the generic backend and step model that lets Drive task execution be
described as durable orchestration steps before the graph scheduler owns
execution.

This plan should be designed after `durable-run-store-events` has established
the initial store and normalized event contracts.

## Architecture Context

This plan implements the second slice of
`missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`
- `D-003 - Drive compatibility before chain migration`
- `D-005 - Normalized events with backend details`
- `D-006 - Step results must distinguish unknown from success`

Boundary rules this plan must preserve:

- Generic backend contracts must not depend on Drive-specific task management.
- Drive backend wrappers may adapt current behavior, but should not fork or
  duplicate invocation/report parsing logic.
- Finalization failures remain distinct from behavioral task failures.

Key record sections for the planner: `## Core Contracts` for the canonical
`OrchestrationBackend`, `StepRecord`, and `StepResult` shapes, and
`## Cross-Plan Acceptance Scenarios` scenario 3 (external backend malformed
report) as the acceptance bar for `D-006`.

## Planning Scope

The complete plan should cover:

- `OrchestrationBackend`, `BackendSpec`, `BackendCapabilities`,
  `BackendContext`, `PreparedStep`, and `BackendHandle` contracts.
- Wrappers or adapters for current Drive backends, likely `codex`,
  `claude-cli`, and internal `cosmonauts-subagent` where appropriate.
- `StepRecord` persistence for Drive task execution.
- Attempt/result modeling so retries or resumes do not erase old evidence.
- Finalizer-step modeling for source commit, task status, final task-state
  commit, and pending finalization recovery.
- Tests for malformed report handling and finalization-vs-behavior status.

## Files To Inspect

- `missions/architecture/durable-orchestration-runtime.md`
- `lib/driver/backends/types.ts`
- `lib/driver/backends/codex.ts`
- `lib/driver/backends/claude-cli.ts`
- `lib/driver/backends/cosmonauts-subagent.ts`
- `lib/driver/report-parser.ts`
- `lib/driver/run-one-task.ts`
- `lib/driver/run-run-loop.ts`
- `lib/driver/state-commit.ts`
- `lib/driver/types.ts`
- `lib/orchestration/session-factory.ts`

## Out Of Scope

- Implementing graph scheduling.
- Routing `cosmonauts drive` through graph runs.
- Durable chain compilation.
- Nested run lifecycle policy.
- Worktree isolation and merge finalizers.

## Planner Instructions

Before task creation, turn this draft into a full behavior-first plan:

- Add concrete `## Behaviors` with `B-###` IDs.
- Map each behavior to a named test and marker.
- Define exact ownership between runtime contracts and Drive adapters.
- Include test coverage for report quality, result contracts, and
  finalization recovery.
- Keep each task scoped to one PR.
