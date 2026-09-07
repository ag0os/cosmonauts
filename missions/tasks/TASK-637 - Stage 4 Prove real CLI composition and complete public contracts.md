---
id: TASK-637
title: 'Stage 4: Prove real CLI composition and complete public contracts'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-636
createdAt: '2026-09-07T15:39:20.544Z'
updatedAt: '2026-09-07T15:39:20.544Z'
---

## Description

Implement only Stage 4 Implementation Order step 17. Own B-009, B-010, and B-011 and their executable markers, completing the green-today assertions prepared in Stage 0 without re-owning parent behavior. Owning seams/adapters are `tests/memory/interface.test.ts` against `lib/memory/types.ts`/`lib/memory/index.ts`, and the real production composition `cli/memory/subcommand.ts` → production corpus source → shared pressure policy compared with `lib/extensions/knowledge-surface/combined-context.ts`, proven in `tests/cli/memory/subcommand.test.ts`. CLI production code changes only if the existing public result serialization needs composition wiring; no parallel DTO or measurement path is allowed.

Ratified-ground handling: the common constraints and the spec's INV-001/INV-004 and AC-009..AC-011 letter are stop-and-escalate ground. The real-composition test must use a temporary byte-for-byte corpus copy and temporary home; it never points a write-capable process at live `knowledge/`.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order step 17) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (B-009, B-010, B-011; Quality Contract assertions 5-7; Implementation Order step 17) The named executable tests carry only their matching `@cosmo-behavior plan:living-memory-fidelity#B-009`, `#B-010`, and `#B-011` markers: the ownership contract verifies all six exact parent carrier marker/name pairs remain parent-owned and every B-001..B-012 fidelity marker occurs on its own named executable counterexample only; the real binary against a temporary byte-for-byte copy of all 237 corpus files and a temporary home reports JSON kind `ran` or `noop`, `recovery: "none"`, `writesCommitted: false`, and measured bytes equal to the copied combined-context render while source and copy hashes remain unchanged; and the interface contract verifies `MemoryConsolidateDetails` exposes measured-or-unusable pressure, all frozen contracts remain strong, and every full-source `lib/memory/types.ts` SHA-256 assertion is re-pinned in the same commit if that file changes.
- [ ] #7 (B-009, B-010, B-011; Quality Contract assertions 1, 5-7; Implementation Order step 17) The production CLI factory demonstrably composes the production corpus adapter and shared pressure policy used by the public result, compares through the actual combined-context knowledge renderer rather than a parallel measurement/DTO, keeps the `knowledgeSurface` gate enabled, executes only on temporary fixtures/copies during the automated test, and completes the Stage-0 split without placeholder markers or weakened exact result-key, parent-owner, pin, receipt-floor, byte-authority, or fail-closed assertions.
- [ ] #8 (Plan ## Behaviors Test fields; Quality Contract assertion 5) Each owned counterexample lands at its exact plan-declared file and test name: B-009 at `tests/memory/interface.test.ts` > `keeps living-memory behavior ownership while fidelity regressions use fidelity markers`; B-010 at `tests/cli/memory/subcommand.test.ts` > `matches real-corpus injection pressure through the CLI composition root on a copy`; B-011 at `tests/memory/interface.test.ts` > `re-pins the memory contract without weakening living-memory authority`. A counterexample landing under a different name leaves the plan's Test fields stale with nothing mechanical to catch it, because artifact conformance validates only the Test field's file path and marker presence in that file, never the test name.
- [ ] #9 (Quality Contract gate 2; Implementation Order step 17) `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` run from the repository root exits 0 and reports 12 behaviors with 0 issues and 0 advisories. B-009's contract asserts marker-and-name pairs for all twelve fidelity behaviours and all six parent carriers, not marker presence alone.
<!-- AC:END -->
