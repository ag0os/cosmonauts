---
id: TASK-387
title: Lock conventional domain loading and scaffold canonical root layout
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-385
createdAt: '2026-06-23T21:13:55.419Z'
updatedAt: '2026-06-24T13:23:46.888Z'
---

## Description

Finish the convention-over-configuration part of Implementation Order step 1 for ordinary domain folders and newly scaffolded domains. This task owns B-001 and B-003; tests must use the named files and exact behavior markers.

<!-- AC:BEGIN -->
- [x] #1 B-001 a conventional domain folder containing `domain.ts`, `agents/<id>.ts`, and `prompts/<id>.md` loads without a registration file and assembles the matching persona by agent id, proven in `tests/domains/loader.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-001`.
- [x] #2 B-003 the domain scaffold emits the canonical root-domain package layout and `cosmonauts.json` declares `path: "."`, proven in `tests/cli/create/subcommand.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-003`.
- [x] #3 Existing conventional multi-domain folder loading remains compatible with the new root-domain package scaffold output.
<!-- AC:END -->
