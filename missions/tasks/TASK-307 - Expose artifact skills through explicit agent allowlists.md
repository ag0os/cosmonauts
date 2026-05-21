---
id: TASK-307
title: Expose artifact skills through explicit agent allowlists
status: To Do
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
  - TASK-306
createdAt: '2026-05-21T21:30:49.673Z'
updatedAt: '2026-05-21T21:30:49.673Z'
---

## Description

Update explicit agent skill allowlists so artifact-producing and plan-review agents can load the shared artifact guidance once the new skills exist. Do not change wildcard agent behavior beyond the approved files.

<!-- AC:BEGIN -->
- [ ] #1 B-013 is covered by `tests/agents/skills.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-013` marker near the executable test.
- [ ] #2 `planner` has access to `work-artifacts` and `architecture` in its explicit skill list.
- [ ] #3 `spec-writer` has access to `work-artifacts` in its explicit skill list.
- [ ] #4 `task-manager` has access to `task` and `work-artifacts` in its explicit skill list.
- [ ] #5 `plan-reviewer` has access to `work-artifacts` and `architecture` in its explicit skill list.
- [ ] #6 No full architect agent role is introduced.
<!-- AC:END -->
