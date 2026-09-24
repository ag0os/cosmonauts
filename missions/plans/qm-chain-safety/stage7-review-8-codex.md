# Stage 7 review 8 — codex

The prompt is `stage7-review-8-prompt.md`. Reviewed HEAD `273e1d0` (TASK-753 at `843abeb`). Final message verbatim:

## Stage 7 verdict: DO-NOT-SHIP-YET

**MEDIUM — A duplicate defined heading at EOF can pass as `ready`.** The heading scan requires a terminating newline, so it misses a final bare `## Findings` ([quality-review-report.ts:268](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:268)). An accidental extra heading appended after the report index is assessed as `ready` with a valid index; calibration then removes the duplicate ([quality-review-report.ts:53](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:53)). A scratch probe reproduced all three results. This violates D-032’s rule that a repeated defined section blocks `ready` ([plan.md:673](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/plan.md:673)). The gap **predates TASK-753**. This probe did not lose a reviewer finding, so it establishes a false `ready` under the duplicate-section rule, not a floor-2 failure.

HIGH: none. LOW: none.

Both review-7 findings are **resolved**. The plan summary now calls the anchored `visibleSectionBody` ([quality-review-run.ts:1644](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1644)); the new summary test would fail on `aff9937`, whose unanchored lookup returns `- None recorded.` for its real finding. The unexpected-section scan now removes trailing spaces and tabs before recognizing and counting a heading ([quality-review-report.ts:268](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:268)); both new trailing-whitespace tests would fail on `aff9937`, where that heading is treated as unexpected. I verified those base behaviors with pure-function probes, without running the Quality Manager tests.

All **defined-section lookups** inspected use the anchored match: `visibleSectionBody`, `replaceSectionEntries`, and the unindexed amendment path ([quality-review-report.ts:226](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:226), [quality-review-report.ts:88](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:88), [quality-review-report.ts:329](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:329)). The remaining `indexOf` locates an already selected body, not a heading. `quality-review-run.ts` has no unanchored section lookup, and `quality-review-models.ts` has no report-section lookup.

The diff introduced no regression in the requested cases: trailing-whitespace headings remain readable, a heading at EOF has an empty body and can be amended, unindexed additions and calibration replacements land in the real Findings section, and a canonical clean report assesses as `ready`. Floor 2 held in the probed paths. The coordinator reports the audit, typecheck, tracked lint, and 3371/3371 suite passing; I did not rerun the prohibited Quality Manager tests.

**Residuals:** D-031/D-032’s recorded text-recognition limits remain as documented. Hostile-only routes under D-027: deliberate materials or Git-object tampering, surviving detached writers, and deliberate process-group escape.
