---
id: TASK-635
title: 'Stage 3: Preserve committed-write truth through every result path'
status: In Progress
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-645
createdAt: '2026-09-07T15:38:07.280Z'
updatedAt: '2026-09-07T22:28:08.931Z'
---

## Description

Implement only Stage 3, Implementation Order steps 13-15, as one test-first commit so RED evidence is followed by GREEN and refactor without committing red. Own B-007, B-008, and fidelity B-012 and their executable markers. Owning seams are `lib/memory/consolidation-receipts.ts` error wrapping and `markMaterialized()` transition into `lib/memory/living-memory.ts` source-recovery fold, details assembly, failure/no-work/success branches, with the named living-memory tests.

Ratified-ground handling: the common constraints and the spec's INV-003/INV-004 and AC-007..AC-009/AC-011 letter are stop-and-escalate ground. The commit accumulator may be repaired only within these owning modules; retirement transactions are not a refactor seam.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order step 15) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order steps 14 and 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (B-007, B-008, B-012; Quality Contract assertion 4; Implementation Order steps 13-15) The named executable counterexamples carry only their matching `@cosmo-behavior plan:living-memory-fidelity#B-007`, `#B-008`, and fidelity `#B-012` markers and are observed failing for the intended defects before production edits: a first receipt removal that unlinks then fails parent sync returns failed with `writesCommitted: true`, leaves the receipt absent, preserves the original sync failure, and keeps the later-removal regression green; source-recovery-only work preserves its non-empty `episodePrunes`, reports `writesCommitted: true`, and returns `ran`, not `noop`; and an accepted-to-materialized retry whose only durable act is receipt replacement reports `writesCommitted: true` and does not return `noop`.
- [ ] #7 (Quality Contract assertions 4-5; Implementation Order steps 14-15) `writesCommitted` is OR-monotonic across retirement recovery, source recovery, receipt discharge, accepted-receipt materialization, proposal writes, episode pruning, retirement application, and all later success/failure/no-work/incomplete-inventory details reconstructions; the receipt wrapper includes a thrown removal error's own committed bit as well as prior removals, source recovery fields survive assembly, no separate cross-file accumulator or retirement-transaction refactor is introduced, and after refactor B-001..B-008 plus fidelity B-012 and the exact parent B-012/B-016/B-021 tests pass.
- [ ] #8 (Plan ## Behaviors Test fields; Quality Contract assertion 5) Each owned counterexample lands at its exact plan-declared file and test name: B-007 at `tests/memory/living-memory.test.ts` > `reports a committed first receipt removal when its directory sync fails`; B-008 at `tests/memory/living-memory.test.ts` > `preserves source-recovery episode prunes and committed writes in the final result`; B-012 at `tests/memory/living-memory.test.ts` > `reports committed writes for a materialization-only retry pass`. A counterexample landing under a different name leaves the plan's Test fields stale with nothing mechanical to catch it, because artifact conformance validates only the Test field's file path and marker presence in that file, never the test name.
<!-- AC:END -->
