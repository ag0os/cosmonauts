---
id: TASK-754
title: Stage 7 remediation H - heading scan at end of file; lifecycle whitespace test
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-753
createdAt: '2026-09-24T19:32:53.309Z'
updatedAt: '2026-09-24T19:39:21.772Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-8-codex.md` (MEDIUM) and `stage7-review-8-claude.md` (LOW).

`hasUnexpectedQualityReviewSectionContent` scans headings with `/^## ([^\n]+)\n/gm`. That pattern requires a newline after the heading, so a final bare `## Findings` at end of file is not seen. A duplicate defined heading appended at EOF can therefore pass as `ready`, and calibration then removes it. This contradicts D-032's duplicated-sections rule.

Match headings at end of line or end of input, using a multiline `$`. Keep the change minimal.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 A duplicate defined heading as the last line of the report with no trailing newline (for example a second bare `## Findings` at EOF, including after the report index comment) yields `not-ready` end to end with host checks, and no calibration rewrite removes it silently; the test fails on the current code.
- [x] #2 The lifecycle test "keeps a clean report ready with trailing whitespace on a defined heading" runs with `hostChecks: true` and `gateState: "completed-bound"` so it reaches the host ready check, and fails if the trailing-whitespace stripping in the unexpected-section scan is removed.
- [x] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
