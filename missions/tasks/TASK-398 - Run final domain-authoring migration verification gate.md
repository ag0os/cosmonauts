---
id: TASK-398
title: Run final domain-authoring migration verification gate
status: Done
priority: medium
labels:
  - testing
  - devops
  - 'plan:domain-authoring'
dependencies:
  - TASK-397
createdAt: '2026-06-23T21:15:19.336Z'
updatedAt: '2026-06-24T14:18:59.587Z'
---

## Description

Implementation Order step 10. Final verification-only task after all behavior implementation and documentation tasks are complete. Do not add new product scope here; confirm the complete domain-authoring migration satisfies the plan's Quality Contract and project verification gates.

<!-- AC:BEGIN -->
- [x] #1 All behavior-owned evidence files for B-001 through B-024 exist and contain their exact `@cosmo-behavior plan:domain-authoring#B-###` markers near executable tests or docs evidence.
- [x] #2 The project-native verification commands `bun run test`, `bun run lint`, and `bun run typecheck` pass for the completed domain-authoring slice.
- [x] #3 Final artifact-conformance confirms no active runtime references remain to old framework prompt paths or old bundled nested coding paths unless explicitly documented as archived-only.
- [x] #4 Boundary review confirms domain binding and visibility rules are centralized in domain APIs and not reimplemented independently in CLI or extension code.
<!-- AC:END -->
