# Stage 7 review 5 — Claude subagent

The prompt is `stage7-review-5-prompt.md`. The review covers `9117af1..5606790` (TASK-750 at `6733eae`).

Condensed by the coordinator: every finding, the disposition table and every residual are kept; probe paths are dropped.

**Verdict: SHIP.** TASK-750 implements D-032 as written.
- **Findings fails safe on every shape the reviewer tried,** except a duplicated `## Findings` heading (LOW-1).
- **No other ordinary shape yields a false `ready` or loses an ID.** Clean, all-out-of-range and evidenced Out-of-range dismissal reports reach `ready` in either reviewer order.
- **The named mutations are killed.** Setting the Findings condition to `false` makes 17 tests fail. Checking only the first raising lens makes 1 test fail.

## Findings

HIGH: none. MEDIUM: none.

- **LOW-1: A second `## Findings` section is never inspected.**
  - `report.ts:229-231` reads only the first heading, and `hasUnexpectedQualityReviewSectionContent` (`report.ts:258`) skips defined names.
  - Scenario: `## Findings` with `- None recorded.`, then a repeated `## Findings` with `- Q-1 P1 crash on empty list`. The result is `ready`.
  - A duplicated `## Human decisions` heading behaves the same way.
  - This breaks D-031 floor 1 and D-032. The shape is improbable and pre-existing.
- **LOW-2: Mutations that survive.**
  - M10: removing the `raisingLenses.length > 0` guard (`models.ts:224`).
  - M15: accepting any other-lens citation instead of the one the QM cited (`models.ts:233-234`).
  - Neither mutation is currently reachable, but no test pins either guard.
- **LOW-3: Two formatting choices make `ready` unreachable (fail-safe).**
  - `None.` or "No human decisions required." under Human decisions blocks `ready`, because the sentinel is named only for Findings (`report.ts:245`, `run.ts:951`).
  - Closing advice under its own `## Next steps` heading blocks `ready` (`report.ts:254`).
  - Fix: one prompt sentence.
- **LOW-4: The generalist prompt states the performance rule for P1 only.** `bundled/coding/prompts/reviewer.md:162` still says so.
- **LOW-5: A `ready` report can still show text in Findings.** An unsupported performance P1, filed by the QM under Out-of-range as P2, gets a host "capped at P2" note appended to Findings after the verdict (`run.ts:881`). The verdict does not change, but the note contradicts D-032 and TASK-750 AC #4, which put Out-of-range cap notes in Out-of-range.

## Dispositions of stage7-review-4 findings

| Item | Status | Evidence / mutation |
|---|---|---|
| Codex 1: indented sub-finding | RESOLVED | `run.ts:949`; M1 killed (17 tests); the run case fails at `9117af1` |
| Codex 2: cap rewrites Gates | RESOLVED | Section-scoped rewrite at `report.ts:82-107`; the test fails at `9117af1`; M16 killed |
| Codex 3: multiline dismissal evidence | RESOLVED | `models.ts:299`; M6 killed |
| Claude H-1: keyword and order closure | RESOLVED | Order-independent check at `models.ts:210-236`; M2, M5 and M11 killed. Both orders are covered in model tests; one order in run tests |
| Claude L-1: in-place cap failure | RESOLVED | `report.ts:96`, `run.ts:925-928`; M7 and M13 killed |
| Claude L-2: surviving mutations | RESOLVED / moot | The targeted code was removed; new survivors are listed in LOW-2 |
| Claude L-3: liveness | RESOLVED | Sentinel at `report.ts:245`; M4 killed |
| Claude L-4: old-passing test | Moot | Rewritten |
| Residual: extra `##` heading | RESOLVED | `report.ts:254-265`; M3 killed |
| Residual: P0 wording in prompts | PARTIAL | Security and UX are fixed; the generalist is not (LOW-4) |
| Residual: `F-1` matches `F-10` | RESOLVED | Exact equality at `models.ts:216` and `:232` |

## Checks

- **Mutations:** 18 run. 13 killed; M10 and M15 survive; M14 and M17 are equivalent; M9 is weak.
- **Old-code sensitivity:** 17 new or rewritten tests fail at `9117af1`.
- **Stages 1–6 and B-011:** no regression.
- **Gates:**
  - The changed-scope audit (merge-base `29fc0ce`, committed baselines) passes with 0 issues.
  - Typecheck and Biome are clean.
  - The QM test files pass 187/187.
  - The full suite was not run.

## Residuals

- **D-031 recorded limits:** measurement-looking code accepted as a measurement; the QM repeating same-lens evidence; lowercase `p1` or "high priority" is not capped; performance findings raised by non-performance lenses are not capped.
- **D-032 recorded limits:** an in-range finding moved to Out-of-range reaches `ready`. So does a sub-finding riding an evidenced Out-of-range dismissal, and so does a second open copy of an ID beside its Out-of-range dismissal.
- **Fail-safe over-blocking:**
  - "closed-form" or "will be resolved" in an observation raises a human item.
  - So does `**F-1**:` followed by `dismissed`.
  - With `*` or numbered bullets in Out-of-range, the ID is carried over.
- **Uninspected sections:** a QM-own finding filed under Reviewed or Gates is not inspected.
- **Hostile-only (D-027/D-028):** fabricated or colluding evidence, crafted matching text, steered completion order, and host checks executing reviewed code.
