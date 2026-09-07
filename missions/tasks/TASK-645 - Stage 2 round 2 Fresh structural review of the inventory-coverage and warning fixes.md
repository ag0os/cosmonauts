---
id: TASK-645
title: >-
  Stage 2 round 2: Fresh structural review of the inventory-coverage and warning
  fixes
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-644
createdAt: '2026-09-07T22:07:08.438Z'
updatedAt: '2026-09-07T22:07:12.446Z'
---

## Description

Third fresh structural review round required by D-006 and Quality Contract assertion 8,
because the Stage-2 review round 1 (`review-4.md`, TASK-634) returned one high finding
(SR-002) and one medium finding (SR-003).

Review the complete permitted Stage-2 diff as it now stands — the original completeness
work plus the SR-002/SR-003 fixes — not merely the incremental change. Regression
history to state explicitly to the reviewer: six of seven parent rounds' fixes
introduced a fresh defect; in this plan the Stage-1 remediation introduced SR-001 (a
vacuous-truth receipt materialization), and the Stage-2 completeness work introduced
SR-002, where an explicitly empty inventory could claim completeness and discharge a
live receipt. Fixes in this code reliably introduce regressions, so look for what the
SR-002/SR-003 fixes broke, not only whether they are closed.

Pay particular attention to the boundary the SR-002 fix must hold: an empty-and-healthy
source (zero records, zero omitted) must still report complete, while an
empty-but-lying source (admitted records, empty inventory) must be rejected. A fix that
collapses those two cases in either direction is a new finding — over-strict wedges
every healthy empty source, over-lax leaves INV-002 open.

Record the verdict at `missions/plans/living-memory-fidelity/review-5.md`. Stage 2
closes, and Stage 3 may begin, only with zero unresolved high or medium findings.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order steps 11-12) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (Quality Contract assertions 3 and 8; Implementation Order step 12) A fresh reviewer, explicitly told the regression history above, reviews every source outcome — healthy, byte-deferred-but-inventoried, warned corpus omission, malformed episode, contract-invalid custom source, and empty-and-healthy — and every barrier seam, then reruns the Stage-1 and Stage-2 packs plus the exact parent carrier tests.
- [ ] #7 (SR-002) The review verifies specifically that SR-002 is closed: a source claiming completeness without inventorying its admitted current records is rejected, no discharge proceeds from such a source, and a genuinely empty healthy source is still treated as complete. It confirms the fix did not collapse those two cases in either direction.
- [ ] #8 (SR-003) The review verifies specifically that SR-003 is closed: `details.warnings` is append-only across success, barrier failure, dry-run retirement-recovery failure, unhealthy citation inventory, error wrap and details reconstruction, and that a propagated source warning survives every one of them.
- [ ] #9 (Quality Contract assertion 8; Implementation Order step 12) The fresh round's verdict is recorded in `missions/plans/living-memory-fidelity/review-5.md` and referenced in task evidence, and Stage 2 closes only with zero unresolved high or medium findings; any such finding starts a further bounded Stage-2 RED/GREEN/refactor remediation and another fresh review before Stage 3 may begin.
- [ ] #10 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-5.md`. No existing review record may be overwritten, renamed or deleted, and each additional remediation round within a stage takes its own next integer.
- [ ] #11 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->
