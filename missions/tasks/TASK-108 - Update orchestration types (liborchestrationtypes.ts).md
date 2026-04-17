---
id: TASK-108
title: Update orchestration types (lib/orchestration/types.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies: []
createdAt: '2026-03-21T03:54:58.659Z'
updatedAt: '2026-03-21T03:59:17.817Z'
---

## Description

Extend the existing types module to support parallel spawning concepts. This is a self-contained types-only change with no dependency on the new runtime modules.

**File**: `lib/orchestration/types.ts`

**Changes**:
- Add `SpawnHandle` type: `{ spawnId: string; role: string; status: "accepted" | "running" | "completed" | "failed" }`.
- Add optional `spawnDepth?: number` and `parentSessionId?: string` fields to the existing `SpawnConfig` type.
- Add `spawn_completion` variant to the `ChainEvent` union: carries `spawnId`, `role`, `outcome` (success/failure), and a brief `summary` string.

## Implementation Plan

AC #1: SpawnHandle exported ✓
AC #2: SpawnConfig extended with optional fields ✓
AC #3: ChainEvent spawn_completion variant added ✓
AC #4: No existing signatures broken (all additions are new or optional) ✓

<!-- AC:BEGIN -->
- [ ] #1 SpawnHandle type is exported with spawnId, role, and status fields (status union: accepted | running | completed | failed)
- [ ] #2 SpawnConfig has optional spawnDepth and parentSessionId fields added without breaking existing usages
- [ ] #3 ChainEvent union includes a spawn_completion variant with spawnId, role, outcome, and summary fields
- [ ] #4 No existing type signatures are broken (all additions are either new types or optional fields)
<!-- AC:END -->

## Implementation Notes

Added SpawnHandle interface, spawnDepth/parentSessionId to SpawnConfig, and spawn_completion to ChainEvent union. Also added the corresponding case to chain-event-logger.ts to satisfy TypeScript's exhaustiveness check on the switch statement.

Coordinator AC verification (all confirmed from implementation notes):
[x] #1 SpawnHandle exported with spawnId, role, status (accepted|running|completed|failed)
[x] #2 SpawnConfig extended with optional spawnDepth and parentSessionId
[x] #3 ChainEvent includes spawn_completion variant with spawnId, role, outcome, summary
[x] #4 No existing type signatures broken — all changes are new types or optional fields
