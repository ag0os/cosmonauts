# Stage 7 review 11 — Claude subagent

The prompt is `stage7-review-11-prompt.md`. The review covers `2d1f305..296db49` (TASK-756 at `9f3340c`). Condensed by the coordinator.

**Verdict: SHIP.** No HIGH, MEDIUM or LOW findings.

## 1. Review-10 items: all RESOLVED

Every new test fails on `2d1f305`:

- The plan summary carries the host disclosures (`run.ts:1667-1672`).
- `Index unavailable.` goes through the preamble helper (`report.ts:374`).
- The inline marker no longer truncates sections, because the index is recognized only as a whole line (`report.ts:48-52`, `:177`, `:219`, `:312`).
- The preamble helper has a fallback when there is no heading (`report.ts:55-64`).

The rebuilt CRLF-duplicate test passes on literal `5ddfd96`, but it fails under the TASK-756 AC #5 mutation, where it reaches a false `ready`.

## 2. Index format

- The host renderer always emits the index as one whole line. `JSON.stringify` escapes newlines and carriage returns.
- The greedy match to end of line handles `-->` inside the JSON better than the old lazy match did.
- The QM does not write an index, so ordinary QM reports were already unindexed.
- The change only ever surfaces text; it never hides it.

## 3. Preamble helper

- It never lands inside a section.
- It handles every heading/index combination.
- An indexed report stays indexed after insertion.
- Summary extraction matches the helper's placement on every verdict path.

## 4. Regressions

None against D-031 floors 1 and 2, D-025, D-026, D-028 or INV-003.

## Residuals

- An index line with trailing whitespace becomes unindexed, and text after it is not treated as after-index content. The host never writes this shape.
- The `Index unavailable.` notice is skipped when that phrase is quoted anywhere in the report. This predates TASK-756.
- The summary copies QM-written `Live work:` lines from the preamble. This is display-only.
- Hostile-only routes (D-027): U+2028 and U+2029 line separators, newlines in paths, and deliberately placed index comments.
