# Stage 7 review 13 — Claude subagent

The prompt is `stage7-review-13-prompt.md`. The review covers `2af1dfc..20b0311` (TASK-758 at `9a45d1c`). Condensed by the coordinator.

**Verdict: SHIP.** There are no HIGH or MEDIUM findings.

## 1. Review-12 findings

Both are RESOLVED.
- **Line-bound rewrites:**
  - The `Verdict:` and `Reason:` rewrites use `[ \t]*` (`report.ts:358`, `:361`), and so does the verdict check at `:167`. No other `Verdict:`/`Reason:` match exists.
  - An empty `Verdict:` or `Reason:` keeps `## Checks` and the host check results.
- **Leading whitespace on the marker:**
  - Marker-start (`:49`) and malformed-marker (`:302`) accept leading whitespace.
  - Valid-index rules still require an unindented whole-line index.
- **Test sensitivity:**
  - 6 new tests fail on `2af1dfc`.
  - At HEAD, all 180 tests pass.

## 2. Tightened verdict match

- **Shapes that give `failed`:** a split `Verdict:`/`ready`, `**ready**`, or an indented verdict.
- **Shapes that stay `ready` and indexed:** a clean host-rendered report, a CRLF or NBSP report after normalization, and tabs around the verdict word.
- **Multi-line regexes:** none remain that rewrite or delete text.

## 3. Invariants

- **Indented marker inside a section:** it ends the section early. The text is moved rather than dropped, and `ready` is blocked.
- **No regression** to D-031 floors 1 and 2, D-025, D-026, D-028 or INV-003.

## Findings

- **LOW (test gap only):** the three new end-to-end "empty Reason" tests (`run.test.ts:~2609`) also pass on `2af1dfc`. On the full path, the `Index unavailable.` notice sits before the marker and shields it. Only the unit tests guard against a return of `\s*`.

## Residuals

- The public run path without host checks.
- The generic reason given for a malformed marker.
- The D-031/D-032 recorded limits.
- Hostile-only routes (D-027).
