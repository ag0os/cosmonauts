---
id: TASK-437
title: Remove the blanket Biome missions exclusion and clean config.json
status: Done
priority: medium
labels:
  - devops
  - testing
  - 'plan:task-id-system'
dependencies:
  - TASK-435
  - TASK-436
createdAt: '2026-06-30T17:36:43.466Z'
updatedAt: '2026-06-30T18:14:26.832Z'
---

## Description

Remove the blanket files.includes "!missions" exclusion from biome.json (vcs.useIgnoreFile is already true so .gitignore keeps excluding generated session transcripts). Remove the legacy lastIdNumber field from missions/tasks/config.json and format it once. Add tests/config/biome.test.ts. Owns B-012 — marker #B-012. If removing the exclusion surfaces a large unrelated historical artifact backlog, STOP and flag for plan revision rather than reintroducing a blanket missions exclusion.

<!-- AC:BEGIN -->
- [x] #1 B-012: biome.json no longer blanket-excludes tracked missions/ artifacts and .gitignore still excludes session transcripts
- [x] #2 B-012: the lint/static-analysis gate is green across tracked missions/ artifacts after the change
- [x] #3 missions/tasks/config.json no longer contains lastIdNumber and is not churned by subsequent task creation
- [x] #4 tests/config/biome.test.ts asserts the exclusion is gone and transcripts stay ignored, carries #B-012, and passes
<!-- AC:END -->
