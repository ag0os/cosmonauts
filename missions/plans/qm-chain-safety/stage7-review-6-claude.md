# Stage 7 review 6 — Claude subagent

Prompt: `stage7-review-6-prompt.md`. Reviewed `2d3dd4c..2c11b17` (TASK-751 at `7ed6c05`). Condensed by the coordinator; findings, dispositions and verdict are kept.

**Verdict: DO-NOT-SHIP-YET.** One pre-existing floor-1 gap remains, with a one-line fix. TASK-751 closes every review-5 item. The QM files pass 194/194, and each new test fails on `2d3dd4c` or kills a named mutation.

## Findings

**MEDIUM-1: heading lookup is by substring, so a lookalike heading hides the real section** (floor 1, D-032, D-025).
- **Where:** `quality-review-report.ts:229-230`. `visibleSectionBody` uses `markdown.indexOf("## Findings\n")`, which is not anchored to the start of a line.
- **What matches first:** a `### Findings` or `#### Human decisions` subheading, or any line ending in `## Findings`.
- **Who reads the wrong section:** every consumer of `visibleSectionBody`. That covers `hasQualityReviewSectionContent`, the Findings and Human decisions checks in `hostResultsBlockReady` (`run.ts:956-958`), the entry parsers, and the cap rewrite.
- **Why no other check catches it:** the required-heading check (`report.ts:117`) is anchored, so it passes. The unexpected-section check only matches `^## `.
- **Accidental scenarios:**
  - End to end in a scratch copy: a Checks line `- pending; details under ## Findings`, followed by a real Findings entry `- F-77 P1 QM-own crash`, gives `Verdict: ready`.
  - At predicate level: a `### Findings` subsection under Gates hides real Findings. A `#### Human decisions` under Checks hides a real QM human decision.
- **Floor 2 holds.** Reviewer IDs are carried over as human items. The gap affects only QM-own findings and QM-written human decisions.
- **Fix:** an anchored multiline match `^## <heading>[ \t]*$`, plus run-level shape tests.

**LOW-1: the "repeated Human decisions" run test doesn't exercise repetition** (`quality-review-run.test.ts:1331-1334`). The first Human decisions section already has content, so the test passes on the old code and does not kill mutation N1. The report-level test and the "repeated Findings" run case do pin the fix.

## Dispositions of stage7-review-5 findings

| Item | Status |
|---|---|
| Codex 1 / Claude LOW-1: repeated heading | RESOLVED (`report.ts:257-262`); 3 tests fail on `2d3dd4c`; N1 killed |
| Codex 2: non-performance-lens P0 | Recorded limit under the amended D-032; prompt done (`reviewer.md:162`) |
| Claude LOW-2: M10, M15 | RESOLVED (`models.test.ts:453`, `:470`) |
| Claude LOW-3: sentinel and advice placement | RESOLVED in the prompt; other wordings still block, which is fail-safe |
| Claude LOW-4: generalist P1-only | RESOLVED |
| Claude LOW-5: cap note in Findings | RESOLVED (`run.ts:912-920`, `models.ts:269`); N2 and N3 killed |

## Checks

- **Mutations:** all killed except M9 (weak) and M14/M17 (equivalent).
- **Floor shapes:** all behave per D-032 except MEDIUM-1.
- **Reachability:** clean and out-of-range-only reports reach `ready`.
- **Regressions:** none in B-011 or Stages 1–6.
- **Gates:** the changed-scope audit against merge-base `29fc0ce` passes (0/0/0); `tsc` and Biome are clean.

## Residuals

- The D-031/D-032 recorded text-recognition limits.
- Fail-safe over-blocking on other "none" wordings.
- QM-own findings filed under Reviewed or Gates.
- Hostile-only routes (D-027/D-028).
