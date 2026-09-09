---
id: TASK-638
title: 'Stage 4: Run the complete fidelity and parent regression packs'
status: Done
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-637
createdAt: '2026-09-07T15:39:51.398Z'
updatedAt: '2026-09-08T00:22:24.722Z'
---

## Description

Execute only Implementation Order step 18 after the Stage-4 implementation commit; behavior ownership is none. This is a verification checkpoint, not a catch-all remediation task. A failure blocks the sequence and is routed back to a bounded task in its owning stage rather than fixed by widening this task.

Ratified-ground handling: the common constraints and the complete-pack threshold are stop-and-escalate ground. Do not delete, rename, skip, weaken, or relocate a failing marker/test to obtain green.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order step 18) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (B-001 through B-012; Quality Contract assertions 1-5; Implementation Order step 18) All twelve named `living-memory-fidelity` behavior tests run together and pass with their exact matching markers on executable tests, covering measurement parity/unusable warnings, source completeness barriers, OR-monotonic committed writes, parent ownership, copied-corpus CLI composition, public contract pins, and materialization-only commitment.
- [x] #7 (Quality Contract assertions 5 and 7; Implementation Order step 18) The exact parent B-012/B-016/B-021 owner tests and all three additional carriers run and pass with unchanged names, markers, and assertion strength, followed by the full project checks; no commit or handoff is accepted with any failure.
- [x] #8 (Quality Contract gate 2; Implementation Order step 18) `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` run from the repository root exits 0 and reports 12 behaviors with 0 issues and 0 advisories, alongside the full B-001..B-012 and parent regression packs.
<!-- AC:END -->
