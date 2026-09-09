---
id: TASK-649
title: 'Stage 3 round 3: Fresh structural review of durable-primitive commit tagging'
status: Done
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-648
createdAt: '2026-09-07T23:35:40.467Z'
updatedAt: '2026-09-08T00:03:13.594Z'
---

## Description

Fifth fresh structural review round required by D-006 and Quality Contract assertion
8, because Stage-3 review round 2 (`review-7.md`, TASK-647) returned one unresolved
medium finding, SR-007.

Review the complete permitted Stage-3 diff as it now stands — the original
committed-write work, the SR-004/005/006 caller-level fix, and the SR-007
primitive-level fix — not merely the incremental change.

Regression history: six of seven parent rounds' fixes introduced a fresh defect. In
this plan Stage 1's remediation introduced SR-001, Stage 2's introduced SR-002 (which
discharged a live receipt), Stage 3 round 1 left a defect class open at four sites,
and round 2's fix closed it at the caller level while leaving it open one level down
in the write primitives. The class has now been chased through three levels —
assembly, caller, primitive. The central question for this round is whether there is
a fourth level, or whether the enumeration is now complete.

Check the task's enumeration of byte-mutating operations in
`lib/memory/durable-files.ts` rather than trusting it: confirm it is complete against
the file, and that each entry's tagging or safety rationale holds.

Also verify the two bounded constraints this round carried: that **no operation was
reordered** anywhere in `durable-files.ts` (the fix is error tagging only, per D-012),
and that `writesCommitted` did not become true where nothing was written — especially
the EEXIST identity-conflict path, which writes nothing new.

Record the verdict at `missions/plans/living-memory-fidelity/review-8.md`. Stage 3
closes, and Stage 4 may begin, only with zero unresolved high or medium findings.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed.
- [x] #4 (Quality Contract assertion 7; Implementation Order steps 15-16) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21; D-026) D-026 is not reopened or given another verification layer, retirement pathname sequencing is untouched, and the review confirms **no operation was reordered** anywhere in `lib/memory/durable-files.ts` — the change is error tagging only, per D-012's narrow authorization.
- [x] #6 (SR-007) The review verifies SR-007 is closed at both the sync window after the destination link and the `finally` cleanup window, and that a cleanup failure no longer silently overrides a successful return.
- [x] #7 (SR-007; class closure) The review independently checks the task's enumeration of byte-mutating operations in `lib/memory/durable-files.ts` for completeness against the file, and checks each entry's tagging or safety rationale. A durable mutation that can still be followed by an untagged throw is a finding even though no previous round named it.
- [x] #8 (INV-003, inverse direction) The review verifies `writesCommitted` did not become true where nothing was durably written — dry-run paths, failures before any link or rename, the no-work/noop path, and specifically the EEXIST identity-conflict path, which writes nothing new. Over-claiming a write is a finding of equal weight to understating one.
- [x] #9 (inherited coverage gap) The review confirms a test now pins the receipt-written-then-fail-closed-validation path, and that the test genuinely fails if the commit report is moved back below the validator rather than passing vacuously.
- [x] #10 (Quality Contract assertion 8; Implementation Order step 16) The fresh round's verdict is recorded in `missions/plans/living-memory-fidelity/review-8.md` and referenced in task evidence, and Stage 3 closes only with zero unresolved high or medium findings; any such finding starts a further bounded Stage-3 RED/GREEN/refactor remediation and another fresh review before Stage 4 may begin.
- [x] #11 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — this round is `review-8.md`. No existing review record may be overwritten, renamed or deleted.
- [x] #12 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->
