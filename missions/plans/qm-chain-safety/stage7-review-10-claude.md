# Stage 7 review 10 — Claude subagent

The prompt is `stage7-review-10-prompt.md`. The review covers `5ddfd96..aa2559e` (TASK-755 at `cf68b25`). Condensed by the coordinator.

**Verdict: SHIP.** There is no HIGH finding. One MEDIUM remains; it is confined to the plan summary and fails safe.

## 1. Review-9 findings: all RESOLVED

The fixes are the shared `headingLines` (`report.ts:31-39`), normalization at `run.ts:691`, and the after-index check at `report.ts:295-298`.

Each new test fails on `5ddfd96`, with one exception. The CRLF-duplicate test (`run.test.ts:2448`) converts the whole report to CRLF, and the old code already blocked that. A probe of the actual shape (an LF report with `## Findings\r\n` appended) gives `ready` on `5ddfd96` and `not-ready` at HEAD.

## 2. Host annotations are never lost

The reviewer probed end to end, with an operator note, across these reports:
- malformed with no heading;
- empty;
- a thrown assessment;
- refused;
- cancelled;
- unindexed, with and without host checks;
- CRLF;
- indexed and not-ready.

In every case the annotations and D-028 reached `final.md`, and D-028 reached the plan summary. The annotations always sit in the preamble, never inside a section. A report with no heading cannot reach either insertion, because the host renders it or it passes the required-section check first.

## 3. Regressions

None. Clean LF, CRLF and lone-CR reports reach `ready`. Calibration and amendment land correctly. Floors 1 and 2 hold. Normalization runs before every consumer.

## Findings

**MEDIUM: an inline mention of the index marker truncates a section in the plan summary.**
- `nextSectionStart` (`report.ts:45`) uses an unanchored `indexOf("<!-- COSMO_QM_REPORT", start)`.
- Scenario: the finding ``- QM-1 the renderer emits `<!-- COSMO_QM_REPORT {} -->` unescaped`` followed by `- QM-2 …`. The summary's Findings section is cut off mid-QM-1, and QM-2 is lost.
- This breaks B-005 (finding IDs in the summary). `final.md` is complete, and the verdict is `not-ready`.
- Fix: anchor the marker to the start of a line, both here and in the after-index check.

**LOW: the CRLF-duplicate test cannot fail on the old code.** Build it from an LF report with `## Findings\r\n` appended.

**LOW (coverage fact):** removing normalization fails only the lone-CR test, because the `.trim()` in `headingLines` absorbs `\r` and the non-breaking space.

## Residuals

- The annotation and "Index unavailable." `replace` has no fallback if no heading exists. Unreachable today.
- The plan summary omits Live work and Workspace retained (codex rates this MEDIUM).
- `raw-final.md` stores normalized text.
- Hostile-only routes (D-027): U+2028/U+2029 line separators, newlines in paths or notes, and duplicate index comments.
