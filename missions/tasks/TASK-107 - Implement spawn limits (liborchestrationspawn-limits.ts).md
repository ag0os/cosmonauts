---
id: TASK-107
title: Implement spawn limits (lib/orchestration/spawn-limits.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies: []
createdAt: '2026-03-21T03:54:50.822Z'
updatedAt: '2026-03-21T03:59:17.818Z'
---

## Description

Create the default spawn limit constants and resolution functions. Standalone module — no dependencies on other new modules.

**File**: `lib/orchestration/spawn-limits.ts`
**Tests**: `tests/orchestration/spawn-limits.test.ts`

**API surface**:
- `DEFAULT_MAX_CONCURRENT_SPAWNS = 5` — caps simultaneous child sessions per parent.
- `DEFAULT_MAX_SPAWN_DEPTH = 2` — prevents infinite nesting (coordinator → worker = depth 1; worker spawning further = depth 2, which hits the default limit).
- `resolveMaxConcurrentSpawns(override?: number)` — returns the override if provided and valid, else the default.
- `resolveMaxSpawnDepth(override?: number)` — same pattern for depth.

Adapted from OpenClaw's `config/agent-limits.ts` (`DEFAULT_AGENT_MAX_CONCURRENT=4`, `DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH=1`), with adjusted defaults per the plan.

<!-- AC:BEGIN -->
- [ ] #1 DEFAULT_MAX_CONCURRENT_SPAWNS and DEFAULT_MAX_SPAWN_DEPTH constants are exported with correct default values (5 and 2)
- [ ] #2 resolveMaxConcurrentSpawns() returns the caller-provided override when it is a positive integer
- [ ] #3 resolveMaxConcurrentSpawns() returns DEFAULT_MAX_CONCURRENT_SPAWNS when called with no argument or an invalid value
- [ ] #4 resolveMaxSpawnDepth() behaves equivalently for spawn depth
- [ ] #5 Tests cover: default values, valid overrides, zero/negative/non-integer overrides treated as invalid
<!-- AC:END -->

## Implementation Notes

Implemented as a pure, dependency-free module. `isPositiveInteger` guards both resolvers — rejects zero, negatives, and floats. 12 tests all pass.

Coordinator AC verification (all confirmed from implementation notes):
[x] #1 DEFAULT_MAX_CONCURRENT_SPAWNS=5 and DEFAULT_MAX_SPAWN_DEPTH=2 exported
[x] #2 resolveMaxConcurrentSpawns() returns valid positive-integer overrides
[x] #3 resolveMaxConcurrentSpawns() falls back to default for missing/invalid values
[x] #4 resolveMaxSpawnDepth() behaves equivalently
[x] #5 All test scenarios covered — 12 tests pass
