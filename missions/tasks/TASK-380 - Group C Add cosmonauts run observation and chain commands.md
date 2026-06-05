---
id: TASK-380
title: 'Group C: Add cosmonauts run observation and chain commands'
status: To Do
priority: medium
labels:
  - backend
  - api
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-377
  - TASK-379
createdAt: '2026-06-05T21:57:43.760Z'
updatedAt: '2026-06-05T21:57:43.760Z'
---

## Description

Implementation Order T6 from plan orchestration-surface-consolidation.

Dependencies: T3, T5.
Behaviors: B-010, B-011, B-013.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-010, #B-011, and #B-013 near the executable tests.

Group C starts only after Group A is green.

<!-- AC:BEGIN -->
- [ ] #1 Register `cosmonauts run`, and extract the shared bootstrap seam (Pi-flags + domain/plugin-dir/model/thinking/completion-label/profile + `CosmonautsRuntime.create`) used by both workflow mode and `cli/run/*`, since the subcommand dispatch at `cli/main.ts:795` otherwise bypasses top-level flag parsing. A test proves `run chain` honors those options.
- [ ] #2 Implement `run status|watch|list` over normalized controller/store with scope resolution and JSON-only stdout.
- [ ] #3 Implement `run chain <expression-or-name>` using named-chain exact lookup before raw DSL fallback; tests include shipped single-token named chain `verify` or `adapt`.
- [ ] #4 Implement `run chain --name <name>` as explicit named-only mode; tests include a project chain named `list` and verify bare `run chain list` still lists.
- [ ] #5 Implement `run chain list` using `lib/chains`, preserving applicable domain/model/thinking/completion/profile behavior.
- [ ] #6 Progress goes to stderr; stdout is exactly one JSON value.
<!-- AC:END -->
