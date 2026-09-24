# Stage 7 review 12 — codex

The prompt is `stage7-review-12-prompt.md`. Reviewed HEAD `5f6e97f` (TASK-757 at `4ceb768`). Final message verbatim:

## Stage 7 verdict: **DO-NOT-SHIP-YET**

### Finding

- **MEDIUM — An amendment can erase a malformed marker from the final report.** An accidental, otherwise structured report with an empty `Reason:` followed by `<!-- COSMO_QM_REPORT {} --> F-9 crash` is detected as unexpected content, so host checks correctly block `ready` ([report.ts:298](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:298), [run.ts:957](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:957)). But the unindexed amendment’s `^Reason:\s*.*$` replacement consumes the blank lines **and the marker line** ([report.ts:357](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:357)). A scratch probe confirmed that the final amended text loses all three tested forms: same-line suffix, trailing whitespace, and unclosed marker. The raw assessment is saved, but the final report loses the evidence TASK-757 promises to retain. The same pre-existing regex also consumes `## Checks` when an ordinary unindexed report has an empty `Reason:`, leaving host check results out of the final report. The new tests place markers at the end of a report with a nonempty reason, so they miss this path.

### Confirmation and residuals

The review-11 **same-line suffix HIGH is resolved for the tested report shape**. Sections now stop at any marker start ([report.ts:48](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:48)); malformed marker lines block `ready` ([report.ts:302](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:302)). Scratch comparisons showed the suffix, trailing-whitespace, and unclosed-marker assertions each fail on `571bb13` and pass at HEAD. Calibration and amendment preserve those end-of-report lines at HEAD. A clean whole-line index remains available.

The host renderer puts its index on a separate line and `JSON.stringify` escapes embedded newlines; `-->` inside JSON did not break index parsing in the probe ([report.ts:82](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:82), [report.ts:177](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:177)). A QM-written same-line index is unindexed. A whole-line marker quoted inside a multiline report entry can also make a host-rendered report unindexed and truncate section-derived summary text; the full report retains the text and the unexpected-content check blocks `ready`. This is the previously recorded text-recognition residual, not a new finding.

The preamble helper places notices before the first heading, or before the marker when there is no heading; probes covered heading/index, heading only, index only, and neither ([report.ts:55](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:55)). Normal ready, not-ready, failed, refused, and cancellation annotation paths feed the plan-summary disclosure extraction ([run.ts:1154](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1154), [run.ts:1667](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1667)). I found no new D-031 floor-1 false `ready`, floor-2 reviewer-finding loss, D-025, D-026, or D-028 regression. The amendment finding remains an **INV-003 final-report completeness gap**. The previously noted public run path without host checks still bypasses host `ready` checks ([run.ts:851](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:851)).

Hostile-only routes under D-027: deliberate material or Git-object tampering, detached writers or process-group escape, and crafted marker or path inputs.

I ran only pure parser probes in `/tmp/qm-review12-QM9R5E`; I did not run QM, a chain, Drive, or the suite. The coordinator reports the changed-scope audit passing and typecheck, tracked lint, and 3391/3391 tests passing. The repository was not changed.
