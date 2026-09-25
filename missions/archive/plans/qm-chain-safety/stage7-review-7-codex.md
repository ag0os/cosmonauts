# Stage 7 review 7 — codex

The prompt is `stage7-review-7-prompt.md`. Reviewed HEAD `cd21033` (TASK-752 at `88f272d`). Final message verbatim:

## Verdict: DO-NOT-SHIP-YET for Stage 7

TASK-752 resolves both review 6 items in the **full report**, and I found no regression introduced by its diff. One defined-section lookup remains unanchored in the plan summary, where it can hide a finding from that summary.

### Findings

- **MEDIUM — Plan summary can omit a real finding.** [quality-review-run.ts:1644](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1644) still uses `indexOf("## Findings\n")`. With a Checks line ending `details under ## Findings`, a scratch probe found `F-77` in the full report but `- None recorded.` under Findings in the plan summary. This is pre-existing, but it leaves the requested “every lookup” coverage incomplete and makes the summary less actionable.

- **LOW — Trailing heading whitespace overblocks a clean report.** [quality-review-report.ts:268](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:268) treats `## Findings \t` as an unexpected section with content; [quality-review-run.ts:957](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:957) then blocks `ready`. The same result occurs on `c815aa3`, so this is a pre-existing liveness issue, not a TASK-752 regression.

### Confirmation

- **Review 6 MEDIUM-1: resolved.** [sectionBodyStart](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:226) anchors `visibleSectionBody`, [calibration replacement](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:104), and [unindexed amendment](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:328). Scratch probes against both versions show the three new lookalike-heading cases reach the wrong predicates on `c815aa3` and the right ones at HEAD; the new run tests would fail on the base. I did not execute run tests because they invoke the prohibited Quality Manager.
- **Review 6 LOW-1: resolved.** The rewritten test puts content only in the [second Human decisions section](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1405), so removing duplicate detection would expose the gap. **That test does not fail on `c815aa3`**: duplicate detection already exists there. It is a mutation check, not a base-failing test.
- A defined heading at end of file remains readable and amendable. Scratch probes also placed unindexed additions and calibration replacements in the real section. A canonical clean report still assesses as `ready`. I found no defined-section lookup in `quality-review-models.ts`.

For the ordinary shapes checked, the full-report path no longer permits a false `ready` or drops a reviewer finding. The summary defect omits a finding **from the summary**, while the full report retains it. D-031/D-032’s recorded text-recognition limits remain residuals, not findings. Hostile-only routes under D-027: deliberate tampering with materials or Git objects, surviving detached writers, and deliberate process-group escape.

The coordinator reports the changed-scope audit, typecheck, tracked lint, and full suite (3368/3368) passing; I did not rerun them.
