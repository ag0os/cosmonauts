---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: Stage 7 focused, bfff951..(TASK-747 fde1063)
date: 2026-09-24
---

# Stage 7 review 2 — Claude reviewer (coordinator condensation)

**Verdict: SHIP for Stage 7.** Every stage7-review-1 finding is RESOLVED. With the TASK-747 code rolled back, 11 of the new tests fail, and the mutation run caught 14 of 15. There are no HIGH findings. Both MEDIUMs are fail-safe: neither produces a false `ready`.

## MEDIUM

- **Out-of-range reviewer findings are treated as omitted** (`quality-review-models.ts:155` reads only `## Findings`).
  - A pre-existing finding correctly placed under `## Out-of-range observations` gets a second "omitted" copy in Findings, plus a human item.
  - An evidenced dismissal must also sit in Findings, which blocks `ready`.
  - So once any reviewer raises anything, `ready` becomes unreachable.
  - The prompt's "carry every ID" sentence also conflicts with the rule to list out-of-range items separately.
  - Breaks B-005 and AC-008, and hurts liveness.
- **An unsupported performance P0 is not capped** (`models.ts:252` checks only P1). Breaks B-010 ("otherwise at most P2").

## LOW

- The measured-cost check still accepts some code lines: a constant followed by a "ms" comment, a test title, or a config line.
- The "unconfigured diversity appears once" test cannot fail. It fails on neither the old code nor the dedup mutation.
- The unmapped-P1 check reads the first ID-shaped token on a line, so `TASK-747 …` produces a spurious item. This is fail-safe.
- When a capped indexed report is rewritten, a multiline finding keeps only its first line.

## Holding

- B-011, D-019, D-025, D-026, and the base-owned runtime and config.
- The audit passes (0 issues), and 178 QM tests pass.
- Both models resolve and are in different families.
- execution-liveness AC-015, AC-016 and AC-018 are untouched.

## Hostile-only residuals

- fake measured-cost or closure quotes;
- lenses colluding to close each other's findings;
- `full.diff` re-read without re-checking its digest;
- QM text crafted to game the ID heuristics;
- D-028.
