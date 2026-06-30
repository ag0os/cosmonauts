---
id: TASK-434
title: Document the sequential task-ID caveat and future renumber option
status: Done
priority: medium
labels:
  - testing
  - 'plan:task-id-system'
dependencies: []
createdAt: '2026-06-30T17:36:17.896Z'
updatedAt: '2026-06-30T18:04:07.971Z'
---

## Description

Update domains/shared/skills/task/SKILL.md and domains/shared/capabilities/tasks.md to describe configured sequential IDs allocated from active frontmatter + archived filenames, the accepted cross-branch collision caveat, and `cosmonauts task renumber` as a FUTURE-only reconciliation option (not implemented). Avoid hard-coding COSMO-NNN as the only ID shape. Owns B-011 — marker #B-011.

<!-- AC:BEGIN -->
- [x] #1 B-011: both docs describe active+archive sequential allocation and state IDs are sequential/readable but not branch-global
- [x] #2 B-011: both docs document the cross-branch duplicate caveat and mention task renumber only as a future option, not an implemented command
- [x] #3 tests/prompts/task-skill.test.ts reads both docs, asserts the caveat/renumber wording, carries the #B-011 marker, and passes
<!-- AC:END -->
