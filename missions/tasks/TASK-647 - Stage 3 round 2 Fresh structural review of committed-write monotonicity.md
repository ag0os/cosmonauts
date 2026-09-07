---
id: TASK-647
title: 'Stage 3 round 2: Fresh structural review of committed-write monotonicity'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-646
createdAt: '2026-09-07T22:58:16.959Z'
updatedAt: '2026-09-07T22:58:17.406Z'
---

## Description

Fourth fresh structural review round required by D-006 and Quality Contract
assertion 8, because Stage-3 review round 1 (`review-6.md`, TASK-636) returned three
unresolved medium findings, SR-004/SR-005/SR-006.

Review the complete permitted Stage-3 diff as it now stands — the original
committed-write work plus the SR-004/005/006 fixes — not merely the incremental
change. Regression history to state explicitly to the reviewer: six of seven parent
rounds' fixes introduced a fresh defect; in this plan Stage 1's remediation introduced
SR-001, Stage 2's introduced SR-002 (which discharged a live receipt), and Stage 3's
first round left an entire defect class open at three sites. Fixes in this code
reliably introduce regressions.

The central question is not whether the three named instances are closed. It is
whether the **class** is closed: does any durable write in
`lib/memory/living-memory.ts` remain represented only by a local variable that a
later throw can bypass before it reaches `details`? Enumerate the durable-write sites
and check each one, rather than checking only the three the previous round named.

Also check the inverse failure the fix could introduce: `writesCommitted` must not
become true when nothing was durably written. An over-eager fix that sets the bit
before a write actually commits is a new finding of equal weight, because it would
make a dry run or a failed pass claim writes it never made.

Record the verdict at `missions/plans/living-memory-fidelity/review-7.md`. Stage 3
closes, and Stage 4 may begin, only with zero unresolved high or medium findings.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order steps 15-16) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (Quality Contract assertions 4 and 8; Implementation Order step 16) A fresh reviewer, explicitly told the regression history above, checks success, failure, no-work and incomplete-inventory returns for monotonic state — including the accepted-to-materialized transition B-012 owns — and reruns the Stage-1, Stage-2 and Stage-3 packs plus the exact parent carrier tests.
- [ ] #7 (SR-004/005/006; INV-003) The review verifies each named finding is closed, and separately enumerates every durable-write site in `lib/memory/living-memory.ts` to confirm none remains represented only by a local variable that a later throw can bypass. A remaining instance of the class is a finding even though the previous round did not name it.
- [ ] #8 (INV-003, inverse direction) The review verifies the fix did not make `writesCommitted` true when nothing was durably written — in particular on dry-run paths, on failures before any write, and on the no-work/noop path. Over-claiming a write is a finding of equal weight to understating one.
- [ ] #9 (D-012) The review confirms that any change to `lib/memory/durable-files.ts` is confined to carrying an already-committed bit out of a failed write, and that rename/sync ordering, retirement pathname sequencing and D-026 behaviour are untouched.
- [ ] #10 (Quality Contract assertion 8; Implementation Order step 16) The fresh round's verdict is recorded in `missions/plans/living-memory-fidelity/review-7.md` and referenced in task evidence, and Stage 3 closes only with zero unresolved high or medium findings; any such finding starts a further bounded Stage-3 RED/GREEN/refactor remediation and another fresh review before Stage 4 may begin.
- [ ] #11 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-7.md`. No existing review record may be overwritten, renamed or deleted, and each additional remediation round within a stage takes its own next integer.
- [ ] #12 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->
