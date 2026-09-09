---
id: TASK-643
title: >-
  Stage 1 round 2: Fresh structural review of the unusable-pressure lifecycle
  fix
status: Done
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-642
createdAt: '2026-09-07T21:08:03.799Z'
updatedAt: '2026-09-07T21:29:28.704Z'
---

## Description

Second fresh structural review round for Stage 1, required by D-006 and Quality
Contract assertion 8 because review round 1 (`review-2.md`, TASK-632) returned one
unresolved medium finding, SR-001.

Review the complete permitted Stage-1 diff as it now stands — both the original
remediation and the SR-001 fix — not merely the incremental change. Regression history
to state explicitly to the reviewer: in the parent plan, round 6 stopped measuring what
injection includes and round 7's attempted fix diverged in both directions while
dropping retrieval warnings; six of seven parent rounds' fixes introduced a fresh
defect; and in this plan, the Stage-1 remediation that closed those divergences itself
introduced SR-001, a vacuous-truth receipt materialization on the newly added unusable
pressure path. Fixes in this code reliably introduce regressions, so the reviewer must
look for what the SR-001 fix broke, not only whether SR-001 is closed.

Record the verdict at `missions/plans/living-memory-fidelity/review-3.md`. Stage 1
closes, and Stage 2 may begin, only with zero unresolved high or medium findings.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order steps 7-8) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (Quality Contract assertions 1-2 and 8; Implementation Order step 8) A fresh reviewer, explicitly told the round-6/round-7 parent history and that the Stage-1 remediation itself introduced SR-001, inspects the complete permitted Stage-1 diff and verifies one canonical query/descriptor across scope, query, admission projection and renderer input; one required records-plus-warnings input; one renderer; no private conversion or second retrieval; no judgment-body-ceiling coupling; inward dependency direction; and preserved parent carriers, then reruns the B-001/B-002/B-003 plus exact parent B-021 permanent pack.
- [x] #7 (SR-001) The review verifies specifically that SR-001 is closed — unusable pressure no longer vacuously materializes a receipt, and a pressure-blocked retirement remains retryable by a later measured pass — and that closing it introduced no new defect in the receipt lifecycle, the retirement gate, or the reported details.
- [x] #8 (Quality Contract assertion 8; Implementation Order step 8) The fresh round's verdict is recorded in `missions/plans/living-memory-fidelity/review-3.md` and referenced in task evidence, and Stage 1 closes only with zero unresolved high or medium findings; any such finding starts a further bounded Stage-1 RED/GREEN/refactor remediation and another fresh review before Stage 2 may begin.
- [x] #9 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-3.md`. No existing review record may be overwritten, renamed or deleted, and each additional remediation round within a stage takes its own next integer.
- [x] #10 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->
