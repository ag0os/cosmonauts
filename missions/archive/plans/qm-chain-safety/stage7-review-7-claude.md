# Stage 7 review 7 — Claude subagent

Prompt: `stage7-review-7-prompt.md`. Reviewed `c815aa3..cd21033` (TASK-752 at `88f272d`). Condensed by the coordinator.

**Verdict: SHIP** for Stage 7.

1. **MEDIUM-1 and LOW-1 are RESOLVED.**
   - `sectionBodyStart` (`quality-review-report.ts:226-234`) matches `^## <heading>[ \t]*$`.
   - The three new run shapes (`quality-review-run.test.ts:1332-1334`, `:1385-1404`) fail on `c815aa3`. Removing the `^` anchor fails all three.
   - The rewritten repeated-Human-decisions case fails when the repeated-heading check (`report.ts:270`) is removed, which kills N1.
2. **Every verdict-path section lookup is anchored:** `visibleSectionBody`, `replaceSectionEntries`, `amendUnindexedQualityReviewReport` and `assessQualityReviewReport`. `quality-review-models.ts` has no section lookups.
3. **No regressions.**
   - A heading with trailing whitespace is found, and the unexpected-section check still blocks it (fail-safe).
   - A heading at end of file gives an empty body, so `ready` stays reachable.
   - The unindexed amend lands in the real sections.
   - The calibration rewrite leaves lookalikes untouched.
   - The QM test files pass 197/197.
4. **Floors 1 and 2:** no ordinary heading shape defeats them. Repeated `## ` headings, including ones inside code fences, block `ready`. CRLF fails safe.

## Findings

HIGH: none. MEDIUM: none.

- **LOW-1:** `renderPlanSummary` (`quality-review-run.ts:1644-1645`) still uses an unanchored `indexOf("## <heading>\n")`.
  - Given a Checks line ending in `## Findings`, the plan summary shows Checks leftovers under Findings and omits the real entries.
  - The verdict stays correct (`not-ready`), and the summary links the full report. This is display-only.
  - Fix: reuse the anchored lookup.

## Residuals

- The recorded D-031/D-032 text-recognition limits.
- Fail-safe over-blocking on trailing-whitespace or CRLF headings.
- `sectionBodyStart` builds its regex from unescaped heading names. This is safe for the current fixed list only.
- Hostile-only routes (D-027/D-028).
