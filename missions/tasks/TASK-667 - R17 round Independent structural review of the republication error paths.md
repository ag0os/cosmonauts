---
id: TASK-667
title: 'R17 round: Independent structural review of the republication error paths'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-09T15:33:19.692Z'
updatedAt: '2026-09-09T15:33:19.692Z'
---

## Description

Fresh independent structural review of the TASK-666 remediation, required by
D-006 and Quality Contract assertion 8. Recorded at
`missions/plans/living-memory-fidelity/review-18.md`.

Context the reviewer must be given: this plan has found three axes of one
class across eighteen rounds, and rounds 16 and 17 each found that the
previous round's fix opened a new error path in an axis already declared
closed. The specific question for this round is whether the four new guards
are complete — whether any path after a republication still throws untagged,
and whether any guard now tags an error on a path that committed nothing.


<!-- AC:BEGIN -->
- [ ] #1 (D-006) An independent reviewer records a verdict at `missions/plans/living-memory-fidelity/review-18.md`; `<n>` is the next unused integer and no existing review record is overwritten, renamed or deleted.
- [ ] #2 (R17-001..004, both directions) Each guard tags only when the primitive actually republished, and every post-republication path is covered. An error on a path that committed nothing must stay untagged.
- [ ] #3 (double-tagging) The reviewer checks that no error is wrapped twice and that no guard converts an uncommitted failure into a committed one, which would be the overstating mirror of these findings.
- [ ] #4 (class, all axes) The reviewer independently enumerates every durable write contributing to the consolidation result and reports any place on any axis where a commit fact is produced, inferred, or lost.
- [ ] #5 (regression) SR-010 path parity, SR-011..SR-014 cause separation, the Stage-2 completeness barrier, CDX-001 materialization, SR-015..SR-018 and CDX16-001..004 are confirmed undisturbed.
- [ ] #6 (scope) `lib/memory/retirement-store.ts` is byte-identical, no operation is reordered, and the diff stays inside the amended Files to Change.
- [ ] #7 (Plan ## Risks) The five bindable gates are reported as degraded/unbound, never as clean.
- [ ] #8 (Quality Contract assertion 8) Zero unresolved high or medium findings are required to close.
<!-- AC:END -->
