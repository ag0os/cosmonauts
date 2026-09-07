---
id: TASK-636
title: 'Stage 3: Fresh structural review of committed-write reporting'
status: Blocked
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-635
createdAt: '2026-09-07T15:38:39.227Z'
updatedAt: '2026-09-07T22:55:30.258Z'
---

## Description

Perform only the mandatory fresh review in Implementation Order step 16; behavior ownership is none. Review the complete Stage-3 permitted implementation diff in a fresh context. Tell the reviewer that Stage 2 added an early post-recovery failure path and that the original findings lost committed bits in both an error wrapper and later details reconstruction. Record the review under D-010.

Ratified-ground handling: the common constraints and fresh-review threshold are stop-and-escalate ground. A high/medium finding prevents completion and Stage-4 handoff; remediation must remain in Stage 3, begin with a counterexample, and receive another fresh review.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order steps 15-16) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (Quality Contract assertions 4 and 8; Implementation Order step 16) A fresh reviewer, explicitly given the Stage-2 early-failure and original lost-bit history, inspects success, failure, no-work, and incomplete-inventory returns and verifies OR-monotonic state across the receipt error wrapper, source recovery/details reconstruction, and accepted-to-materialized B-012 transition, then reruns B-001..B-008 plus fidelity B-012 and exact parent B-012/B-016/B-021 regressions.
- [ ] #7 (Quality Contract assertion 8; Implementation Order step 16) The fresh round's verdict is recorded in `missions/plans/living-memory-fidelity/review-<n>.md` and referenced in task evidence, and Stage 3 closes only with zero unresolved high or medium findings; any such finding starts a new bounded Stage-3 RED/GREEN/refactor remediation and another fresh review before Stage 4 may begin.
- [x] #8 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — the Stage-1 round is `review-2.md`, since `review-1.md` is the plan's own design review. No existing review record may be overwritten, renamed or deleted, and each additional remediation round within a stage takes its own next integer.
- [x] #9 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->

## Implementation Notes

task failed
