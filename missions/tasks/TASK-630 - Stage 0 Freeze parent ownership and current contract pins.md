---
id: TASK-630
title: 'Stage 0: Freeze parent ownership and current contract pins'
status: Done
priority: high
labels:
  - testing
  - backend
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-07T15:34:50.148Z'
updatedAt: '2026-09-07T20:21:27.513Z'
---

## Description

Implement Implementation Order steps 1-3 only. Establish the green baseline in `tests/memory/interface.test.ts` before any remediation stage begins. This task adds only the current-state portions of the future B-009/B-011 content contract; it does not own any fidelity behavior. B-009, B-010, and B-011 remain owned by the Stage 4 implementation task.

Ratified-ground handling: the five common constraints below, the spec Intent invariants and acceptance-criterion letter, and user-directed D-005/D-006/D-007 are stop-and-escalate ground under the deviation protocol. Do not worker-adjust them. If the Stage-0/Stage-4 split cannot remain green, halt and draft an amendment rather than committing placeholders or red tests.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order step 3) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (Quality Contract assertions 5 and 7; Implementation Order step 3) Green-today interface assertions preserve all six exact parent carriers: parent B-012 on `exposes exact living-memory outcomes through configured knowledge consolidate only`; parent B-016 on `rehydrates accepted judgment and persisted evidence then converges to noop`, `retains a live receipt when a later pass exhausts its record limit`, and `retains a live receipt when a later pass exhausts its byte allowance`; and parent B-021 on `measures index pressure with the exact injection renderer and budget` and `measures oversized corpus metadata exactly as combined-context injection`. The current full-source SHA-256 of `lib/memory/types.ts` and today's frozen authority, receipt-floor, byte-authority, and fail-closed-validation assertions are pinned and green.
- [x] #7 (Artifact-conformance threshold; Implementation Order step 3) Stage 0 contains no placeholder `living-memory-fidelity#B-001..B-012` markers and no premature assertion of the future `measured | unusable` result shape; those executable assertions remain deferred to Implementation Order step 17, and the Stage-0 commit is green.
- [x] #8 (Quality Contract gate 2, degradation note; Implementation Order step 3) Artifact conformance for `living-memory-fidelity#B-001..B-012` is expected non-green from Stage 0 through Stage 3, because each fidelity marker lands with its RED counterexample in the stage that owns it. A red `plan check-artifacts` inside that window is not a gate failure and must never be resolved with placeholder markers or non-executable test stubs; it is required to be green at Stage 4 (TASK-637 and TASK-638).
<!-- AC:END -->
