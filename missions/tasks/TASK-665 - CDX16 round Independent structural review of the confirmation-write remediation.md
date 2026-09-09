---
id: TASK-665
title: >-
  CDX16 round: Independent structural review of the confirmation-write
  remediation
status: Blocked
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-09T15:15:11.099Z'
updatedAt: '2026-09-09T15:33:46.771Z'
---

## Description

Fresh independent structural review of the TASK-664 remediation, required by
D-006 and Quality Contract assertion 8. Recorded at
`missions/plans/living-memory-fidelity/review-17.md`.

Context the reviewer must be given: this plan has now found three distinct
axes of one defect class across seventeen rounds, and each remediation round
has introduced or revealed something the previous round did not name. The
previous round's own remediation is the subject here — treat its correctness
as unproven.

The specific question: `read()` changed from a pure read into an operation
that reports a commit bit. Does any caller now mis-handle it, and does the
new `ReceiptCommittedError` tag reach the accumulator on every path?

<!-- AC:BEGIN -->
- [ ] #1 (D-006) An independent reviewer records a verdict at `missions/plans/living-memory-fidelity/review-17.md`; `<n>` is the next unused integer and no existing review record is overwritten, renamed or deleted.
- [ ] #2 (CDX16-001..003, both directions) Each confirmation-write fix reports true only when the primitive actually republished, and false for an ordinary fsync of an intact file.
- [ ] #3 (CDX16-002 contract change) The `read()` signature change is checked at every caller, including `markMaterialized()`'s internal use and the consolidator, for a dropped or double-counted bit; and the `ReceiptCommittedError` path is checked for reaching the accumulator.
- [ ] #4 (class, fourth axis) The reviewer independently enumerates every durable-write call site and reports any place where a commit fact is produced and not carried — including any axis this plan has not yet named.
- [ ] #5 (regression) SR-010 path parity, SR-011..SR-014 cause separation, the Stage-2 completeness barrier, CDX-001 materialization, and SR-015..SR-018 are confirmed undisturbed.
- [ ] #6 (scope) `lib/memory/retirement-store.ts` is byte-identical, no operation is reordered, and the diff stays inside the amended Files to Change.
- [ ] #7 (Plan ## Risks) The five bindable gates are reported as degraded/unbound, never as clean.
- [ ] #8 (Quality Contract assertion 8) Zero unresolved high or medium findings are required to close.
<!-- AC:END -->

## Implementation Notes

Independent codex exec review completed; verdict at missions/plans/living-memory-fidelity/review-17.md.

Verdict: DO NOT SHIP — no high findings, four mediums. Confirmed closed: all
three confirmation sites correct in the success direction, the read() contract
change correct at both production callers, CDX16-003 correct in both directions,
all seven added tests genuinely pin their production change (checked one at a
time), no operation reordered, retirement-store byte-identical, all nine added
comments accurate.

Open at the time of the verdict: R17-001/002/003 are axis A reopened at the
sites axis C created — a confirmation write is a new commitment source and each
of its error paths threw untagged. R17-004 is axis B (finalize inferring a
commit from pruned.length), which this plan's own af7d406 made reachable.

AC #8 requires zero unresolved high or medium findings to close, so this task
stays Blocked at its verdict. Remediation is TASK-666, re-review TASK-667.
