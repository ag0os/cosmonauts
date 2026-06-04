---
id: TASK-374
title: Group B — Prove Drive graph acceptance recovery and final quality gates
status: To Do
priority: medium
labels:
  - 'group:b'
  - backend
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-373
createdAt: '2026-06-04T20:49:05.360Z'
updatedAt: '2026-06-04T20:49:05.360Z'
---

## Description

Owns Group B Implementation Order steps 14 and 15. Worker should implement B-021 and B-022 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. This is the final plan task and must run the integrated quality ladder once all plan behavior markers/tests exist.

<!-- AC:BEGIN -->
- [ ] #1 B-021 is proven by `tests/driver/drive-on-graph-acceptance.test.ts` > `survives scheduler host death and resumes a large sequential drive graph`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-021`.
- [ ] #2 B-022 is proven by `tests/driver/drive-on-graph-recovery.test.ts` > `applies committed-work block and leave-running recovery paths to selected drive backends`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-022`.
- [ ] #3 Large graph recovery reconstructs ready/running/completed state from persisted `graph.json`, step records, attempt records, heartbeats, original selected task IDs, and pending-finalization state without duplicating completed tasks or commits.
- [ ] #4 Recovery coverage uses production Drive backend adapter capability code across selected backend cases: commit-capable stale running work blocks conservatively, fresh external non-resumable work remains leave-running/waiting without duplicate starts, and each production map still contains only the selected backend plus `shell-command`.
- [ ] #5 The final integrated quality ladder is green: full project-native test step passes, project-native lint/typecheck gates pass, and durable-runtime modules remain frontend-agnostic with Drive/chain bridge code at frontend edges.
- [ ] #6 The artifact-conformance gate passes once all behavior markers/tests exist: `cosmonauts plan check-artifacts durable-frontend-migration`.
<!-- AC:END -->
