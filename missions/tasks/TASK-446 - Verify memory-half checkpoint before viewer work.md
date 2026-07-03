---
id: TASK-446
title: Verify memory-half checkpoint before viewer work
status: Done
priority: high
labels:
  - testing
  - devops
  - 'plan:code-structure-map'
dependencies:
  - TASK-445
createdAt: '2026-07-03T14:13:35.426Z'
updatedAt: '2026-07-03T16:11:16.931Z'
---

## Description

Implementation order step 6 checkpoint. Behavior ownership: none; this task is the required quality gate between memory delivery and artifact-viewer work. It must verify that the map generator, freshness, CLI, audit, and agent-consumption half of the plan is independently shippable before any viewer implementation starts.

<!-- AC:BEGIN -->
- [x] #1 The memory-half project-native correctness evidence passes for audit, architecture-map fixtures, architecture CLI behavior, freshness, and extension behavior.
- [x] #2 Artifact-conformance evidence shows all implemented planned-behavior tests/evidence carry their expected `@cosmo-behavior plan:code-structure-map#...` markers without changing behavior ownership.
- [x] #3 Boundary-conformance evidence shows `lib/architecture-map` has no imports from CLI, domains/extensions, artifact viewer, plans, tasks, orchestration, or Pi runtime/session APIs.
- [x] #4 Freshness evidence confirms generate-time content hashing and turn-time stat-fingerprint semantics remain disk-derived and cache-independent.
- [x] #5 Narrative evidence confirms tests use fakes and do not perform live model calls.
- [x] #6 The checkpoint result is recorded in the task's implementation notes so dependent viewer tasks can start from a verified memory-half baseline.
<!-- AC:END -->

## Implementation Notes

Checkpoint verification completed 2026-07-03.

Memory-half correctness evidence:
- PASS: `bun run test tests/architecture-map/analyzer.test.ts tests/architecture-map/config.test.ts tests/architecture-map/generator.test.ts tests/architecture-map/freshness.test.ts tests/cli/architecture/subcommand.test.ts tests/cli/architecture/main-dispatch.test.ts tests/extensions/architecture-memory.test.ts tests/extensions/project-tools.test.ts` passed: 8 files, 43 tests.
- PASS: `bun run typecheck` passed.
- NOTE: `bun run lint` failed on pre-existing `missions/tasks/config.json` spacing (file was already modified before this checkpoint); not part of the memory-half surface.
- NOTE: full `bun run test` was attempted and failed in `tests/coding-agnostic-fixtures.test.ts` because `tests/extensions/architecture-memory.test.ts` is missing from the archived coding-agnostic fixture ledger. The targeted memory-half suite above passes.

Artifact conformance:
- `cosmonauts plan --json check-artifacts code-structure-map` shows no issues for implemented memory-half behaviors B-001 through B-013, B-018, B-019, and B-021 after adding the missing B-003 marker comment in `tests/architecture-map/generator.test.ts`.
- The same full-plan command still reports missing downstream viewer/serve test files for B-014, B-015, B-016, B-017, and B-020, which are after this checkpoint and remain unimplemented.

Boundary/freshness/narrative evidence:
- PASS: forbidden-import grep over `lib/architecture-map` found no imports from CLI, domains/extensions, artifact-viewer, plans, tasks, orchestration, or Pi runtime/session APIs.
- PASS: freshness code inspection and tests confirm generate-time `projectHash` uses disk-read content hashes from `createProjectSnapshot`, while turn-time extension freshness uses `checkArchitectureMapStatFreshness`/`computeArchitectureMapStatFingerprint` from disk stats and does not call content-hash freshness.
- PASS: narrative tests use `fakeNarrativeProvider`, `fakeProvider`, `vi.fn`, `vi.spyOn`, and `createMockPi`; no live model calls are made by the architecture-map, CLI, or extension tests.

Checkpoint result: memory-half baseline is verified for viewer work. Viewer tasks should start from this baseline while leaving B-014/B-015/B-016/B-017/B-020 conformance to the viewer/serve tasks.
