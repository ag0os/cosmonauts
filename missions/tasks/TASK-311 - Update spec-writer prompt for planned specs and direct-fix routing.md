---
id: TASK-311
title: Update spec-writer prompt for planned specs and direct-fix routing
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
  - TASK-307
createdAt: '2026-05-21T21:31:16.270Z'
updatedAt: '2026-05-21T22:07:45.989Z'
---

## Description

Update the spec-writing prompt so it uses the shared artifact contract for spec shape and workflow-tier decisions without embedding the full reference content.

<!-- AC:BEGIN -->
- [ ] #1 B-003 is covered by `tests/prompts/spec-writer.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-003` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/spec-writer.md` routes direct fixes away from spec-writing and keeps specs optional for bugfix/patch work.
- [ ] #3 For planned feature/refactor work, spec-writing guidance requires `Acceptance Criteria` entries with stable `AC-###` IDs.
- [ ] #4 The prompt tells agents to load `work-artifacts` for artifact format and `/skill:plan` only for plan tooling/lifecycle concerns.
- [ ] #5 The prompt continues to describe the canonical `spec.md` sections without introducing concrete gate tools or enforcement-engine scope.
<!-- AC:END -->
