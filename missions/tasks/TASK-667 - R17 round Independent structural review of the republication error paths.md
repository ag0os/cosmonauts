---
id: TASK-667
title: 'R17 round: Independent structural review of the republication error paths'
status: Done
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-09T15:33:19.692Z'
updatedAt: '2026-09-09T15:42:43.419Z'
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
- [x] #1 (D-006) An independent reviewer records a verdict at `missions/plans/living-memory-fidelity/review-18.md`; `<n>` is the next unused integer and no existing review record is overwritten, renamed or deleted.
- [x] #2 (R17-001..004, both directions) Each guard tags only when the primitive actually republished, and every post-republication path is covered. An error on a path that committed nothing must stay untagged.
- [x] #3 (double-tagging) The reviewer checks that no error is wrapped twice and that no guard converts an uncommitted failure into a committed one, which would be the overstating mirror of these findings.
- [x] #4 (class, all axes) The reviewer independently enumerates every durable write contributing to the consolidation result and reports any place on any axis where a commit fact is produced, inferred, or lost.
- [x] #5 (regression) SR-010 path parity, SR-011..SR-014 cause separation, the Stage-2 completeness barrier, CDX-001 materialization, SR-015..SR-018 and CDX16-001..004 are confirmed undisturbed.
- [x] #6 (scope) `lib/memory/retirement-store.ts` is byte-identical, no operation is reordered, and the diff stays inside the amended Files to Change.
- [x] #7 (Plan ## Risks) The five bindable gates are reported as degraded/unbound, never as clean.
- [x] #8 (Quality Contract assertion 8) Zero unresolved high or medium findings are required to close.
<!-- AC:END -->

## Implementation Notes

Independent codex exec review completed; verdict SHIP, recorded at missions/plans/living-memory-fidelity/review-18.md.

Zero unresolved high or medium findings — the Quality Contract assertion 8
threshold is met for the first time in this plan's eighteen rounds.

The verdict is substantive, not bare. It confirms all four guards complete for
their republication paths; searches for and does not find the opposite defect,
naming three concrete negative paths that correctly stay untagged; confirms no
double-wrapping and that no production caller matches the module-private wrapper
classes; confirms removing the pruned.length clause opened no under-report, with
the only pruned-without-commit case identified exactly; and supplies its own
enumeration across all three axes, built without reference to the commit's own
account, finding no remaining place where a commit fact is produced, inferred, or
lost.

One low-severity finding, below the closing threshold, was closed anyway: the
receipt test reached the already-covered changed-bytes branch, so the narrow
pre-TASK-666 guard would also have passed it. A new regression seeds malformed
receipt bytes so parseReceipt is what throws after a republication. Verified to
discriminate: red under the narrow guard, green under the broad one.

Gates: 3112 tests pass (263 files, exit 0), typecheck 0, lint 0, git diff --check
clean, check-artifacts GREEN 12/0/0. The first run hit the known archive.test.ts
flake with the same lock-tmp signature review-15 recorded; the file passes in
isolation and the full re-run is clean. Corpus digest
adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932 over 237 files.
retirement-store.ts unchanged at
f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c.
