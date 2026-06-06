---
id: TASK-345
title: Add Drive backend orchestration adapter
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-344
createdAt: '2026-06-04T02:50:18.408Z'
updatedAt: '2026-06-04T03:00:45.460Z'
---

## Description

Implementation Order step 2 for durable-backend-step-model. Add the compatibility adapter for existing Drive backends after the runtime contracts exist, without changing Drive's current backend execution path. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-002` near the executable test named in the plan.

<!-- AC:BEGIN -->
- [x] #1 B-002 is satisfied by `tests/driver/backends/orchestration-adapter.test.ts` > `starts wrapped Drive backends with unchanged invocations and pinned capabilities`, proving wrapped Drive backends call the underlying `Backend.run(invocation)` exactly once with unchanged invocation fields and abort signal.
- [x] #2 B-002 adapter identity and capabilities use the explicit configured known backend name with the pinned `codex`, `claude-cli`, and `cosmonauts-subagent` capability records; arbitrary `Backend.name` test/fake values are not persisted as runtime backend identity.
- [x] #3 B-002 unsupported `resume` and `cancel` are explicit, backend output is returned unchanged, and the adapter does not duplicate prompt rendering, report parsing, verification, commit, task update, or finalization behavior.
<!-- AC:END -->
