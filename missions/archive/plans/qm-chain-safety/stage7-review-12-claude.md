# Stage 7 review 12 — Claude subagent

Prompt: `stage7-review-12-prompt.md`. Reviewed `571bb13..5f6e97f` (TASK-757 at `4ceb768`). Condensed by the coordinator.

**Verdict: SHIP.** There are no HIGH or MEDIUM findings.

1. **The review-11 HIGH is RESOLVED.**
   - Any line starting with `<!-- COSMO_QM_REPORT` that is not exactly one whole-line index counts as unexpected content (`report.ts:301-306`). This blocks `ready` through `run.ts:960` and makes the index unavailable (`report.ts:203`).
   - Sections now end at any marker line (`report.ts:48-52`), so neither calibration nor `amendUnindexed` removes the marker line or its suffix.
   - The same-line suffix, trailing whitespace and unclosed marker cases all come out `not-ready` with their text kept. All 6 new tests fail on `571bb13`.
   - A marker line inside a Findings continuation also blocks `ready`.
2. **The index format holds.**
   - The host renderer always writes the index as a whole line.
   - The index stays available when report text contains `\n`, `-->`, a whole-line marker copy, U+2028, CRLF or a non-breaking space.
   - QM reports never carry an index.
   - No ordinary shape loses the index, drops a finding or produces a false `ready`.
3. **The preamble helper is sound.** It inserts before the first heading or the first marker line, and appends otherwise, so a notice never lands inside a section. Every verdict path passes through `appendFinalAnnotations` before the summary extraction.
4. **Regressions:** none against D-031 floors 1 and 2, D-025, D-026, D-028 or INV-003. The change only ever blocks `ready` more often.

## Findings

- **LOW: an indented index line reaches `ready`.**
  - `  <!-- COSMO_QM_REPORT {...} --> F-9 crash` escapes, because both regexes are anchored at column 0 (`report.ts:49`, `:302`).
  - This is a regression from `2d1f305`, already present at `571bb13`.
  - It is improbable: the QM is never told about the index.
  - Fix: `^[ \t]*` in both regexes.
- **LOW (pre-existing): stray prose in the Reviewer models section of an unindexed report is dropped** by the section replacement (`report.ts:368`, `:375`). Floor 2 still protects reviewer finding IDs; only the QM's own prose is lost.

## Residuals

- A malformed marker blocks `ready` with only the generic reason.
- The public run port without host checks.
- Hostile-only routes (D-027).
