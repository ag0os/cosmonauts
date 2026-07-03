---
id: TASK-446
title: Verify memory-half checkpoint before viewer work
status: To Do
priority: high
labels:
  - testing
  - devops
  - 'plan:code-structure-map'
dependencies:
  - TASK-445
createdAt: '2026-07-03T14:13:35.426Z'
updatedAt: '2026-07-03T14:13:35.426Z'
---

## Description

Implementation order step 6 checkpoint. Behavior ownership: none; this task is the required quality gate between memory delivery and artifact-viewer work. It must verify that the map generator, freshness, CLI, audit, and agent-consumption half of the plan is independently shippable before any viewer implementation starts.

<!-- AC:BEGIN -->
- [ ] #1 The memory-half project-native correctness evidence passes for audit, architecture-map fixtures, architecture CLI behavior, freshness, and extension behavior.
- [ ] #2 Artifact-conformance evidence shows all implemented planned-behavior tests/evidence carry their expected `@cosmo-behavior plan:code-structure-map#...` markers without changing behavior ownership.
- [ ] #3 Boundary-conformance evidence shows `lib/architecture-map` has no imports from CLI, domains/extensions, artifact viewer, plans, tasks, orchestration, or Pi runtime/session APIs.
- [ ] #4 Freshness evidence confirms generate-time content hashing and turn-time stat-fingerprint semantics remain disk-derived and cache-independent.
- [ ] #5 Narrative evidence confirms tests use fakes and do not perform live model calls.
- [ ] #6 The checkpoint result is recorded in the task's implementation notes so dependent viewer tasks can start from a verified memory-half baseline.
<!-- AC:END -->
