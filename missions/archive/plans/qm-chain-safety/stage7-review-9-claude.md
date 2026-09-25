# Stage 7 review 9 — Claude subagent

Prompt: `stage7-review-9-prompt.md`. Reviewed `020f89b..c3a6124` (TASK-754 at `e4ad5dd`). Condensed by the coordinator.

**Verdict: DO-NOT-SHIP-YET.** Both review-8 items are RESOLVED, and the regex change introduced no regression. The one-pass heading audit found one pre-existing MEDIUM.

## Review-8 items

- **MEDIUM (duplicate heading at EOF): RESOLVED.** `report.ts:268` now matches `/^## ([^\n]+)$/gm`. The new lifecycle test at `run.test.ts:2410` fails on `020f89b`.
- **LOW (weak lifecycle test): RESOLVED.** The test at `run.test.ts:2376` now uses `hostChecks` and `completed-bound`, and it fails when the whitespace stripping is removed.

## Regressions

None:
- The content tail and body boundary are unchanged.
- An EOF heading is now scanned.
- Trailing whitespace is unchanged.
- CRLF fails safe, as before.
- A clean report still reaches `ready`.

## Heading-definition inconsistencies

- The body terminators (`report.ts:243`, `:276`, `:332`) stop at any `^## `.
- The scan (`:268`) needs at least one character after `## `.
- The required-heading check (`:118`) accepts `\s*$`, while `sectionBodyStart` (`:230`) and the strip at `:269` accept only `[ \t]`.

## Findings

**MEDIUM: a bare `## ` line hides the content below it (floor 1, D-032).**
- The QM writes `## ` with an empty title, followed by `- QM-001 real regression…`.
- The previous section's body ends at that line, but the scan never matches it.
- `assessQualityReviewReport` gives `ready` with a valid index.
- Indexed calibration then re-renders the report and deletes the content.
- Reviewer IDs are still carried over, so floor 2 holds for those; QM-own content is lost.
- The bug is pre-existing and reproduces on `020f89b`.
- Fix: the scan becomes `/^## ([^\n]*)$/gm`.

**LOW: a duplicate defined heading with a stray `\r` escapes the duplicate rule.**
- The trigger is an empty extra `## Findings\r`.
- `:118` accepts `\s*`, but `:269` strips only `[ \t]`, so the heading reads as unexpected with an empty body, and the report reaches `ready`.
- No content is lost.
- Fix: strip `\s+$` in the scan, and give `:230` the same definition.

**LOW: text outside every section is invisible.**
- Text after the `<!-- COSMO_QM_REPORT … -->` index, or before `## Checks`, still assesses `ready`, and indexed calibration drops it.
- D-032 covers only `##` sections. Either record this as a limit or treat such text as unexpected content.

## Consistent

- `replaceSectionEntries` and `amendUnindexedQualityReviewReport` share `sectionBodyStart`.
- Headings accepted by `:118` but not by `sectionBodyStart` fail safe.

## Residuals

- The D-031/D-032 text limits.
- A CRLF report never reaches `ready` (safe).
- Hostile-only routes (D-027).
