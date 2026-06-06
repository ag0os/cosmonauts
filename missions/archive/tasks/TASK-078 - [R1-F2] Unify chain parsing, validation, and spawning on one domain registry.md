---
id: TASK-078
title: '[R1-F2] Unify chain parsing, validation, and spawning on one domain registry'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - architecture
  - domains
  - orchestration
  - cli
dependencies: []
createdAt: '2026-03-09T17:55:51.136Z'
updatedAt: '2026-03-09T18:04:54.048Z'
---

## Description

Reviewer finding R1-F2: CLI chain/workflow execution paths and chain runner use inconsistent registry instances, breaking qualified/custom domain stages and refactor invariants. Thread one loaded registry through parse, run, and spawn.

<!-- AC:BEGIN -->
- [x] #1 CLI chain/workflow paths pass the loaded registry into parseChain().
- [x] #2 CLI chain/workflow paths pass the same registry into runChain().
- [x] #3 runChain() creates its spawner with the provided registry, not a separate default registry.
- [x] #4 Qualified stage names (e.g. `coding/coordinator`) execute successfully when present in registry.
- [x] #5 Loop stage detection for qualified/custom roles uses registry definitions (no false `loop: false`).
- [x] #6 Tests cover at least one qualified stage chain end-to-end through parse + run.
<!-- AC:END -->

## Implementation Notes

Three changes thread one loaded registry through the full chain lifecycle:\n\n1. `cli/main.ts`: Both `--chain` and `--workflow` paths now pass the loaded `registry` to `parseChain()` and `runChain()` (via `config.registry`).\n\n2. `lib/orchestration/chain-runner.ts`: `runChain()` now calls `createPiSpawner(resolveRegistry(config))` instead of `createPiSpawner()`, ensuring the spawner uses the same registry as the rest of the chain.\n\n3. `tests/orchestration/chain-runner.test.ts`: Added 4 end-to-end tests in a new \"qualified stage chain end-to-end\" describe block, covering qualified one-shot stages, qualified loop stages with correct loop detection, mixed qualified/unqualified names, and unknown qualified name failure.\n\nAll 703 tests pass. Typecheck clean. No new lint errors introduced."
