---
id: TASK-750
title: >-
  Stage 7 remediation D - D-032 fail-safe Findings, dismissals only in
  Out-of-range
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-749
createdAt: '2026-09-24T17:50:30.681Z'
updatedAt: '2026-09-24T18:04:45.236Z'
---

## Description

Implement plan **D-032**, amend-on-record 2026-09-24. Read it in `missions/plans/qm-chain-safety/plan.md` together with D-031.

It answers the verified findings in `missions/plans/qm-chain-safety/stage7-review-4-codex.md` (1–3) and `stage7-review-4-claude.md` (H-1, L-1..L-3, plus the extra-heading and prompt residuals). Stage 7 reviews 3 and 4 showed that parsing closure inside Findings does not converge. D-032 replaces it with a rule that fails safe by construction.

**Simplify.** Remove the code that parses dismissals and closures in Findings; do not layer on top of it. Findings blocks `ready` whenever it has content, except the no-findings sentinel. The code should get smaller.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Binding ratified ground is INV-001..INV-005, D-018..D-023 and D-027..D-030.

Every new test must fail on the current code (`acda9d1`) or kill a named mutation. Say which in the test name or in a comment only where it is not obvious.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Findings is fail-safe (D-032; codex 1, Claude H-1): any `## Findings` content other than the sentinel `None recorded.` (with or without a bullet, case-insensitive) yields `not-ready` end to end, including a dismissal-worded entry, an indented sub-finding under a dismissal, keyword-bearing open entries (`still open`, `not resolved`, `closed prematurely`), blank-line and `###` shapes; the empty section and the sentinel still allow `ready`; tests fail if the host Findings condition is replaced with `false`.
- [x] #2 Dismissals are recognized only under Out-of-range observations and only when stated positively right after the leading ID (`dismissed`, `resolved` or `closed`); such an entry closes only with cited `closureEvidence` from a lens other than every lens that raised the ID, found on any line of the entry, independent of reviewer completion order; a dismissal that fails the check raises a human item; tested in both reviewer orders, including a self-closure echoed by another lens and a multiline dismissal whose evidence is not on the last line (codex 3, Claude H-1 order).
- [x] #3 Floor 2 is unchanged: a reviewer finding ID not present as the leading ID of a Findings or Out-of-range entry is carried over with a human item; reviewer-ID matching is bounded so `F-1` never matches `F-10` in reviewer text; tested.
- [x] #4 The P0/P1 cap rewrites every copy of an unsupported performance ID inside Findings and Out-of-range observations and never touches Gates or any other section (codex 2); a copy that cannot be rewritten in place (for example irregular whitespace after the bullet) raises a human item (Claude L-1); a cap on an Out-of-range copy is noted in Out-of-range observations, not in Findings; tested including the Gates-duplicate and two-Findings-copy cases.
- [x] #5 A `##` section outside the seven defined report sections that has content yields `not-ready` (Claude residual); tested.
- [x] #6 Prompts follow D-032: the QM prompt says to write `None recorded.` when there are no findings, to record evidenced dismissals only under Out-of-range observations with the dismissal word right after the ID and a `closureEvidence:` citation, and that any Findings content blocks ready; the security and UX reviewer prompts state the performance P0 or P1 rule where they state P1.
- [x] #7 Tests for superseded behavior (dismissals closing entries inside Findings) are removed or rewritten to D-032; no test still asserts that a Findings dismissal can reach `ready`.
- [x] #8 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
