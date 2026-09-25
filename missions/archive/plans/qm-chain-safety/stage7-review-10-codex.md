# Stage 7 review 10 — codex

The prompt is `stage7-review-10-prompt.md`. Reviewed HEAD `aa2559e` (TASK-755 at `cf68b25`). Final message verbatim:

## Stage 7 verdict: DO-NOT-SHIP-YET

TASK-755 resolves the review-9 heading defects in the production host-check path. One **MEDIUM** disclosure gap remains in the plan summary. I found no HIGH issue.

### Findings

- **MEDIUM — Plan summaries omit live-work disclosures.** On an accidental cancellation or deadline where the QM session remains live, [appendFinalAnnotations](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1156) puts `Live work` and `Workspace retained` before the first section. [renderPlanSummary](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1649) copies only section bodies, so the tracked summary omits that INV-003 liveness evidence. The full report retains it and the summary links to that report. This summary omission predates TASK-755, but remains under the requested “annotations must never be lost” check. The D-028 operator-authority disclosure *does* survive in `Reviewed` on ready, not-ready, failed, refused, and cancellation paths.

- **LOW — An exceptional path still places `Index unavailable.` after the index.** If an assessment supplies complete sections and then evidence sealing fails before `assessReport`, [renderAssessmentFailure](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1123) calls [amendUnindexedQualityReviewReport](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:355), which appends the notice after the index. The new [after-index check](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:295) then regards the host’s own notice as unexpected. This exit is already `failed`; I found no false `ready` from it.

- **LOW — Two new control cases cannot fail on `5ddfd96`.** The LF and lone-CR rows of the [clean-report test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:2512) already reach `ready` with a CR-free summary on the old parser. The CRLF row detects the fix. The [CRLF-duplicate row](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:2446) does fail on the old revision, but its all-CRLF input already becomes `not-ready`; its heading-count assertion causes the failure, rather than the claimed false-ready condition.

### Review-9 confirmation

| Prior finding | Result and evidence | New test on `5ddfd96` |
|---|---|---|
| Codex MEDIUM: bare CRLF duplicate | **Resolved:** normalization at [run.ts:691](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:691) and duplicate detection at [report.ts:285](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:285). | Fails, but for the heading-count reason above. |
| Codex MEDIUM and Claude MEDIUM: contentful empty title; tab heading | **Resolved:** shared [headingLines](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:31) feeds section boundaries and the unexpected-content scan. | Both empty-title rows and the tab row fail on old code. |
| Codex MEDIUM: nonbreaking-space Findings loses carryover | **Resolved:** normalization precedes calibration; the shared [sectionBodyStart](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:245) finds Findings for amendment. | Carryover test fails on old code. |
| Codex LOW: clean CRLF blocked | **Resolved:** normalization precedes assessment and summary; the clean LF and CRLF reports reach `ready`. | CRLF fails on old code; LF passes. |
| Claude LOW: stray CR duplicate | **Resolved:** normalization and trimmed shared title make it a duplicate at [report.ts:285](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:285). | Covered by the CRLF row, with the limitation above. |
| Claude LOW: text after index | **Resolved in the host-check path:** [report.ts:295](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:295) detects it and [hostResultsBlockReady](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:959) blocks `ready`. | Fails on old code. |

A report with **no `##` heading** does not reach either new insertion as its final report: assessment supplies a missing-section reason, and the failure path renders a host report with headings before [appendFinalAnnotations](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1153). The same holds for an empty assessment and a refused assessment. An indexed report takes the indexed disclosure path; an unindexed but structurally complete report receives the D-028 entry under `Reviewed`. I found no final-report annotation inserted inside a checked section.

**Residuals:** The public `runQualityReview` port can omit host checks, so its section verdict alone does not block after-index content; the shared production launcher enables host checks at [quality-review-launch.ts:291](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:291). D-031/D-032’s recorded text-recognition limits remain accepted. D-027 hostile-only routes: deliberate materials or Git-object tampering, surviving detached writers, and deliberate process-group escape.

I ran pure parser probes against HEAD and a scratch copy of `5ddfd96`; I did not run the Quality Manager, a chain, or a drive. The coordinator reports the audit, typecheck, tracked lint, and 3381/3381 suite passing. The repository was unchanged; its pre-existing untracked review prompt remains present.
